import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  accessTokenPrefix,
  resolveMarketplacePayerEmail,
  userMessageForMpCode,
} from "../_shared/mp-errors.ts";
import { corsHeaders, resolveSellerAccessToken } from "../_shared/mp-oauth.ts";

type BrickFormData = {
  token?: string;
  issuer_id?: string | number;
  payment_method_id?: string;
  transaction_amount?: number | string;
  installments?: number | string;
  payer?: {
    email?: string;
    identification?: { type?: string; number?: string };
    first_name?: string;
  };
  [key: string]: unknown;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Método no permitido" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const restaurantId = typeof body.restaurant_id === "string" ? body.restaurant_id.trim() : "";
    const orderId = typeof body.order_id === "string" ? body.order_id.trim() : "";
    const guestId = typeof body.guest_id === "string" ? body.guest_id.trim() : "";
    const chargeId = typeof body.charge_id === "string" ? body.charge_id.trim() : "";
    const amount = Number(body.amount);
    const idempotencyKey = typeof body.idempotency_key === "string" ? body.idempotency_key.trim() : "";
    const preferenceId = typeof body.preference_id === "string" ? body.preference_id.trim() : "";
    const formData = normalizeBrickFormData(body.form_data);

    if (!restaurantId || !orderId || !guestId || !Number.isFinite(amount) || amount <= 0) {
      return new Response(JSON.stringify({ error: "Parámetros de pago incompletos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!formData.token || !formData.payment_method_id) {
      return new Response(JSON.stringify({ error: "form_data incompleto (token / payment_method_id)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: config, error: configError } = await supabaseAdmin
      .from("payment_configs")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .eq("provider", "mercadopago")
      .maybeSingle();

    if (configError) throw configError;
    if (!config) {
      return new Response(JSON.stringify({ error: "Mercado Pago no configurado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resolved = await resolveSellerAccessToken(config, supabaseAdmin);
    let { accessToken, checkoutEnv, tokenSource } = resolved;

    // En sandbox usamos el token de la plataforma para evitar error 2034 de marketplace.
    // En producción usamos el token OAuth del vendedor (dinero va al restaurante).
    if (checkoutEnv === "sandbox") {
      const platformTestToken = Deno.env.get("MERCADOPAGO_PLATFORM_TEST_ACCESS_TOKEN")?.trim();
      if (platformTestToken) {
        accessToken = platformTestToken;
        tokenSource = "platform_test_token";
      }
    }
    const webhookBase = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/mercadopago-webhook`;
    const notificationUrl = `${webhookBase}?source_news=webhooks`;

    const brickAmount = Number(formData.transaction_amount);
    const transactionAmount = Number.isFinite(brickAmount) && brickAmount > 0
      ? parseFloat(brickAmount.toFixed(2))
      : parseFloat(amount.toFixed(2));

    const sellerTokenKind = accessTokenPrefix(accessToken);
    const sandboxPayment =
      config.oauth_test_mode === true ||
      checkoutEnv === "sandbox" ||
      sellerTokenKind === "TEST";
    const payerEmail = resolveMarketplacePayerEmail(guestId, formData.payer?.email, {
      sandbox: sandboxPayment,
    });
    const payer = buildPayerPayload(formData, payerEmail);

    const paymentBody: Record<string, unknown> = {
      transaction_amount: transactionAmount,
      token: formData.token,
      description: `Pago mesa SplitMe`,
      installments: Number(formData.installments ?? 1) || 1,
      payment_method_id: formData.payment_method_id,
      // Brick + marketplace: comisión en marketplace_fee de la preferencia (no application_fee).
      // @see https://www.mercadopago.com.ar/developers/en/docs/checkout-bricks/payment-brick/payment-submission/wallet-credits
      // @see https://www.mercadopago.com.ar/developers/en/reference/online-payments/checkout-api-payments/create-payment/post (4039 si fee <= 0)
      external_reference: `${orderId}|${guestId}${chargeId ? `|${chargeId}` : ""}`.substring(0, 256),
      notification_url: notificationUrl,
      metadata: {
        restaurant_id: restaurantId,
        order_id: orderId,
        guest_id: guestId,
        ...(chargeId ? { charge_id: chargeId } : {}),
        ...(preferenceId ? { preference_id: preferenceId } : {}),
      },
      payer,
    };

    if (sandboxPayment) {
      paymentBody.binary_mode = true;
    }

    if (formData.issuer_id != null && formData.issuer_id !== "") {
      paymentBody.issuer_id = String(formData.issuer_id);
    }

    console.info("[mercadopago-create-payment] Creating payment:", {
      checkoutEnv,
      tokenSource,
      sellerTokenKind,
      sandboxPayment,
      transactionAmount,
      payment_method_id: formData.payment_method_id,
      payerEmail,
      preferenceId: preferenceId || null,
      sellerUserId: config.user_account ?? null,
      oauth_test_mode: config.oauth_test_mode === true,
    });

    const idempotency = idempotencyKey || crypto.randomUUID();

    const payRes = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotency,
      },
      body: JSON.stringify(paymentBody),
    });

    const payment = await payRes.json().catch(() => ({}));
    if (!payRes.ok) {
      const cause = Array.isArray(payment?.cause) ? payment.cause[0] : null;
      const mpMessage =
        cause?.description || cause?.message || payment?.message || payRes.statusText;
      console.error("[mercadopago-create-payment] MP error:", {
        status: payRes.status,
        mpMessage,
        payment,
      });
      const mpCode = cause?.code != null ? String(cause.code) : undefined;
      const mpCauses = Array.isArray(payment?.cause) ? payment.cause : [];
      return new Response(JSON.stringify({
        error: userMessageForMpCode(mpCode, mpMessage),
        status: payment?.status,
        status_detail: payment?.status_detail || mpCode,
        mp_code: mpCode,
        mp_causes: mpCauses,
        mp_raw_message: payment?.message ?? null,
      }), {
        status: payRes.status >= 400 && payRes.status < 600 ? payRes.status : 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      id: payment.id,
      status: payment.status,
      status_detail: payment.status_detail,
      external_reference: payment.external_reference,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[mercadopago-create-payment] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Error interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

function normalizeBrickFormData(raw: unknown): BrickFormData {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const nested = obj.formData ?? obj.paymentFormData;
  if (nested && typeof nested === "object") {
    return nested as BrickFormData;
  }
  return obj as BrickFormData;
}

function buildPayerPayload(
  formData: BrickFormData,
  email: string,
): Record<string, unknown> {
  const payer: Record<string, unknown> = { email };
  const cardholder = typeof formData.payer?.first_name === "string"
    ? formData.payer.first_name.trim()
    : "";
  if (cardholder) payer.first_name = cardholder;

  const id = formData.payer?.identification;
  if (id?.type && id.number != null && String(id.number).trim() !== "") {
    payer.identification = {
      type: id.type,
      number: String(id.number).trim(),
    };
  }

  return payer;
}

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
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
    const amount = Number(body.amount);
    const idempotencyKey = typeof body.idempotency_key === "string" ? body.idempotency_key.trim() : "";
    const formData = (body.form_data ?? {}) as BrickFormData;

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

    const { accessToken } = await resolveSellerAccessToken(config, supabaseAdmin);
    const webhookBase = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/mercadopago-webhook`;
    const notificationUrl = `${webhookBase}?source_news=webhooks`;

    const payerEmail = formData.payer?.email?.trim()
      || Deno.env.get("MERCADOPAGO_SANDBOX_BUYER_EMAIL")?.trim()
      || "test_user_123456@testuser.com";

    const paymentBody: Record<string, unknown> = {
      transaction_amount: parseFloat(amount.toFixed(2)),
      token: formData.token,
      description: `Pago mesa SplitMe`,
      installments: Number(formData.installments ?? 1) || 1,
      payment_method_id: formData.payment_method_id,
      application_fee: 0,
      external_reference: `${orderId}|${guestId}`.substring(0, 256),
      notification_url: notificationUrl,
      metadata: {
        restaurant_id: restaurantId,
        order_id: orderId,
        guest_id: guestId,
      },
      payer: {
        email: payerEmail,
        identification: formData.payer?.identification ?? undefined,
        first_name: formData.payer?.first_name ?? undefined,
      },
    };

    if (formData.issuer_id) paymentBody.issuer_id = formData.issuer_id;

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
      console.error("[mercadopago-create-payment] MP error:", payment);
      return new Response(JSON.stringify({
        error: payment?.message || payment?.cause?.[0]?.description || "Error al crear pago",
        status: payment?.status,
        status_detail: payment?.status_detail,
      }), {
        status: payRes.status,
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

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  accessTokenPrefix,
  detectEnvMismatch,
  getMpMarketplaceId,
  publicKeyPrefix,
  resolveMarketplacePayerEmail,
} from "../_shared/mp-errors.ts";
import {
  corsHeaders,
  getPlatformPublicKey,
  resolveSellerAccessToken,
} from "../_shared/mp-oauth.ts";

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
    const description = typeof body.description === "string" ? body.description.trim() : "Pago SplitMe";

    if (!restaurantId || !orderId || !guestId || !Number.isFinite(amount) || amount <= 0) {
      return new Response(JSON.stringify({ error: "restaurant_id, order_id, guest_id y amount son requeridos" }), {
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
      return new Response(JSON.stringify({ error: "Mercado Pago no configurado para este restaurante" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resolved = await resolveSellerAccessToken(
      config,
      supabaseAdmin,
    );
    let { accessToken, checkoutEnv, tokenSource } = resolved;

    // En sandbox el pago se procesa con el token TEST de la plataforma. La preferencia
    // debe crearse con el mismo collector/token para que Payment Brick no rechace el pago.
    if (checkoutEnv === "sandbox") {
      const platformTestToken = Deno.env.get("MERCADOPAGO_PLATFORM_TEST_ACCESS_TOKEN")?.trim();
      if (platformTestToken) {
        accessToken = platformTestToken;
        tokenSource = "platform_test_token";
      }
    }

    const publicKey = getPlatformPublicKey();
    const envMismatch = detectEnvMismatch(publicKey, accessToken);
    const webhookBase = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/mercadopago-webhook`;
    const notificationUrl = `${webhookBase}?source_news=webhooks`;

    const marketplaceId = getMpMarketplaceId();
    const unitPrice = parseFloat(amount.toFixed(2));
    const preferenceBody: Record<string, unknown> = {
      items: [{
        title: description.substring(0, 127),
        quantity: 1,
        unit_price: unitPrice,
        currency_id: "ARS",
      }],
      marketplace_fee: 0,
      external_reference: `${orderId}|${guestId}${chargeId ? `|${chargeId}` : ""}`.substring(0, 256),
      notification_url: notificationUrl,
      metadata: {
        restaurant_id: restaurantId,
        order_id: orderId,
        guest_id: guestId,
        ...(chargeId ? { charge_id: chargeId } : {}),
      },
    };

    // Marketplace solo en producción — en sandbox el clientId es de producción y MP rechaza la combinación.
    if (marketplaceId && checkoutEnv === "production") {
      preferenceBody.marketplace = marketplaceId;
    }

    if (config.oauth_test_mode === true) {
      preferenceBody.binary_mode = true;
    }

    const prefRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(preferenceBody),
    });

    const pref = await prefRes.json().catch(() => ({}));
    if (!prefRes.ok) {
      console.error("[mercadopago-create-brick-config] MP error:", pref);
      return new Response(JSON.stringify({ error: pref?.message || "Error al crear preferencia" }), {
        status: prefRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      public_key: publicKey,
      preference_id: pref.id,
      amount: parseFloat(amount.toFixed(2)),
      checkout_env: checkoutEnv,
      token_source: tokenSource,
      seller_token_prefix: accessTokenPrefix(accessToken),
      platform_public_key_prefix: publicKeyPrefix(publicKey),
      env_mismatch: envMismatch,
      oauth_test_mode: config.oauth_test_mode === true,
      seller_user_id: config.user_account ?? null,
      marketplace_id: marketplaceId,
      marketplace: true,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[mercadopago-create-brick-config] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Error interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

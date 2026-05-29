import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  corsHeaders,
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
    const preferences = body.preferences;

    if (!restaurantId || !preferences || typeof preferences !== "object") {
      return new Response(JSON.stringify({ error: "restaurant_id y preferences son requeridos" }), {
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

    const { accessToken, checkoutEnv, tokenSource } = await resolveSellerAccessToken(
      config,
      supabaseAdmin,
    );
    const oauthTestMode = config.oauth_test_mode === true;
    const redirectToSandbox = !oauthTestMode && checkoutEnv === "sandbox";

    const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(preferences),
    });

    const pref = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("[mercadopago-create-preference] MP error:", pref);
      return new Response(
        JSON.stringify({
          error: pref?.message || response.statusText || "Error al crear preferencia",
          checkoutEnv,
          tokenSource,
        }),
        {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const paymentUrl = redirectToSandbox
      ? (pref.sandbox_init_point || pref.init_point)
      : pref.init_point;

    let checkoutHost = "";
    try {
      checkoutHost = paymentUrl ? new URL(paymentUrl).hostname : "";
    } catch {
      checkoutHost = "";
    }

    console.log("[mercadopago-create-preference]", {
      restaurantId,
      preferenceId: pref.id,
      checkoutEnv,
      tokenSource,
      redirectToSandbox,
      oauthTestMode,
      checkoutHost,
      init_point: pref.init_point,
      sandbox_init_point: pref.sandbox_init_point,
    });

    return new Response(
      JSON.stringify({
        preference_id: pref.id,
        payment_url: paymentUrl,
        checkout_host: checkoutHost,
        checkout_env: checkoutEnv,
        token_source: tokenSource,
        oauth_test_mode: oauthTestMode,
        redirect_to_sandbox: redirectToSandbox,
        init_point: pref.init_point,
        sandbox_init_point: pref.sandbox_init_point,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("[mercadopago-create-preference] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Error interno" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

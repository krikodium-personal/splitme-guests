import "jsr:@std/dotenv/load";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  assertRestaurantPaymentAccess,
  buildMpAuthorizationUrl,
  corsHeaders,
  createOAuthState,
  getMpConfig,
  sanitizeReturnUrl,
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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { restaurant_id, return_url, test_mode } = await req.json();
    if (!restaurant_id) {
      return new Response(JSON.stringify({ error: "restaurant_id es requerido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "").trim();
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Sesión inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    await assertRestaurantPaymentAccess(supabaseAdmin, user.id, restaurant_id);

    const { clientId, redirectUri, stateSecret } = getMpConfig();
    // Production APP_USR tokens by default. Pass test_mode: true for sandbox TEST credentials.
    const useTestToken = test_mode === true;
    const fallbackReturn = Deno.env.get("MERCADOPAGO_ADMIN_RETURN_URL")?.trim()
      || "http://localhost:3002/settings?tab=payments";

    const state = await createOAuthState(
      {
        restaurant_id,
        user_id: user.id,
        return_url: sanitizeReturnUrl(return_url, fallbackReturn),
        test_token: useTestToken,
        exp: Date.now() + 10 * 60 * 1000,
        nonce: crypto.randomUUID(),
      },
      stateSecret,
    );

    const authorization_url = buildMpAuthorizationUrl(clientId, redirectUri, state);

    return new Response(JSON.stringify({
      authorization_url,
      test_mode: useTestToken,
      oauth_token_type: useTestToken ? "sandbox_test" : "production",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err?.message || "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

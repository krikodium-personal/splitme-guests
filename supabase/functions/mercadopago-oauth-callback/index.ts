import "jsr:@std/dotenv/load";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  exchangeMpOAuthCode,
  getMpConfig,
  parseOAuthState,
  refreshMpOAuthToken,
  validateMpAccessToken,
} from "../_shared/mp-oauth.ts";
import { encryptSecret } from "../_shared/mp-crypto.ts";

function redirectWithMessage(returnUrl: string, params: Record<string, string>): Response {
  const url = new URL(returnUrl);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return Response.redirect(url.toString(), 302);
}

Deno.serve(async (req) => {
  try {
    const requestUrl = new URL(req.url);
    const code = requestUrl.searchParams.get("code");
    const state = requestUrl.searchParams.get("state");
    const mpError = requestUrl.searchParams.get("error");

    const fallbackReturn = Deno.env.get("MERCADOPAGO_ADMIN_RETURN_URL")?.trim()
      || "http://localhost:3002/settings?tab=payments";

    if (mpError) {
      return redirectWithMessage(fallbackReturn, {
        tab: "payments",
        mp_error: mpError,
      });
    }

    if (!code || !state) {
      return redirectWithMessage(fallbackReturn, {
        tab: "payments",
        mp_error: "missing_code_or_state",
      });
    }

    const { redirectUri, stateSecret } = getMpConfig();
    const statePayload = await parseOAuthState(state, stateSecret);
    const returnUrl = statePayload.return_url || fallbackReturn;
    const primaryIsTest = statePayload.test_token;

    const tokenData = await exchangeMpOAuthCode(
      code,
      redirectUri,
      primaryIsTest,
      statePayload.code_verifier,
    );

    if (primaryIsTest && !tokenData.access_token.startsWith("TEST-")) {
      console.warn(
        "[mp-oauth-callback] test_token solicitado pero access_token primario no empieza con TEST-:",
        tokenData.access_token.substring(0, 12),
      );
    }

    let prodAccessToken = primaryIsTest ? null : tokenData.access_token;
    let prodPublicKey = primaryIsTest ? null : (tokenData.public_key || null);
    let testAccessToken = primaryIsTest ? tokenData.access_token : null;
    let testPublicKey = primaryIsTest ? (tokenData.public_key || null) : null;

    if (tokenData.refresh_token) {
      try {
        const complementary = await refreshMpOAuthToken(
          tokenData.refresh_token,
          !primaryIsTest,
          redirectUri,
        );
        if (primaryIsTest) {
          prodAccessToken = complementary.access_token;
          prodPublicKey = complementary.public_key || null;
        } else {
          testAccessToken = complementary.access_token;
          testPublicKey = complementary.public_key || null;
        }
      } catch (refreshErr) {
        console.warn(
          "[mp-oauth-callback] No se pudieron obtener credenciales complementarias:",
          refreshErr?.message || refreshErr,
        );
      }

      if (primaryIsTest) {
        try {
          const testComplementary = await refreshMpOAuthToken(
            tokenData.refresh_token,
            true,
            redirectUri,
          );
          if (testComplementary.access_token?.startsWith("TEST-")) {
            testAccessToken = testComplementary.access_token;
            testPublicKey = testComplementary.public_key || null;
          }
        } catch (refreshErr) {
          console.warn(
            "[mp-oauth-callback] No se pudieron obtener credenciales TEST complementarias:",
            refreshErr?.message || refreshErr,
          );
        }
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: existingConfig } = await supabaseAdmin
      .from("payment_configs")
      .select("id, token_cbu_test, key_alias_test")
      .eq("restaurant_id", statePayload.restaurant_id)
      .eq("provider", "mercadopago")
      .maybeSingle();

    if (testAccessToken) {
      const testValidation = await validateMpAccessToken(testAccessToken);
      if (!testValidation.ok) {
        console.warn(
          "[mp-oauth-callback] token TEST de OAuth inválido; se conservan credenciales sandbox manuales si existen:",
          testValidation.message || testValidation.status,
        );
        testAccessToken = existingConfig?.token_cbu_test || null;
        testPublicKey = existingConfig?.key_alias_test || null;
      }
    }

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    const payload = {
      restaurant_id: statePayload.restaurant_id,
      token_cbu: await encryptSecret(prodAccessToken),
      key_alias: prodPublicKey,
      token_cbu_test: await encryptSecret(testAccessToken),
      key_alias_test: testPublicKey,
      oauth_test_mode: primaryIsTest,
      user_account: tokenData.user_id ? String(tokenData.user_id) : null,
      refresh_token: await encryptSecret(tokenData.refresh_token || null),
      oauth_connected_at: new Date().toISOString(),
      token_expires_at: expiresAt,
      oauth_requires_reconnect: false,
      provider: "mercadopago",
      is_active: true,
    };

    const configId = existingConfig?.id;

    if (configId) {
      const { error } = await supabaseAdmin
        .from("payment_configs")
        .update(payload)
        .eq("id", configId);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin.from("payment_configs").insert(payload);
      if (error) throw error;
    }

    return redirectWithMessage(returnUrl, {
      tab: "payments",
      mp_connected: "1",
      mp_user_id: payload.user_account || "",
    });
  } catch (err) {
    const fallbackReturn = Deno.env.get("MERCADOPAGO_ADMIN_RETURN_URL")?.trim()
      || "http://localhost:3002/settings?tab=payments";
    return redirectWithMessage(fallbackReturn, {
      tab: "payments",
      mp_error: encodeURIComponent(err?.message || "oauth_callback_failed"),
    });
  }
});

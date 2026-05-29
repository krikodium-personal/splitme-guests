const encoder = new TextEncoder();

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

function base64UrlEncode(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? encoder.encode(data) : data;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export type OAuthStatePayload = {
  restaurant_id: string;
  user_id: string;
  return_url: string;
  test_token: boolean;
  exp: number;
  nonce: string;
};

export async function createOAuthState(
  payload: OAuthStatePayload,
  secret: string,
): Promise<string> {
  const body = base64UrlEncode(JSON.stringify(payload));
  const key = await getHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `${body}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function parseOAuthState(
  state: string,
  secret: string,
): Promise<OAuthStatePayload> {
  const [body, signature] = state.split(".");
  if (!body || !signature) throw new Error("Estado OAuth inválido");

  const key = await getHmacKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlDecode(signature),
    encoder.encode(body),
  );
  if (!valid) throw new Error("Estado OAuth no verificado");

  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as OAuthStatePayload;
  if (!payload.restaurant_id || !payload.user_id || !payload.return_url || !payload.exp) {
    throw new Error("Estado OAuth incompleto");
  }
  if (Date.now() > payload.exp) throw new Error("Estado OAuth expirado");

  return payload;
}

export function getMpConfig() {
  const clientId = Deno.env.get("MERCADOPAGO_CLIENT_ID")?.trim();
  const clientSecret = Deno.env.get("MERCADOPAGO_CLIENT_SECRET")?.trim();
  const redirectUri = Deno.env.get("MERCADOPAGO_OAUTH_REDIRECT_URI")?.trim();
  const stateSecret = Deno.env.get("MERCADOPAGO_OAUTH_STATE_SECRET")?.trim();
  const sandboxByDefault = Deno.env.get("MERCADOPAGO_OAUTH_TEST_MODE") === "true";

  if (!clientId || !clientSecret || !redirectUri || !stateSecret) {
    throw new Error("OAuth de Mercado Pago no configurado en el servidor");
  }

  return { clientId, clientSecret, redirectUri, stateSecret, sandboxByDefault };
}

export async function validateMpAccessToken(accessToken: string): Promise<{
  ok: boolean;
  status: number;
  userId?: number;
  message?: string;
}> {
  const response = await fetch("https://api.mercadopago.com/users/me", {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: data?.message || data?.error || response.statusText,
    };
  }
  return { ok: true, status: response.status, userId: data?.id };
}

export async function exchangeMpOAuthCode(
  code: string,
  redirectUri: string,
  testToken: boolean,
): Promise<{
  access_token: string;
  refresh_token?: string;
  public_key?: string;
  user_id?: number;
  expires_in?: number;
}> {
  const { clientId, clientSecret } = getMpConfig();

  const body: Record<string, string> = {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  };
  // test_token=true → sandbox TEST credentials for Checkout Pro sandbox_init_point.
  if (testToken) body.test_token = "true";

  const response = await fetch("https://api.mercadopago.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.message || data?.error || response.statusText;
    throw new Error(`Mercado Pago OAuth: ${message}`);
  }

  if (!data.access_token) throw new Error("Mercado Pago no devolvió access_token");
  return data;
}

export async function refreshMpOAuthToken(
  refreshToken: string,
  testToken: boolean,
  redirectUri?: string,
): Promise<{
  access_token: string;
  refresh_token?: string;
  public_key?: string;
  live_mode?: boolean;
  expires_in?: number;
}> {
  const { clientId, clientSecret, redirectUri: defaultRedirectUri } = getMpConfig();

  const body: Record<string, string> = {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  };
  if (testToken) body.test_token = "true";
  const resolvedRedirectUri = redirectUri ?? defaultRedirectUri;
  if (resolvedRedirectUri) body.redirect_uri = resolvedRedirectUri;

  const response = await fetch("https://api.mercadopago.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.message || data?.error || response.statusText;
    throw new Error(`Mercado Pago OAuth refresh: ${message}`);
  }

  if (!data.access_token) throw new Error("Mercado Pago no devolvió access_token en refresh");
  return data;
}

export async function assertRestaurantPaymentAccess(
  supabaseAdmin: ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2").createClient>,
  userId: string,
  restaurantId: string,
) {
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("role, restaurant_id")
    .eq("id", userId)
    .single();

  if (error || !profile) throw new Error("Perfil no encontrado");
  if (profile.role === "super_admin") return;
  if (profile.role === "restaurant_admin" && profile.restaurant_id === restaurantId) return;
  throw new Error("No tenés permiso para configurar pagos de este restaurante");
}

export function buildMpAuthorizationUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    platform_id: "mp",
  });
  return `https://auth.mercadopago.com.ar/authorization?${params.toString()}`;
}

export function sanitizeReturnUrl(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}

export type CheckoutEnv = "sandbox" | "production_test_users" | "production";

export type PaymentConfigTokens = {
  id?: string;
  oauth_test_mode?: boolean | null;
  token_cbu?: string | null;
  token_cbu_test?: string | null;
  key_alias?: string | null;
  refresh_token?: string | null;
  token_expires_at?: string | null;
};

export type ResolvedCheckoutToken = {
  accessToken: string;
  checkoutEnv: CheckoutEnv;
  tokenSource: string;
};

type SupabaseAdmin = ReturnType<
  typeof import("https://esm.sh/@supabase/supabase-js@2").createClient
>;

async function persistRefreshedProdToken(
  supabaseAdmin: SupabaseAdmin | null,
  configId: string | undefined,
  refreshToken: string,
  refreshed: Awaited<ReturnType<typeof refreshMpOAuthToken>>,
): Promise<string | null> {
  const accessToken = refreshed.access_token?.trim();
  if (!accessToken?.startsWith("APP_USR-")) return null;

  if (supabaseAdmin && configId) {
    const { error } = await supabaseAdmin
      .from("payment_configs")
      .update({
        token_cbu: accessToken,
        key_alias: refreshed.public_key || undefined,
        refresh_token: refreshed.refresh_token || refreshToken,
        token_expires_at: refreshed.expires_in
          ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
          : undefined,
      })
      .eq("id", configId);
    if (error) {
      console.warn("[mp-oauth] No se pudo persistir token refrescado:", error.message);
    }
  }

  return accessToken;
}

async function refreshProdAccessToken(
  refreshToken: string,
  supabaseAdmin: SupabaseAdmin | null,
  configId?: string,
): Promise<string | null> {
  try {
    const refreshed = await refreshMpOAuthToken(refreshToken, false);
    return await persistRefreshedProdToken(supabaseAdmin, configId, refreshToken, refreshed);
  } catch (err) {
    console.warn("[mp-oauth] refresh APP_USR falló:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Resuelve el access token del vendedor para crear preferencias de Checkout Pro. */
export async function resolveSellerAccessToken(
  config: PaymentConfigTokens,
  supabaseAdmin: SupabaseAdmin | null = null,
): Promise<ResolvedCheckoutToken> {
  const sandboxMode = config.oauth_test_mode === true;
  const prodToken = config.token_cbu?.trim() || "";
  const testToken = config.token_cbu_test?.trim() || "";
  const refreshToken = config.refresh_token?.trim() || "";

  if (sandboxMode) {
    // MP: credenciales de producción del vendedor test + comprador test → www (no sandbox).
    if (prodToken.startsWith("APP_USR-")) {
      const validation = await validateMpAccessToken(prodToken);
      if (validation.ok) {
        return {
          accessToken: prodToken,
          checkoutEnv: "production_test_users",
          tokenSource: "token_cbu",
        };
      }
    }

    if (refreshToken) {
      const refreshed = await refreshProdAccessToken(refreshToken, supabaseAdmin, config.id);
      if (refreshed) {
        return {
          accessToken: refreshed,
          checkoutEnv: "production_test_users",
          tokenSource: "token_cbu_refreshed",
        };
      }
    }

    if (testToken) {
      console.warn(
        "[mp-oauth] oauth_test_mode sin APP_USR válido; fallback TEST- puede redirigir a sandbox.",
      );
      return {
        accessToken: testToken,
        checkoutEnv: "production_test_users",
        tokenSource: "token_cbu_test_fallback",
      };
    }

    throw new Error(
      "Modo sandbox activo pero no hay credenciales APP_USR del vendedor test. Reconectá OAuth en Admin → Settings.",
    );
  }

  if (prodToken.startsWith("TEST-")) {
    return { accessToken: prodToken, checkoutEnv: "sandbox", tokenSource: "token_cbu_test" };
  }

  if (prodToken.startsWith("APP_USR-")) {
    const validation = await validateMpAccessToken(prodToken);
    if (validation.ok) {
      return { accessToken: prodToken, checkoutEnv: "production", tokenSource: "token_cbu" };
    }
    if (refreshToken) {
      const refreshed = await refreshProdAccessToken(refreshToken, supabaseAdmin, config.id);
      if (refreshed) {
        return { accessToken: refreshed, checkoutEnv: "production", tokenSource: "token_cbu_refreshed" };
      }
    }
  }

  if (prodToken) {
    return { accessToken: prodToken, checkoutEnv: "production", tokenSource: "token_cbu" };
  }

  throw new Error("El token de acceso de Mercado Pago no está configurado.");
}

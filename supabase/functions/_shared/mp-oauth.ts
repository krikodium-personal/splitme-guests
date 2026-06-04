const encoder = new TextEncoder();

import { decryptSecret, encryptSecret } from "./mp-crypto.ts";

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
  code_verifier: string;
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
  if (!payload.code_verifier) throw new Error("Estado OAuth sin code_verifier (PKCE)");
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

/** Public key de la aplicación plataforma SplitMe (Payment Brick). */
export function getPlatformPublicKey(): string {
  const key = Deno.env.get("MERCADOPAGO_PLATFORM_PUBLIC_KEY")?.trim()
    || Deno.env.get("MERCADOPAGO_PUBLIC_KEY")?.trim();
  if (!key) {
    throw new Error("MERCADOPAGO_PLATFORM_PUBLIC_KEY no configurada");
  }
  return key;
}

/** Marketplace Brick solo si el restaurante conectó OAuth y existe PK de plataforma. */
export function usesMarketplaceBrick(config: PaymentConfigTokens): boolean {
  if (!config.oauth_connected_at) return false;
  const platformPk = Deno.env.get("MERCADOPAGO_PLATFORM_PUBLIC_KEY")?.trim()
    || Deno.env.get("MERCADOPAGO_PUBLIC_KEY")?.trim();
  return !!platformPk;
}

/** Public key + modo Brick según credenciales del restaurante. */
export async function resolveBrickIntegration(
  config: PaymentConfigTokens,
  checkoutEnv: CheckoutEnv,
): Promise<{ marketplace: boolean; publicKey: string }> {
  if (usesMarketplaceBrick(config)) {
    return { marketplace: true, publicKey: getPlatformPublicKey() };
  }

  const secrets = await decryptConfigSecrets(config);
  const sandboxPk = secrets.key_alias_test?.trim() || "";
  const prodPk = secrets.key_alias?.trim() || "";
  const publicKey =
    checkoutEnv === "sandbox" && sandboxPk.startsWith("TEST-")
      ? sandboxPk
      : prodPk.startsWith("APP_USR-") || prodPk.startsWith("TEST-")
        ? prodPk
        : sandboxPk || prodPk;

  if (!publicKey) {
    throw new Error(
      "Falta la Public Key del restaurante en Admin → Settings (misma app que el Access Token).",
    );
  }

  return { marketplace: false, publicKey };
}

export async function decryptConfigSecrets(
  config: PaymentConfigTokens,
): Promise<PaymentConfigTokens> {
  const [token_cbu, token_cbu_test, refresh_token] = await Promise.all([
    decryptSecret(config.token_cbu),
    decryptSecret(config.token_cbu_test),
    decryptSecret(config.refresh_token),
  ]);
  return { ...config, token_cbu, token_cbu_test, refresh_token };
}

export async function validateMpAccessToken(accessToken: string): Promise<{
  ok: boolean;
  status: number;
  userId?: number;
  isTestUser?: boolean;
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
  const tags: string[] = Array.isArray(data?.tags) ? data.tags : [];
  const isTestUser =
    tags.includes("test_user") ||
    data?.user_type === "test" ||
    data?.site_status === "test";
  return { ok: true, status: response.status, userId: data?.id, isTestUser };
}

export async function exchangeMpOAuthCode(
  code: string,
  redirectUri: string,
  testToken: boolean,
  codeVerifier?: string,
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
  if (codeVerifier) body.code_verifier = codeVerifier;

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

export function buildMpAuthorizationUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  pkce?: { codeChallenge: string },
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    platform_id: "mp",
    scope: "offline_access",
  });
  if (pkce?.codeChallenge) {
    params.set("code_challenge", pkce.codeChallenge);
    params.set("code_challenge_method", "S256");
  }
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
  restaurant_id?: string;
  oauth_test_mode?: boolean | null;
  oauth_requires_reconnect?: boolean | null;
  token_cbu?: string | null;
  token_cbu_test?: string | null;
  key_alias?: string | null;
  key_alias_test?: string | null;
  refresh_token?: string | null;
  token_expires_at?: string | null;
  oauth_connected_at?: string | null;
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
    const encryptedAccess = await encryptSecret(accessToken);
    const encryptedRefresh = await encryptSecret(refreshed.refresh_token || refreshToken);
    const { error } = await supabaseAdmin
      .from("payment_configs")
      .update({
        token_cbu: encryptedAccess,
        key_alias: refreshed.public_key || undefined,
        refresh_token: encryptedRefresh,
        token_expires_at: refreshed.expires_in
          ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
          : undefined,
        oauth_requires_reconnect: false,
      })
      .eq("id", configId);
    if (error) {
      console.warn("[mp-oauth] No se pudo persistir token refrescado:", error.message);
    }
  }

  return accessToken;
}

async function refreshProdAccessToken(
  refreshTokenPlain: string,
  supabaseAdmin: SupabaseAdmin | null,
  configId?: string,
): Promise<string | null> {
  try {
    const refreshed = await refreshMpOAuthToken(refreshTokenPlain, false);
    return await persistRefreshedProdToken(supabaseAdmin, configId, refreshTokenPlain, refreshed);
  } catch (err) {
    console.warn("[mp-oauth] refresh APP_USR falló:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function persistRefreshedTestToken(
  supabaseAdmin: SupabaseAdmin | null,
  configId: string | undefined,
  refreshToken: string,
  refreshed: Awaited<ReturnType<typeof refreshMpOAuthToken>>,
): Promise<string | null> {
  const accessToken = refreshed.access_token?.trim();
  if (!accessToken?.startsWith("TEST-")) return null;

  if (supabaseAdmin && configId) {
    const encryptedAccess = await encryptSecret(accessToken);
    const encryptedRefresh = await encryptSecret(refreshed.refresh_token || refreshToken);
    const { error } = await supabaseAdmin
      .from("payment_configs")
      .update({
        token_cbu_test: encryptedAccess,
        key_alias_test: refreshed.public_key || undefined,
        refresh_token: encryptedRefresh,
        oauth_requires_reconnect: false,
      })
      .eq("id", configId);
    if (error) {
      console.warn("[mp-oauth] No se pudo persistir token TEST refrescado:", error.message);
    }
  }

  return accessToken;
}

async function refreshTestAccessToken(
  refreshToken: string,
  supabaseAdmin: SupabaseAdmin | null,
  configId?: string,
): Promise<string | null> {
  try {
    const refreshed = await refreshMpOAuthToken(refreshToken, true);
    return await persistRefreshedTestToken(supabaseAdmin, configId, refreshToken, refreshed);
  } catch (err) {
    console.warn("[mp-oauth] refresh TEST- falló:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function resolveSandboxCheckoutToken(
  config: PaymentConfigTokens,
  supabaseAdmin: SupabaseAdmin | null,
): Promise<ResolvedCheckoutToken | null> {
  const secrets = await decryptConfigSecrets(config);
  const testToken = secrets.token_cbu_test?.trim() || "";
  const refreshToken = secrets.refresh_token?.trim() || "";

  if (testToken.startsWith("TEST-")) {
    const validation = await validateMpAccessToken(testToken);
    if (validation.ok) {
      return {
        accessToken: testToken,
        checkoutEnv: "sandbox",
        tokenSource: "token_cbu_test",
      };
    }
  }

  if (refreshToken) {
    const refreshed = await refreshTestAccessToken(refreshToken, supabaseAdmin, config.id);
    if (refreshed) {
      return {
        accessToken: refreshed,
        checkoutEnv: "sandbox",
        tokenSource: "token_cbu_test_refreshed",
      };
    }
  }

  return null;
}

/** Elige init_point vs sandbox_init_point según el entorno de checkout. */
export function pickCheckoutPaymentUrl(
  pref: { init_point?: string; sandbox_init_point?: string },
  redirectToSandbox: boolean,
): string | undefined {
  const sandbox = pref.sandbox_init_point;
  const production = pref.init_point;

  if (redirectToSandbox) {
    return sandbox || production;
  }

  return production || sandbox;
}

/** Resuelve el access token del vendedor para crear preferencias de Checkout Pro. */
export async function resolveSellerAccessToken(
  config: PaymentConfigTokens,
  supabaseAdmin: SupabaseAdmin | null = null,
): Promise<ResolvedCheckoutToken> {
  if (config.oauth_requires_reconnect) {
    throw new Error("El restaurante debe reconectar Mercado Pago en Admin → Settings.");
  }

  const secrets = await decryptConfigSecrets(config);
  const prodToken = secrets.token_cbu?.trim() || "";
  const refreshToken = secrets.refresh_token?.trim() || "";
  let sandboxMode = config.oauth_test_mode === true;

  if (!sandboxMode && prodToken.startsWith("APP_USR-")) {
    const probe = await validateMpAccessToken(prodToken);
    if (probe.ok && probe.isTestUser) {
      sandboxMode = true;
      if (supabaseAdmin && config.id) {
        await supabaseAdmin
          .from("payment_configs")
          .update({ oauth_test_mode: true })
          .eq("id", config.id);
      }
    }
  }

  if (sandboxMode) {
    // Preferir TEST- si existen; si no, APP_USR de producción + checkout sandbox (tarjetas de prueba).
    const sandboxToken = await resolveSandboxCheckoutToken(secrets, supabaseAdmin);
    if (sandboxToken) return sandboxToken;

    if (prodToken.startsWith("APP_USR-")) {
      const validation = await validateMpAccessToken(prodToken);
      if (validation.ok) {
        // Vendedor test (ej. 3429822713): solo sandbox_init_point. En www MP rechaza con
        // "una de las partes con la que intentás hacer el pago es de prueba".
        if (validation.isTestUser) {
          return {
            accessToken: prodToken,
            checkoutEnv: "sandbox",
            tokenSource: "token_cbu_app_usr_test_seller_sandbox",
          };
        }
        // Vendedor producción + modo prueba: www + tarjetas APRO (sin cuenta MP real).
        return {
          accessToken: prodToken,
          checkoutEnv: "production_test_users",
          tokenSource: "token_cbu_app_usr_test_cards",
        };
      }
    }

    throw new Error(
      "Modo sandbox activo: cargá Public Key y Access Token APP_USR (producción) de la app del restaurante en Admin → Settings.",
    );
  }

  if (prodToken.startsWith("TEST-")) {
    return { accessToken: prodToken, checkoutEnv: "sandbox", tokenSource: "token_cbu_test" };
  }

  if (prodToken.startsWith("APP_USR-")) {
    const validation = await validateMpAccessToken(prodToken);
    if (validation.ok && validation.isTestUser) {
      return {
        accessToken: prodToken,
        checkoutEnv: "sandbox",
        tokenSource: "token_cbu_test_seller_auto",
      };
    }
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

const REFRESH_MARGIN_MS = 7 * 24 * 60 * 60 * 1000;

/** Refresca tokens OAuth próximos a vencer. Marca reconexión si falla. */
export async function refreshExpiringRestaurantTokens(
  supabaseAdmin: SupabaseAdmin,
): Promise<{ refreshed: number; failed: number }> {
  const threshold = new Date(Date.now() + REFRESH_MARGIN_MS).toISOString();
  const { data: configs, error } = await supabaseAdmin
    .from("payment_configs")
    .select("id, restaurant_id, refresh_token, token_expires_at, oauth_test_mode")
    .eq("provider", "mercadopago")
    .eq("is_active", true)
    .not("refresh_token", "is", null);

  if (error) throw error;

  let refreshed = 0;
  let failed = 0;

  for (const row of configs ?? []) {
    if (row.token_expires_at && row.token_expires_at > threshold) continue;
    const refreshPlain = await decryptSecret(row.refresh_token);
    if (!refreshPlain) continue;

    try {
      const result = await refreshMpOAuthToken(refreshPlain, row.oauth_test_mode === true);
      if (row.oauth_test_mode) {
        await persistRefreshedTestToken(supabaseAdmin, row.id, refreshPlain, result);
      } else {
        await persistRefreshedProdToken(supabaseAdmin, row.id, refreshPlain, result);
      }
      refreshed++;
    } catch (err) {
      failed++;
      console.error("[mp-oauth] refresh job failed", row.restaurant_id, err);
      await supabaseAdmin
        .from("payment_configs")
        .update({ oauth_requires_reconnect: true })
        .eq("id", row.id);
    }
  }

  return { refreshed, failed };
}

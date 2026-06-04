/** Errores y diagnóstico de entorno Mercado Pago (edge functions). */

/** ID marketplace de la app SplitMe (Application ID / client_id). */
export function getMpMarketplaceId(): string | null {
  const clientId = Deno.env.get("MERCADOPAGO_CLIENT_ID")?.trim();
  if (!clientId) return null;
  return `MP-MKT-${clientId}`;
}

export type MarketplacePayerResolution = {
  email: string;
  source: "env_test_buyer" | "brick" | "fallback";
};

/**
 * Sandbox Brick: credenciales TEST + tarjetas de prueba (doc make test purchase).
 * NO usar @testuser.com en el campo del Brick. Si hay comprador de prueba MP, va en
 * MERCADOPAGO_SANDBOX_BUYER_EMAIL (email exacto del panel Cuentas de prueba).
 */
export function resolveMarketplacePayerEmail(
  sandboxMode: boolean,
  guestId: string,
  brickEmail?: string,
): MarketplacePayerResolution {
  const configured = Deno.env.get("MERCADOPAGO_SANDBOX_BUYER_EMAIL")?.trim() || "";
  const fromBrick = brickEmail?.trim() || "";

  if (sandboxMode) {
    if (configured.endsWith("@testuser.com")) {
      return { email: configured, source: "env_test_buyer" };
    }
    if (fromBrick && !fromBrick.endsWith("@testuser.com")) {
      return { email: fromBrick, source: "brick" };
    }
    const digits = guestId.replace(/\D/g, "").slice(0, 10) || "1";
    return { email: `guest${digits}@splitme.test`, source: "fallback" };
  }

  const email = fromBrick || configured || "test_payer@splitme.test";
  return { email, source: fromBrick ? "brick" : configured ? "env_test_buyer" : "fallback" };
}

export function accessTokenPrefix(token: string): "TEST" | "APP_USR" | "other" {
  const t = token.trim();
  if (t.startsWith("TEST-")) return "TEST";
  if (t.startsWith("APP_USR-")) return "APP_USR";
  return "other";
}

export function publicKeyPrefix(key: string): "TEST" | "APP_USR" | "other" {
  return accessTokenPrefix(key);
}

export function userMessageForMpCode(
  mpCode: string | undefined,
  mpMessage: string | undefined,
): string {
  const code = mpCode?.trim();
  if (code === "2034") {
    return (
      "Mercado Pago rechazó el pago (código 2034): mezcla de usuarios o entornos (vendedor, comprador o integrador). " +
      "En modo prueba: vendedor TEST (OAuth), public key TEST de SplitMe y comprador de prueba. " +
      "Configurá MERCADOPAGO_SANDBOX_BUYER_EMAIL con el email exacto del comprador de prueba (panel → Cuentas de prueba), o en el Brick usá un email genérico (no @testuser.com ni tu cuenta MP)."
    );
  }
  return mpMessage || "Error al crear pago";
}

export function detectEnvMismatch(
  platformPublicKey: string,
  sellerAccessToken: string,
): string | null {
  const pk = publicKeyPrefix(platformPublicKey);
  const seller = accessTokenPrefix(sellerAccessToken);
  if (pk === "TEST" && seller === "APP_USR") {
    return "platform_pk_test_seller_token_app_usr";
  }
  if (pk === "APP_USR" && seller === "TEST") {
    return "platform_pk_prod_seller_token_test";
  }
  return null;
}

/** Errores y diagnóstico de entorno Mercado Pago (edge functions). */

/** ID marketplace de la app SplitMe (Application ID / client_id). */
export function getMpMarketplaceId(): string | null {
  const clientId = Deno.env.get("MERCADOPAGO_CLIENT_ID")?.trim();
  if (!clientId) return null;
  return `MP-MKT-${clientId}`;
}

/**
 * Email del payer en POST /v1/payments.
 * En sandbox (token TEST-), MP exige dominio @testuser.com (error 2198).
 * @see https://www.mercadopago.com.ar/developers/en/reference/online-payments/checkout-api-payments/create-payment/post
 */
export function resolveMarketplacePayerEmail(
  guestId: string,
  brickEmail?: string,
  options?: { sandbox?: boolean },
): string {
  const fromBrick = brickEmail?.trim() || "";
  const digits = guestId.replace(/\D/g, "").slice(0, 10) || "1";

  if (options?.sandbox) {
    if (fromBrick.toLowerCase().endsWith("@testuser.com")) return fromBrick;
    return `guest${digits}@testuser.com`;
  }

  if (fromBrick) return fromBrick;
  return `guest${digits}@splitme.test`;
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
      "Mercado Pago rechazó el pago (código 2034): usuarios o credenciales incompatibles en marketplace. " +
      "Verificá que Supabase use credenciales de prueba de la app (TEST-), OAuth del vendedor test en Admin, y tarjeta APRO. " +
      "Detalle en mp_causes (Network)."
    );
  }
  if (code === "2198") {
    return (
      "Mercado Pago rechazó el pago (código 2198): en modo prueba el email del pagador debe ser @testuser.com. " +
      "SplitMe lo envía automáticamente; volvé a intentar el pago."
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

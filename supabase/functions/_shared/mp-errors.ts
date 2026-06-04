/** Errores y diagnóstico de entorno Mercado Pago (edge functions). */

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
      "Configurá MERCADOPAGO_SANDBOX_BUYER_EMAIL con el email @testuser.com del comprador de prueba de tu app, o probá en incógnito sin sesión MP real."
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

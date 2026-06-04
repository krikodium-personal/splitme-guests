/** Errores y diagnóstico de entorno Mercado Pago (edge functions). */

/** ID marketplace de la app SplitMe (Application ID / client_id). */
export function getMpMarketplaceId(): string | null {
  const clientId = Deno.env.get("MERCADOPAGO_CLIENT_ID")?.trim();
  if (!clientId) return null;
  return `MP-MKT-${clientId}`;
}

/** Email del payer en POST /v1/payments — campo de formulario Brick, no cuenta de prueba MP. */
export function resolveMarketplacePayerEmail(
  guestId: string,
  brickEmail?: string,
): string {
  const fromBrick = brickEmail?.trim() || "";
  if (fromBrick) return fromBrick;
  const digits = guestId.replace(/\D/g, "").slice(0, 10) || "1";
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
      "La doc de MP indica que Checkout Bricks no usa cuentas de prueba del panel para integrar; probá credenciales TEST del Brick + tarjetas de prueba, " +
      "o OAuth del restaurante con cuenta real (modo producción). Detalle técnico en mp_causes de esta respuesta."
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

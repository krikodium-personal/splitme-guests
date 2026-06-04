/** Mensajes de usuario para errores conocidos de Mercado Pago (guests). */

export type MpPaymentErrorBody = {
  error?: string;
  status_detail?: string;
  mp_code?: string;
};

export const MP_ERROR_2034_USER_MESSAGE =
  'Mercado Pago rechazó el pago (código 2034). Tu configuración TEST/TEST está alineada; MP documenta que Checkout Bricks no integra con cuentas de prueba del panel. ' +
  'Probá tarjetas de prueba + credenciales TEST del Brick, u OAuth con cuenta real del restaurante (modo producción).';

export function isMpError2034(body: MpPaymentErrorBody | null | undefined): boolean {
  if (!body) return false;
  const code = String(body.mp_code ?? body.status_detail ?? '').trim();
  return code === '2034' || body.error?.toLowerCase().includes('invalid users involved') === true;
}

export function formatMpPaymentError(body: MpPaymentErrorBody | null | undefined): string {
  if (!body?.error) return 'No se pudo procesar el pago';
  if (isMpError2034(body)) return MP_ERROR_2034_USER_MESSAGE;
  const detail = body.status_detail && body.status_detail !== body.error
    ? ` (${body.status_detail})`
    : '';
  return `${body.error}${detail}`;
}

export function detectBrickEnvMismatch(
  platformPublicKey: string,
  sellerTokenPrefix: string,
): string | null {
  const pk = publicKeyPrefix(platformPublicKey);
  const seller = sellerTokenPrefix;
  if (pk === 'TEST' && seller === 'APP_USR') {
    return (
      'Entorno mezclado: la app SplitMe usa public key de prueba (TEST) pero el restaurante tiene token de producción (APP_USR). ' +
      'Reconectá Mercado Pago en Admin como usuario de prueba o cargá un access token TEST del vendedor.'
    );
  }
  if (pk === 'APP_USR' && seller === 'TEST') {
    return (
      'Entorno mezclado: public key de producción (APP_USR) con token del restaurante de prueba (TEST). ' +
      'Usá la public key de producción de SplitMe o un token APP_USR del vendedor real.'
    );
  }
  return null;
}

function publicKeyPrefix(key: string): 'TEST' | 'APP_USR' | 'other' {
  const t = key.trim();
  if (t.startsWith('TEST-')) return 'TEST';
  if (t.startsWith('APP_USR-')) return 'APP_USR';
  return 'other';
}

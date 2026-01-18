/**
 * Cookies de sesión para comensales.
 * Persisten mesa (res + table) y orden activa entre recargas.
 * Max-age 24h; se envían solo en same-site.
 */

const SESSION_NAME = 'splitme_session';
const ORDER_NAME = 'splitme_order';
const MAX_AGE = 60 * 60 * 24; // 24 horas

function get(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${encodeURIComponent(name)}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function set(name: string, value: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=/; max-age=${MAX_AGE}; SameSite=Lax`;
}

function remove(name: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${encodeURIComponent(name)}=; path=/; max-age=0; SameSite=Lax`;
}

export interface SessionData {
  res: string;
  table: string;
}

export function getSession(): SessionData | null {
  const raw = get(SESSION_NAME);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as SessionData;
    return v && typeof v.res === 'string' && typeof v.table === 'string' ? v : null;
  } catch {
    return null;
  }
}

export function setSession(data: SessionData): void {
  set(SESSION_NAME, JSON.stringify({ res: data.res, table: data.table }));
}

export function removeSession(): void {
  remove(SESSION_NAME);
}

export function getOrderId(): string | null {
  const v = get(ORDER_NAME);
  return v && v.length > 0 ? v : null;
}

export function setOrderId(id: string): void {
  set(ORDER_NAME, id);
}

export function removeOrderId(): void {
  remove(ORDER_NAME);
}

/** Limpia sesión y orden (usar al salir de mesa o tras pago completo). */
export function clearSession(): void {
  removeSession();
  removeOrderId();
}

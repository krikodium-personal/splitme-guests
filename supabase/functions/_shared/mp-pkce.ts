const PKCE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

/** Genera code_verifier (43–128 chars) para OAuth PKCE. */
export function generateCodeVerifier(length = 64): string {
  const size = Math.min(128, Math.max(43, length));
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  let out = "";
  for (let i = 0; i < size; i++) {
    out += PKCE_CHARS[bytes[i] % PKCE_CHARS.length];
  }
  return out;
}

/** code_challenge = BASE64URL(SHA256(code_verifier)) */
export async function createCodeChallenge(codeVerifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  const bytes = new Uint8Array(digest);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

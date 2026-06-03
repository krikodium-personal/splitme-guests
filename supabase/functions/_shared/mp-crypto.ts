const ENC_PREFIX = "enc:v1:";

async function getAesKey(): Promise<CryptoKey | null> {
  const raw = Deno.env.get("MERCADOPAGO_TOKEN_ENCRYPTION_KEY")?.trim();
  if (!raw) return null;

  let keyBytes: Uint8Array;
  try {
    keyBytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  } catch {
    keyBytes = new TextEncoder().encode(raw);
  }
  if (keyBytes.length < 32) {
    const padded = new Uint8Array(32);
    padded.set(keyBytes.slice(0, 32));
    keyBytes = padded;
  } else if (keyBytes.length > 32) {
    keyBytes = keyBytes.slice(0, 32);
  }

  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Cifra un secret en reposo. Si no hay key configurada, devuelve el valor original. */
export async function encryptSecret(plain: string | null | undefined): Promise<string | null> {
  const value = plain?.trim();
  if (!value) return null;
  if (value.startsWith(ENC_PREFIX)) return value;

  const key = await getAesKey();
  if (!key) return value;

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(value),
  );
  return `${ENC_PREFIX}${toBase64(iv)}:${toBase64(new Uint8Array(cipher))}`;
}

/** Descifra un secret persistido. Valores sin prefijo se devuelven tal cual (legacy). */
export async function decryptSecret(stored: string | null | undefined): Promise<string | null> {
  const value = stored?.trim();
  if (!value) return null;
  if (!value.startsWith(ENC_PREFIX)) return value;

  const key = await getAesKey();
  if (!key) {
    throw new Error("Token cifrado pero MERCADOPAGO_TOKEN_ENCRYPTION_KEY no está configurada");
  }

  const payload = value.slice(ENC_PREFIX.length);
  const [ivB64, cipherB64] = payload.split(":");
  if (!ivB64 || !cipherB64) throw new Error("Formato de token cifrado inválido");

  const plainBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivB64) },
    key,
    fromBase64(cipherB64),
  );
  return new TextDecoder().decode(plainBuffer);
}

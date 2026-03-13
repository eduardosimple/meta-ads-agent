/**
 * AES-GCM encryption helpers for Google OAuth tokens stored in cookies.
 * Key is derived from AUTH_SECRET via PBKDF2.
 */

const AUTH_SECRET = process.env.AUTH_SECRET ?? "default-secret-change-me-32chars!!";

async function getDerivedKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(AUTH_SECRET),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("google-tokens-salt-v1"),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str);
}

function base64ToBuf(b64: string): ArrayBuffer {
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}

export async function encryptTokens(tokens: object): Promise<string> {
  const key = await getDerivedKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(tokens));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);

  // pack as base64(iv):base64(ciphertext)
  return `${bufToBase64(iv.buffer)}:${bufToBase64(ciphertext)}`;
}

export async function decryptTokens<T = unknown>(encrypted: string): Promise<T | null> {
  try {
    const [ivB64, ciphertextB64] = encrypted.split(":");
    if (!ivB64 || !ciphertextB64) return null;
    const key = await getDerivedKey();
    const iv = new Uint8Array(base64ToBuf(ivB64));
    const ciphertext = base64ToBuf(ciphertextB64);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch {
    return null;
  }
}

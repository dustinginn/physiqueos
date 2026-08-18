// Stateless, signed Founder-gate session token. Uses only Web Crypto
// (globalThis.crypto.subtle), which is available in both the Node.js and
// Edge middleware runtimes without pinning a specific runtime - the token
// carries no Founder data and no raw secret, only an issued-at/expiry pair
// authenticated with HMAC-SHA256 under PHYSIQUEOS_ACCESS_GATE_SECRET.
// crypto.subtle.verify performs a constant-time comparison internally, so
// no separate timing-safe-equal step is needed for the signature check.

export const SESSION_COOKIE_NAME = "physiqueos_founder_gate";
export const SESSION_LIFETIME_MS = 12 * 60 * 60 * 1000; // 12 hours

const ALGORITHM = { name: "HMAC", hash: "SHA-256" };

function importKey(secret) {
  return globalThis.crypto.subtle.importKey("raw", new TextEncoder().encode(secret), ALGORITHM, false, ["sign", "verify"]);
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Malformed base64url segment.");
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function createSessionToken(secret, { now = Date.now(), lifetimeMs = SESSION_LIFETIME_MS } = {}) {
  const payload = { iat: now, exp: now + lifetimeMs };
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await importKey(secret);
  const signature = await globalThis.crypto.subtle.sign(ALGORITHM, key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/** Returns the decoded {iat, exp} payload if the token is validly signed and unexpired, otherwise null. Never throws. */
export async function verifySessionToken(token, secret, { now = Date.now() } = {}) {
  try {
    if (typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payloadB64, signatureB64] = parts;
    if (!payloadB64 || !signatureB64) return null;
    const signatureBytes = base64UrlDecode(signatureB64);
    const key = await importKey(secret);
    const valid = await globalThis.crypto.subtle.verify(ALGORITHM, key, signatureBytes, new TextEncoder().encode(payloadB64));
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));
    if (typeof payload?.iat !== "number" || typeof payload?.exp !== "number") return null;
    if (now >= payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

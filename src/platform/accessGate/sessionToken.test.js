import { describe, it, expect } from "vitest";
import { createSessionToken, verifySessionToken, SESSION_COOKIE_NAME, SESSION_LIFETIME_MS } from "./sessionToken.js";

const SECRET_A = "a".repeat(40);
const SECRET_B = "b".repeat(40);

describe("sessionToken", () => {
  it("round-trips: a freshly created token verifies successfully under the same secret", async () => {
    const token = await createSessionToken(SECRET_A);
    const payload = await verifySessionToken(token, SECRET_A);
    expect(payload).not.toBeNull();
    expect(typeof payload.iat).toBe("number");
    expect(typeof payload.exp).toBe("number");
    expect(payload.exp - payload.iat).toBe(SESSION_LIFETIME_MS);
  });

  it("rejects a token verified under a different secret (rotation invalidates old sessions)", async () => {
    const token = await createSessionToken(SECRET_A);
    expect(await verifySessionToken(token, SECRET_B)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const now = Date.now();
    const token = await createSessionToken(SECRET_A, { now });
    expect(await verifySessionToken(token, SECRET_A, { now: now + SESSION_LIFETIME_MS + 1 })).toBeNull();
  });

  it("accepts a token one millisecond before expiry and rejects it exactly at expiry", async () => {
    const now = Date.now();
    const token = await createSessionToken(SECRET_A, { now });
    expect(await verifySessionToken(token, SECRET_A, { now: now + SESSION_LIFETIME_MS - 1 })).not.toBeNull();
    expect(await verifySessionToken(token, SECRET_A, { now: now + SESSION_LIFETIME_MS })).toBeNull();
  });

  it("rejects a tampered payload (bit flipped in the payload segment)", async () => {
    const token = await createSessionToken(SECRET_A);
    const [payloadB64, signatureB64] = token.split(".");
    const tamperedPayload = payloadB64.slice(0, -1) + (payloadB64.at(-1) === "A" ? "B" : "A");
    expect(await verifySessionToken(`${tamperedPayload}.${signatureB64}`, SECRET_A)).toBeNull();
  });

  it("rejects a tampered signature", async () => {
    // Flip a character in the middle of the signature, not the last character: a base64url-encoded
    // 32-byte SHA-256 signature has 2 unused/padding bits in its final character, so mutating only
    // that character can decode to identical bytes and wouldn't actually test tampering.
    const token = await createSessionToken(SECRET_A);
    const [payloadB64, signatureB64] = token.split(".");
    const middle = Math.floor(signatureB64.length / 2);
    const tamperedChar = signatureB64[middle] === "A" ? "B" : "A";
    const tamperedSignature = signatureB64.slice(0, middle) + tamperedChar + signatureB64.slice(middle + 1);
    expect(await verifySessionToken(`${payloadB64}.${tamperedSignature}`, SECRET_A)).toBeNull();
  });

  it("rejects malformed tokens without throwing", async () => {
    for (const malformed of [null, undefined, "", "no-dot-here", "a.b.c", "!!!.???", "   ", 12345]) {
      await expect(verifySessionToken(malformed, SECRET_A)).resolves.toBeNull();
    }
  });

  it("rejects a token forged with a bogus signature but a well-formed payload claiming a far-future expiry", async () => {
    const forgedPayload = Buffer.from(JSON.stringify({ iat: Date.now(), exp: Date.now() + 999_999_999_999 })).toString("base64url");
    const forgedSignature = Buffer.from("not-a-real-signature").toString("base64url");
    expect(await verifySessionToken(`${forgedPayload}.${forgedSignature}`, SECRET_A)).toBeNull();
  });

  it("exposes a stable, dedicated cookie name distinct from any product/session naming", () => {
    expect(SESSION_COOKIE_NAME).toBe("physiqueos_founder_gate");
  });
});

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const HIGH_ENTROPY_CREDENTIAL_HASH = "hmac-sha256:v1";

export function generateHighEntropyCredential({ random = randomBytes } = {}) {
  return random(32).toString("base64url");
}

export function hashHighEntropyCredential(secret, { pepper } = {}) {
  assertCredentialInputs(secret, pepper);
  const digest = createHmac("sha256", pepper).update(secret, "utf8").digest("hex");
  return `${HIGH_ENTROPY_CREDENTIAL_HASH}:${digest}`;
}

export function verifyHighEntropyCredential(secret, encodedHash, { pepper } = {}) {
  assertCredentialInputs(secret, pepper);
  const expected = Buffer.from(hashHighEntropyCredential(secret, { pepper }), "utf8");
  const actual = Buffer.from(String(encodedHash ?? ""), "utf8");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function assertCredentialInputs(secret, pepper) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("A high-entropy credential is required.");
  if (typeof pepper !== "string" || pepper.length < 32) throw new Error("A server-held credential pepper is required.");
}

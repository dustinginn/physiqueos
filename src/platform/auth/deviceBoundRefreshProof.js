import { createHash, createHmac, createPublicKey, verify } from "node:crypto";

export const SENDER_CONSTRAINED_REFRESH_PROTOCOL = "sender-constrained-refresh-v1";
export const SENDER_CONSTRAINED_REFRESH_VERSION = 1;
export const REFRESH_PROOF_ALGORITHM = "ES256";
export const REFRESH_PROOF_PATH = "/api/v1/native/auth/refresh";

const HIGH_ENTROPY_BASE64URL = /^[A-Za-z0-9_-]{43,128}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export function normalizeInstallationPublicKey(input) {
  if (input?.algorithm !== REFRESH_PROOF_ALGORITHM || !BASE64URL.test(String(input?.publicKeySpki ?? ""))) {
    throw invalidProofInput("The installation signing key is invalid.");
  }
  let key;
  let canonicalSpki;
  try {
    key = createPublicKey({ key: Buffer.from(input.publicKeySpki, "base64url"), format: "der", type: "spki" });
    if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") throw new Error("wrong curve");
    canonicalSpki = key.export({ format: "der", type: "spki" });
  } catch {
    throw invalidProofInput("The installation signing key is invalid.");
  }
  return Object.freeze({
    algorithm: REFRESH_PROOF_ALGORITHM,
    publicKeySpki: canonicalSpki,
    thumbprint: createHash("sha256").update(canonicalSpki).digest("hex"),
  });
}

export function createSuccessorCommitment(successorRefreshCredential) {
  assertHighEntropy(successorRefreshCredential, "successor refresh credential");
  return createHash("sha256")
    .update("physiqueos-refresh-successor-v1\0", "utf8")
    .update(successorRefreshCredential, "utf8")
    .digest("base64url");
}

export function createRefreshProofMessage({
  refreshCredential,
  rotationIntentId,
  successorRefreshCredential,
  successorCommitment,
  nonce,
  proofId,
}) {
  for (const [label, value] of [
    ["refresh credential", refreshCredential],
    ["rotation intent", rotationIntentId],
    ["successor refresh credential", successorRefreshCredential],
    ["successor commitment", successorCommitment],
    ["Server nonce", nonce],
    ["proof identity", proofId],
  ]) assertHighEntropy(value, label);

  if (createSuccessorCommitment(successorRefreshCredential) !== successorCommitment) {
    throw invalidProofInput("The successor commitment is invalid.");
  }

  const bodyDigest = createHash("sha256").update([
    "physiqueos-refresh-request-v1",
    refreshCredential,
    rotationIntentId,
    successorRefreshCredential,
    successorCommitment,
  ].join("\n"), "utf8").digest("base64url");

  return Buffer.from([
    "physiqueos-device-proof-v1",
    "POST",
    REFRESH_PROOF_PATH,
    bodyDigest,
    nonce,
    proofId,
  ].join("\n"), "utf8");
}

export function verifyRefreshProof({ publicKeySpki, signature, ...message }) {
  if (!BASE64URL.test(String(signature ?? ""))) return false;
  try {
    const key = createPublicKey({ key: Buffer.from(publicKeySpki), format: "der", type: "spki" });
    return verify("sha256", createRefreshProofMessage(message), key, Buffer.from(signature, "base64url"));
  } catch {
    return false;
  }
}

export function digestRefreshProofValue(value, { pepper, domain }) {
  if (typeof pepper !== "string" || pepper.length < 32) throw new Error("A Server-held proof pepper is required.");
  if (!String(domain ?? "").trim()) throw new Error("A proof digest domain is required.");
  return createHmac("sha256", pepper).update(`physiqueos:${domain}:v1\0`, "utf8").update(String(value), "utf8").digest("hex");
}

export function assertHighEntropy(value, label = "value") {
  if (!HIGH_ENTROPY_BASE64URL.test(String(value ?? ""))) throw invalidProofInput(`The ${label} is invalid.`);
  return value;
}

function invalidProofInput(message) {
  return Object.assign(new Error(message), { code: "DEVICE_PROOF_INPUT_INVALID" });
}

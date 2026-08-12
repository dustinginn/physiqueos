import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const HANDLE_PATH = "/api/v1/media/read";
const AAD = Buffer.from("physiqueos-media-grant-v1", "utf8");

export function createOpaqueSpacesMediaGateway({ provider, catalog, secret, clock = () => new Date() } = {}) {
  if (typeof provider?.authorizeRead !== "function") throw new Error("The opaque media gateway requires a private-object provider.");
  if (typeof catalog?.getObject !== "function") throw new Error("The opaque media gateway requires an owner-scoped media catalog.");
  if (String(secret ?? "").length < 32) throw new Error("The opaque media gateway requires at least 32 characters of secret material.");
  const key = createHash("sha256").update(String(secret), "utf8").digest();

  return Object.freeze({
    async authorizeRead({ object, principal, expiresInSeconds }) {
      if (!object?.id || !object?.ownerUserId || principal?.userId !== object.ownerUserId) throw unavailable();
      const expiresAt = new Date(clock().getTime() + expiresInSeconds * 1000).toISOString();
      const grant = encryptGrant({ objectId: object.id, ownerUserId: object.ownerUserId, expiresAt }, key);
      return Object.freeze({ accessHandle: `${HANDLE_PATH}?grant=${encodeURIComponent(grant)}` });
    },

    async redeemRead({ accessHandle, principal }) {
      const actor = String(principal?.userId ?? "");
      const grant = readGrant(accessHandle, key);
      if (!actor || grant.ownerUserId !== actor || Date.parse(grant.expiresAt) <= clock().getTime()) throw unavailable();
      const object = await catalog.getObject({ objectId: grant.objectId, ownerUserId: actor });
      if (!object || object.ownerUserId !== actor || !object.objectKey) throw unavailable();
      return provider.authorizeRead({
        objectKey: object.objectKey,
        providerVersion: object.providerVersion ?? null,
        expiresInSeconds: Math.max(1, Math.min(300, Math.ceil((Date.parse(grant.expiresAt) - clock().getTime()) / 1000))),
      });
    },
  });
}

function encryptGrant(payload, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(AAD);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((value) => value.toString("base64url")).join(".");
}

function readGrant(accessHandle, key) {
  try {
    const url = new URL(String(accessHandle), "https://application.invalid");
    if (url.origin !== "https://application.invalid" || url.pathname !== HANDLE_PATH) throw new Error("invalid handle");
    const parts = String(url.searchParams.get("grant") ?? "").split(".");
    if (parts.length !== 3) throw new Error("invalid grant");
    const [iv, tag, encrypted] = parts.map(decodeCanonicalBase64Url);
    if (iv.length !== 12 || tag.length !== 16 || encrypted.length === 0) throw new Error("invalid grant shape");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    const payload = JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8"));
    if (!payload?.objectId || !payload?.ownerUserId || !Number.isFinite(Date.parse(payload?.expiresAt))) throw new Error("invalid grant payload");
    return payload;
  } catch {
    throw unavailable();
  }
}

function decodeCanonicalBase64Url(value) {
  const decoded = Buffer.from(value, "base64url");
  if (!value || decoded.toString("base64url") !== value) throw new Error("invalid grant encoding");
  return decoded;
}

function unavailable() {
  const error = new Error("The private object is unavailable.");
  error.code = "OBJECT_NOT_FOUND";
  error.status = 404;
  return error;
}

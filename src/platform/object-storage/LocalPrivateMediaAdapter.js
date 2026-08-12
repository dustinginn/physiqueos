import path from "node:path";

export function createLocalPrivateMediaAdapter({ privateRoot, issueAccessHandle } = {}) {
  if (!privateRoot) throw new Error("The local media root is required.");
  const root = path.resolve(privateRoot ?? "");
  if (!path.isAbsolute(root)) throw new Error("The local media root must be absolute.");
  if (typeof issueAccessHandle !== "function") throw new Error("The local media adapter requires an access-handle issuer.");
  return Object.freeze({
    async authorizeRead({ object, expiresInSeconds }) {
      const internalPath = path.resolve(root, object.internalRelativePath ?? "");
      if (internalPath !== root && !internalPath.startsWith(`${root}${path.sep}`)) {
        throw new Error("The local media object is outside the configured private root.");
      }
      const accessHandle = await issueAccessHandle({
        objectId: object.id,
        expiresInSeconds,
        internalPath,
      });
      return Object.freeze({ mode: "application_stream", accessHandle: String(accessHandle) });
    },
  });
}

export function createSpacesAuthorizedMediaAdapter({ provider } = {}) {
  if (typeof provider?.authorizeRead !== "function") throw new Error("The Spaces media adapter requires a private-object provider.");
  return Object.freeze({
    async authorizeRead({ object, expiresInSeconds }) {
      if (!object?.objectKey) throw new Error("The Spaces catalog record requires an internal object key.");
      const authorized = await provider.authorizeRead({
        objectKey: object.objectKey,
        providerVersion: object.providerVersion ?? null,
        expiresInSeconds,
      });
      return Object.freeze({ accessHandle: authorized.url });
    },
  });
}

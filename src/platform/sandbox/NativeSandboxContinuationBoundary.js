export function createNativeSandboxContinuationHandler({
  authority,
  databaseAuthority,
  handle,
} = {}) {
  if (!authority?.assertOutboxMessage || !databaseAuthority?.assertDatabase || typeof handle !== "function") {
    throw new Error("Native sandbox continuation requires authority, database, and handler boundaries.");
  }
  return async (message, context = {}) => {
    const verified = authority.assertOutboxMessage(message);
    await databaseAuthority.assertDatabase(context.client);
    return handle(verified, Object.freeze({
      ...context,
      sandboxAuthority: authority.descriptor,
      ownerUserId: authority.descriptor.ownerUserId,
      noncanonical: true,
    }));
  };
}

export function createNativeSandboxProjectionPublisher({
  authority,
  databaseAuthority,
  publish,
} = {}) {
  if (!authority?.assertOwnedRecord || !databaseAuthority?.assertDatabase || typeof publish !== "function") {
    throw new Error("Native sandbox projection publication requires explicit boundaries.");
  }
  return Object.freeze({
    async publish({ record, client = null, projectionType }) {
      authority.assertOwnedRecord(record);
      await databaseAuthority.assertDatabase(client ?? undefined);
      return publish({
        record,
        projectionType,
        authority: authority.descriptor,
        noncanonical: true,
      });
    },
  });
}

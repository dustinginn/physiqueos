export function createEpochBoundOutboxHandler({ controlStore, handler } = {}) {
  if (!controlStore?.read || typeof handler !== "function") {
    throw new Error("Epoch-bound outbox handling requires durable control and a handler.");
  }
  return async function handleEpochBoundMessage(message) {
    const messageEpoch = message?.payload?.canonicalStoreEpoch;
    if (!messageEpoch) throw epochError("OUTBOX_EPOCH_MISSING", "Outbox work has no canonical-store epoch and requires reconciliation.");
    let state;
    try {
      state = controlStore.read().state;
    } catch (cause) {
      throw epochError("OUTBOX_CONTROL_UNAVAILABLE", "Canonical-store control is unavailable; outbox work was not executed.", cause);
    }
    if (state.canonicalStoreEpoch !== messageEpoch) {
      throw epochError("OUTBOX_EPOCH_MISMATCH", "Outbox work belongs to a different canonical-store epoch and was not executed.");
    }
    return handler(message, { canonicalStoreEpoch: state.canonicalStoreEpoch, compositionMode: state.compositionMode });
  };
}

function epochError(code, message, cause = null) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  error.retryable = code === "OUTBOX_CONTROL_UNAVAILABLE";
  return error;
}

import { createUuidV7 } from "../../contracts/v1/identifiers.js";

const DEFAULT_MAX_ATTEMPTS = 8;
const DEFAULT_LEASE_MS = 60_000;

export function createDurableOutboxWorker({ store, handlers, workerId = createUuidV7(), buildId, clock = () => new Date(), logger, maximumAttempts = DEFAULT_MAX_ATTEMPTS, leaseMs = DEFAULT_LEASE_MS }) {
  if (!store?.claimNext || !store?.acknowledge || !store?.fail) throw new Error("A durable outbox store is required.");
  if (!buildId) throw new Error("A worker build identity is required.");
  let stopping = false;

  async function runOnce({ allowedTopics = null, heartbeatStatus = "healthy", heartbeatDetails = null } = {}) {
    if (stopping) return Object.freeze({ outcome: "stopping" });
    const now = clock();
    await store.heartbeat({ workerId, buildId, status: heartbeatStatus, observedAt: now, details: heartbeatDetails });
    const message = await store.claimNext({ workerId, now, leaseExpiresAt: new Date(now.getTime() + leaseMs), allowedTopics });
    if (!message) return Object.freeze({ outcome: "idle" });
    const handler = handlers[message.topic];
    if (typeof handler !== "function") return failMessage(message, new WorkerMessageError("OUTBOX_TOPIC_UNSUPPORTED", "No handler is registered for this outbox topic."), true);
    let leaseLost = false;
    const renew = store.renewLease ? setInterval(async () => {
      const renewedAt = clock();
      const renewed = await store.renewLease({
        id: message.id,
        workerId,
        at: renewedAt,
        leaseExpiresAt: new Date(renewedAt.getTime() + leaseMs),
      }).catch(() => null);
      if (!renewed) leaseLost = true;
    }, Math.max(1_000, Math.floor(leaseMs / 3))) : null;
    renew?.unref?.();
    const assertLease = () => {
      if (leaseLost) throw new WorkerMessageError("OUTBOX_LEASE_LOST", "The worker lost durable ownership before completion.");
    };
    try {
      await handler(Object.freeze({
        messageId: message.id,
        workerId,
        topic: message.topic,
        userId: message.user_id ?? null,
        payloadVersion: message.payload_version,
        payload: structuredClone(message.payload),
        correlation: Object.freeze({ commandId: message.payload?.commandId ?? null, operationId: message.operation_id ?? null }),
        assertLease,
      }));
      assertLease();
      const acknowledged = await store.acknowledge({ id: message.id, workerId, at: clock() });
      if (!acknowledged) throw new WorkerMessageError("OUTBOX_LEASE_LOST", "The worker lease expired before acknowledgement.");
      logger?.info?.("outbox.succeeded", { messageId: message.id, topic: message.topic, attemptCount: message.attempt_count });
      return Object.freeze({ outcome: "succeeded", messageId: message.id });
    } catch (error) {
      return failMessage(message, error, Number(message.attempt_count) >= maximumAttempts);
    } finally {
      if (renew) clearInterval(renew);
    }
  }

  async function failMessage(message, error, terminal) {
    const at = clock();
    const errorCode = safeErrorCode(error);
    const dueAt = new Date(at.getTime() + retryDelayMs(Number(message.attempt_count)));
    const failed = await store.fail({ id: message.id, workerId, at, dueAt, errorCode, errorDetail: "Outbox handler failed; inspect correlated protected logs.", terminal });
    logger?.error?.("outbox.failed", { messageId: message.id, topic: message.topic, errorCode, terminal, attemptCount: message.attempt_count });
    return Object.freeze({ outcome: terminal ? "dead" : "retry_scheduled", messageId: message.id, dueAt: terminal ? null : dueAt.toISOString(), persisted: Boolean(failed) });
  }

  async function markStopping() {
    stopping = true;
    await store.heartbeat({ workerId, buildId, status: "stopping", observedAt: clock(), details: null });
  }

  return Object.freeze({ workerId, runOnce, markStopping, isStopping: () => stopping });
}

export class WorkerMessageError extends Error {
  constructor(code, message) { super(message); this.name = "WorkerMessageError"; this.code = code; }
}

export function retryDelayMs(attemptCount) {
  const exponent = Math.min(10, Math.max(0, attemptCount - 1));
  return Math.min(60 * 60 * 1000, 5_000 * (2 ** exponent));
}

function safeErrorCode(error) {
  const candidate = String(error?.code ?? "OUTBOX_HANDLER_FAILED").toUpperCase();
  return /^[A-Z0-9_]{3,80}$/.test(candidate) ? candidate : "OUTBOX_HANDLER_FAILED";
}

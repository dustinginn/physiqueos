import { createUuidV7 } from "../../contracts/v1/identifiers.js";

const DEFAULT_MAX_ATTEMPTS = 8;
const DEFAULT_LEASE_MS = 60_000;

export function createDurableOutboxWorker({ store, handlers, workerId = createUuidV7(), buildId, clock = () => new Date(), logger, maximumAttempts = DEFAULT_MAX_ATTEMPTS, leaseMs = DEFAULT_LEASE_MS, deadHookAttempts = 3, deadHookRetryDelayMs = 1_000 }) {
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
    // attempt_count already includes this claim. A message that has been claimed
    // more than the maximum number of times without ever being acknowledged or
    // failed is one whose handler keeps killing the worker process (a crashed
    // process never calls fail()). Running it again would loop forever, so it is
    // dead-lettered and its owner is told, exactly as for a handler that fails.
    if (Number(message.attempt_count) > maximumAttempts) {
      return failMessage(message, new WorkerMessageError("OUTBOX_ATTEMPTS_EXHAUSTED", "The message was claimed repeatedly without completing."), true, handler);
    }
    // Lease bookkeeping. The database lease is what other workers respect; the
    // local expiry is the same value seen from this process, so a stalled event
    // loop that could not renew is detected instead of assumed healthy.
    let leaseValidUntilMs = now.getTime() + leaseMs;
    let leaseLost = false;
    let renewing = false;
    const renew = store.renewLease ? setInterval(async () => {
      if (renewing || leaseLost) return;
      renewing = true;
      try {
        const renewedAt = clock();
        const leaseExpiresAt = new Date(renewedAt.getTime() + leaseMs);
        const renewed = await store.renewLease({ id: message.id, workerId, at: renewedAt, leaseExpiresAt });
        // No row means another claim or an expired lease: ownership is gone.
        if (renewed) leaseValidUntilMs = leaseExpiresAt.getTime();
        else leaseLost = true;
      } catch {
        // A transient database error is not loss of ownership. The lease stays
        // valid until its own expiry, and the next tick retries the renewal.
      } finally {
        renewing = false;
      }
    }, Math.max(1_000, Math.floor(leaseMs / 3))) : null;
    renew?.unref?.();
    const assertLease = () => {
      if (leaseLost || (renew && clock().getTime() >= leaseValidUntilMs)) {
        throw new WorkerMessageError("OUTBOX_LEASE_LOST", "The worker lost durable ownership before completion.");
      }
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
      return failMessage(message, error, Number(message.attempt_count) >= maximumAttempts, handler);
    } finally {
      if (renew) clearInterval(renew);
    }
  }

  async function failMessage(message, error, terminal, handler = handlers[message.topic]) {
    const at = clock();
    const errorCode = safeErrorCode(error);
    const dueAt = new Date(at.getTime() + retryDelayMs(Number(message.attempt_count)));
    const failed = await store.fail({ id: message.id, workerId, at, dueAt, errorCode, errorDetail: "Outbox handler failed; inspect correlated protected logs.", terminal });
    logger?.error?.("outbox.failed", { messageId: message.id, topic: message.topic, errorCode, terminal, attemptCount: message.attempt_count });
    // A dead-lettered message can never advance its owner again. Let the owner
    // make that visible instead of waiting on a message that will not run. The
    // hook is only called when this worker actually persisted the dead state.
    if (terminal && failed && typeof handler?.onDead === "function") {
      const event = Object.freeze({
        messageId: message.id,
        topic: message.topic,
        userId: message.user_id ?? null,
        payloadVersion: message.payload_version,
        payload: structuredClone(message.payload),
        errorCode,
      });
      // The message is dead and will never be claimed again, so this is the only
      // chance to make the owner visible. Retry a transient failure a few times.
      for (let attempt = 1; attempt <= deadHookAttempts; attempt += 1) {
        try {
          await handler.onDead(event);
          break;
        } catch (hookError) {
          logger?.error?.("outbox.dead_hook_failed", { messageId: message.id, topic: message.topic, errorCode: safeErrorCode(hookError), attempt, final: attempt === deadHookAttempts });
          if (attempt < deadHookAttempts && deadHookRetryDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, deadHookRetryDelayMs));
        }
      }
    }
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

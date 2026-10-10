import { WorkerMessageError } from "./DurableOutboxWorker.js";

export const EVIDENCE_PROCESSING_OPERATOR_ALERT_TOPIC = "evidence.processing.operator-alert";
export const EVIDENCE_PROCESSING_OPERATOR_ALERT_PAYLOAD_VERSION = 1;

export function readEvidenceProcessingAlertRoutingConfig(env = process.env) {
  if (env.PHYSIQUEOS_EVIDENCE_ALERT_ROUTING_ENABLED !== "1") return null;
  const destination = required(env.PHYSIQUEOS_EVIDENCE_ALERT_WEBHOOK_URL, "PHYSIQUEOS_EVIDENCE_ALERT_WEBHOOK_URL");
  const url = new URL(destination);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw routingError("EVIDENCE_ALERT_DESTINATION_INVALID");
  }
  const timeoutMs = boundedInteger(env.PHYSIQUEOS_EVIDENCE_ALERT_TIMEOUT_MS, 10_000, 1_000, 30_000);
  return Object.freeze({
    destination: url.toString(),
    authorization: String(env.PHYSIQUEOS_EVIDENCE_ALERT_BEARER_TOKEN ?? "").trim() || null,
    timeoutMs,
  });
}

export function createEvidenceProcessingAlertRouter({ store, now = () => new Date(), escalationAfterMs = 15 * 60_000 } = {}) {
  if (!store?.reconcile) throw new Error("Evidence alert routing requires a durable store.");
  return Object.freeze({
    observe({ codes, metrics, observedAt = now() }) {
      return store.reconcile({
        codes: [...new Set(codes ?? [])].sort(),
        metrics: redactMetrics(metrics),
        observedAt,
        escalationAfterMs,
      });
    },
  });
}

export function createEvidenceProcessingOperatorAlertHandler({ config, fetchImpl = globalThis.fetch } = {}) {
  if (!config?.destination || typeof fetchImpl !== "function") throw new Error("Evidence alert delivery requires a configured HTTPS destination and fetch implementation.");
  return async function deliverEvidenceProcessingOperatorAlert({ messageId, payload }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    timer.unref?.();
    try {
      const response = await fetchImpl(config.destination, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": messageId,
          ...(config.authorization ? { authorization: `Bearer ${config.authorization}` } : {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response?.ok) throw routingError("EVIDENCE_ALERT_DELIVERY_REJECTED");
    } catch (error) {
      if (error instanceof WorkerMessageError) throw error;
      throw routingError(error?.name === "AbortError" ? "EVIDENCE_ALERT_DELIVERY_TIMEOUT" : "EVIDENCE_ALERT_DELIVERY_FAILED");
    } finally {
      clearTimeout(timer);
    }
  };
}

function redactMetrics(metrics = {}) {
  const allowed = [
    "activeReviewCount", "staleReviewCount", "adoptedStaleReviewCount",
    "historicalStaleReviewCount", "queuedTooLongCount", "deadContinuationCount",
    "maximumReviewAgeMs", "maximumQueueAgeMs", "latestHeartbeatAgeMs",
    "rssBytes", "rssFraction", "cpuPercent", "adoptionBoundaryDurable",
  ];
  return Object.freeze(Object.fromEntries(allowed.flatMap((key) =>
    metrics[key] == null || !["number", "boolean"].includes(typeof metrics[key]) ? [] : [[key, metrics[key]]]
  )));
}

function boundedInteger(value, fallback, minimum, maximum) {
  if (value == null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) throw routingError("EVIDENCE_ALERT_TIMEOUT_INVALID");
  return number;
}

function required(value, field) {
  const candidate = String(value ?? "").trim();
  if (!candidate) throw routingError(`${field}_REQUIRED`);
  return candidate;
}

function routingError(code) {
  return new WorkerMessageError(code, "Evidence-processing operator alert delivery failed.");
}

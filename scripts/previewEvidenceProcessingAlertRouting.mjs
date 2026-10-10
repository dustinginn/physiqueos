import {
  EVIDENCE_PROCESSING_OPERATOR_ALERT_TOPIC,
  readEvidenceProcessingAlertRoutingConfig,
} from "../src/platform/jobs/EvidenceProcessingAlertRouting.js";

const config = readEvidenceProcessingAlertRoutingConfig(process.env);
process.stdout.write(`${JSON.stringify({
  mode: "preview_only",
  active: false,
  configured: Boolean(config),
  topic: EVIDENCE_PROCESSING_OPERATOR_ALERT_TOPIC,
  destination: config ? "https_destination_configured_redacted" : "not_configured",
  timeoutMs: config?.timeoutMs ?? null,
  transitions: ["opened", "escalated_after_15m", "resolved"],
  delivery: "durable_outbox_with_retry_and_receipt",
  payload: "allowlisted_aggregate_metrics_only",
})}\n`);

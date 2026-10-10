# Evidence-processing alert routing (inactive candidate)

Status: source-only candidate. No destination is configured or active.

## Existing production coverage

DigitalOcean currently has active email delivery for deployment failure, domain failure, and Web/Worker CPU, memory, and restart-count alerts. The application watchdog already emits structured evidence-processing reliability and alert events every 30 seconds. The remaining gap is durable delivery of those application-level incidents.

## Candidate contract

Routing is fail-closed unless `PHYSIQUEOS_EVIDENCE_ALERT_ROUTING_ENABLED=1` and a valid HTTPS `PHYSIQUEOS_EVIDENCE_ALERT_WEBHOOK_URL` are both supplied. An optional bearer secret is read from `PHYSIQUEOS_EVIDENCE_ALERT_BEARER_TOKEN`; it is never placed in a payload or log. The destination must be selected and owned by the operator before activation.

Each alert code creates only transition messages:

- `opened` on first observation;
- `escalated` once after 15 continuous minutes;
- `resolved` once after a later healthy observation.

Transitions use the existing PostgreSQL outbox, unique dedupe keys, exponential retry, lease recovery, terminal dead-letter status, and succeeded/dead timestamps as delivery receipts. A delivery failure cannot stop watchdog inspection or evidence recovery. Payloads contain only the alert code, transition, severity, timestamps, build identity, and allowlisted aggregate counts/utilization. They exclude user, review, worker, evidence, destination, and authorization identities.

## Thresholds and response

| Signal | Open threshold | Initial operator response |
| --- | --- | --- |
| adoption boundary unavailable | any observation | prevent automatic recovery; inspect heartbeat persistence |
| stale review | >2 minutes | inspect review/claim/outbox; do not replay historical work |
| stale queue | >2 minutes | inspect worker claims and queue depth |
| dead continuation | any | inspect dead-letter receipt and saved review state |
| worker heartbeat stale | >90 seconds | verify Worker runtime and provider restart alert |
| process RSS high / critical | 70% / 85% of 1 GiB | correlate with provider memory and restart telemetry |
| process CPU high | >=85% | correlate with provider CPU and queue load |

Recovery transitions close an incident; repeated identical samples do not create messages. The escalation window limits noise while preserving evidence that an incident remained unresolved.

## Activation gate (future authorization required)

Before enabling:

1. Assign a named primary operator and backup, delivery destination, acknowledgement expectation, and escalation path.
2. Confirm vendor/security review, retention policy, and any external-service cost.
3. Run the source-only preview. It never sends a request:
   `PHYSIQUEOS_EVIDENCE_ALERT_ROUTING_ENABLED=1 PHYSIQUEOS_EVIDENCE_ALERT_WEBHOOK_URL=https://approved.example/endpoint node scripts/previewEvidenceProcessingAlertRouting.mjs`
4. Exercise an isolated synthetic open/dedupe/escalate/recovery sequence and verify outbox receipts.
5. Use the provider's spec proposal/diff path and confirm the only changes are the three alert-routing secrets/settings. Do not apply the proposal during review.
6. Activate during a staffed observation window. Recovery remains OFF; no historical evidence repair is part of alert activation.

Rollback is a single configuration change: set routing enabled to `0` or remove it, redeploy the same build, and verify structured watchdog logs continue. Pending alert messages must be dispositioned explicitly before changing destinations; they must never be silently redirected.

# Founder authorization request — DEXA -> Apple Health prospective activation — AUTHORIZED AND APPLIED

Status: Founder directly authorized the exact target in chat. The guarded create-only mutation completed at `2026-10-03T17:09:54.334Z` and passed parent plus independent read-only verification. Final report: `agent-handoffs/reports/20261003T171246Z-dexa-healthkit-prospective-policy-activation.md`.

## Decision requested

Authorize the guarded create-only production mutation for the exact DEXA HealthKit policy record below.

The Sep 12 physical validation and bounded production audit passed. The policy remains absent/disabled. The candidate dry-runs to zero intents because production has no active canonical DEXA on or after `2026-10-09`.

## Exact authorization target

- Production Server: `b47663b32372a78010dbc8e4aa41303012d98dc7`
- Deployment: `b9449c52-5444-4dae-9f44-fd0261b1a9d3`
- Owner: `user_founder_001`
- Collection: `healthKitConfiguration`
- Record ID/source identity: `dexa_healthkit_writeback_policy`
- Operation: `records.putIfAbsent`; require `created: true`; stop if any record already exists.

```json
{
  "id": "dexa_healthkit_writeback_policy",
  "schemaVersion": "dexa-healthkit-writeback-policy-v1",
  "enabled": true,
  "status": "enabled",
  "effectiveFromScanDate": "2026-10-09",
  "measurementKinds": [
    "bodyFatPercentage",
    "leanBodyMassFatFree"
  ],
  "prospectiveOnly": true,
  "historicalBackfill": false,
  "version": 1
}
```

Candidate policy digest: `15f04b12710a124475e2e02f70a5255cbe4a0c5f47b6655d701c3053b214bb98`.

## Required guarded workflow

Immediately before apply, reverify exact web/worker SHA and deployment, then rerun the owner-scoped repeatable-read dry run. Require:

- current policy absent;
- all Sep 12 receipts remain final `deleted` / `absent`;
- active canonical Oct 9+ DEXA count `0`;
- candidate permanent intent count `0` and diagnostics `0`;
- no DEXA Weight, own-source feedback, or historical present intent.

If those facts match, create exactly one record with `putIfAbsent`, require `created: true`, read it back exactly, resolve it enabled, and reproject zero intents. Verify no other collection changed. Any drift or surprise record is a stop, not an overwrite.

## Explicit exclusions

This authorization would not authorize historical backfill, another Sep 12 validation write, DEXA Weight, raw lean soft tissue, any unsupported metric, DEXA record mutation, Server deploy, or Native/TestFlight build.

Detailed evidence: `agent-handoffs/reports/20261003T162145Z-dexa-healthkit-physical-validation-closeout.md`.

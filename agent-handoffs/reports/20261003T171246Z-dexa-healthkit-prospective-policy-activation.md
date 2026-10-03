# DEXA -> Apple Health prospective policy activation — final

- Task: activate the reviewed permanent prospective DEXA HealthKit policy
- Status: **ACTIVE, ZERO CURRENT INTENTS, INDEPENDENTLY VERIFIED**
- Agent: Codex
- Founder authority: direct chat authorization naming the exact record, payload, digest, Server SHA, preflight gates, and create-only semantics
- Prior review authority: `agent-handoffs/reports/20261003T162145Z-dexa-healthkit-physical-validation-closeout.md`
- Generated (UTC): `2026-10-03T17:12:46Z`
- Initial MAIN publication commit: `b967a9680d902c62d62486b17dea55cab0427b16`

## Result

The exact reviewed permanent prospective DEXA -> Apple Health policy is active.

- Effective canonical scan date: `2026-10-09`.
- Authorized measurements only: `bodyFatPercentage`, `leanBodyMassFatFree`.
- Lean Body Mass means fat-free mass, canonical DEXA `totalMass - fatMass`.
- Prospective only: `true`.
- Historical backfill: `false`.
- Current permanent intents: `0`.
- Current diagnostics: `0`.
- Historical Apple Health writeback: none.
- DEXA Weight path: none.

No Server deploy or Native/TestFlight operation occurred. Build 84 and the guarded Sep 12 validation controls were untouched and the validation was not invoked.

## Reverified production authority

| Item | Exact result |
|---|---|
| Server SHA | `b47663b32372a78010dbc8e4aa41303012d98dc7` |
| Deployment | `b9449c52-5444-4dae-9f44-fd0261b1a9d3` — `ACTIVE`, 9/9 |
| Web / worker source | exact `b47663b32372a78010dbc8e4aa41303012d98dc7` / exact `b47663b32372a78010dbc8e4aa41303012d98dc7` |
| Runtime build | `physiqueos-b47663b3-20261003` |
| Live / ready | `ok` / `ready`, all 9 checks green through App Platform ingress; schema `000014` |
| Native | Build 84 `bcd92c74602695766c270fe6af052de45afece4b`, unchanged |

The custom production hostname had a transient local DNS lookup failure during the first health probe. The App Platform default ingress returned the exact live/ready result above, and both production console audits ran in the exact web runtime.

## Fresh immediate drift fence

The preflight bundle SHA-256 was `ab277a11e36e7510c108bf25ed4e8fe34af78b4953b02be9fe160c09cadbde2a`.

It ran under `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, verified `transaction_read_only=on`, used owner-scoped bounded reads, rolled back, and emitted its success marker.

All required facts matched:

- runtime exact Server SHA/build;
- policy absent;
- candidate policy digest exact `15f04b12710a124475e2e02f70a5255cbe4a0c5f47b6655d701c3053b214bb98`;
- exactly two Sep 12 receipts, both revision 1, `withdrawn` / `deleted` / materialized `absent`;
- three active canonical DEXAs, all before `2026-10-09`; zero on/after the effective date;
- candidate permanent projection `0` intents / `0` diagnostics;
- all feedback-loop marker counts `0`;
- canonical date gate explicitly `active canonical DEXA scan date >= 2026-10-09`.

The full protected-state preflight facts digest was `284474e2dd6bf535d83d2865bb3b6a2c80a17db0b5ff1851d0f7ff91f5c45fc9`.

## Exact mutation ledger

The apply bundle SHA-256 was `7c5d3d89d9a8bf176390fd260af880ee4d34f1f83b6bab7461d6931a4efdb95c`. It was hard-bound to the fresh preflight facts digest above and acquired the established owner advisory transaction lock.

Exactly one create-only call was permitted:

```json
{
  "method": "records.putIfAbsent",
  "ownerUserId": "user_founder_001",
  "collection": "healthKitConfiguration",
  "recordId": "dexa_healthkit_writeback_policy",
  "sourceIdentity": "dexa_healthkit_writeback_policy",
  "requiredResult": { "created": true },
  "payload": {
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
}
```

The console transport ended without returning the apply process's final output marker. The apply was **not retried**. Fresh read-only verification then proved that the transaction committed exactly once:

- exactly one matching storage row exists;
- `sourceIdentity` is exact;
- database/payload version is `1`;
- `createdAt` and `updatedAt` are both `2026-10-03T17:09:54.334Z`;
- payload digest is the authorized digest;
- no overwrite/update occurred.

## Parent post-activation verification

The final parent read-only post-verification bundle SHA-256 was `7bea5c9489371a0358709f5cd4b018670c47cf9d919dc1fedc18dc89440061ee`.

It independently re-read the stored row under `REPEATABLE READ READ ONLY`, verified `transaction_read_only=on`, resolved the policy enabled, reprojected the current state, and rolled back:

- policy record/version/source identity/payload: exact;
- permanent intents: `0`;
- diagnostics: `0`;
- pre-effective active DEXAs: `3`;
- on/after-effective active DEXAs: `0`;
- Sep 12 validation receipts final absent: `true`;
- own-source body observation/Evidence/Weight/strategic/Training markers: all `0`.

## Protected-state mutation proof

The apply transaction compared all non-policy record and storage-metadata digests before and after the create. The parent post-audit and a fresh independent audit compared them again with the preflight snapshot. Every protected collection matched exactly.

| Protected area | Preflight and post-activation result |
|---|---|
| Weight | `124`, digest `db18d6a60b61348a4463b9beb2080d73` |
| Canonical Evidence | `584`, digest `bec858c1ab598669f02a7d3a73afc0ba` |
| Evidence Packages / Reviews / DEXA compatibility | `343 / 247 / 17`, all record and metadata digests unchanged |
| Confidence snapshots / history | `2 / 31`, all record and metadata digests unchanged |
| Daily Briefings / work items / analyses | `56 / 2 / 417`, all record and metadata digests unchanged |
| Phase strategy / operating plan | `1 / 1`, all record and metadata digests unchanged |
| Ordinary Sleep samples / days | `461 / 2`, all record and metadata digests unchanged |
| Historical Sleep samples / days | `8,601 / 87`, all record and metadata digests unchanged |
| HealthKit observations | `814`, all record and metadata digests unchanged |
| Activity canonical days | `26`, all record and metadata digests unchanged |
| Canonical workouts / links / claims | `25 / 7 / 14`, all record and metadata digests unchanged |
| DEXA validation receipts | `2`, digest `5970517a4d96d1f8cce40d2e2d68fc6`, unchanged |

The only production data change was the one new `healthKitConfiguration` policy row. No Weight, Evidence, Confidence, Narrative, recommendation-bearing analysis, Briefing, Sleep, Training, Cardio, DEXA source record, or receipt changed.

Because the post-activation projection is empty and the Sep 12 receipts remain materialized absent, activation caused no Apple Health write/delete and cannot backfill Sep 12 or any earlier DEXA.

## Independent verification

A fresh independent agent returned **PASS** after its own production read-only transaction and exact-SHA source review:

- deployment ACTIVE 9/9, web/worker exact Server SHA;
- exactly one policy row with exact source identity, version, timestamps, payload, and digest;
- `0` permanent intents / `0` diagnostics;
- three active DEXAs before Oct 9, zero on/after;
- exact two Sep 12 final-absent receipts;
- all feedback markers zero;
- every supplied preflight count, record digest, metadata count, and metadata digest matched its fresh post-activation map;
- source selection uses canonical `measuredAt` / canonical scan date, never upload/import/confirmation date;
- projection supports only BF% and fat-free LBM; no Weight path exists.

The independent verifier performed no write, file edit, deploy, Native action, or Sep 12 validation action.

## Oct 9 acceptance checklist

1. Confirm the DEXA appointment has the correct local date/time.
2. Upload through the normal DEXA Priority/intake and complete Evidence Review.
3. Confirm exactly one accepted canonical DEXA dated Oct 9 and exactly two permanent intents.
4. Verify Apple Health BF% and fat-free LBM match the accepted canonical scan.
5. Verify source PhysiqueOS and the intended timestamp/date precision.
6. Verify exactly one sample of each type and no Weight sample.
7. Verify durable `Saved` receipts and zero own-source Evidence/Weight feedback.
8. Test correction replacement only if the real scan naturally needs a correction; do not alter real data merely to exercise the path.

Retain the guarded Sep 12 validation controls temporarily until this real Oct 9 flow succeeds, but do not invoke them again. Hide/remove them in the next consolidated Native build after acceptance; do not create a cosmetic-only build.

## Final state

- Permanent prospective policy: **ACTIVE**.
- Current intent count: **0**.
- Historical backfill: **false / none occurred**.
- Sep 12 samples: remain deleted/materialized absent.
- Build 84: unchanged.
- Server/Native implementation SHAs: unchanged and pushed.
- New deploy/build: none.
- Local operation source/bundles: temporary, ignored, contain no credentials or raw health export, and were intentionally not pushed.
- Rollback/deactivation: not performed; any future change requires a separately reviewed and authorized production mutation.
- Next gate: real Oct 9 prospective acceptance.

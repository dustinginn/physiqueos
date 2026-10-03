# DEXA -> Apple Health physical-validation closeout

- Task: `20261003T162000Z-dexa-healthkit-physical-validation-closeout`
- Status: **PHYSICAL VALIDATION PASS; ACTIVATION CANDIDATE APPROVED; WAITING FOR FOUNDER AUTHORIZATION**
- Agent: Codex
- Prompt authority: `1757bf25fb9783e590cbd4634debf9b6810cebfa`
- Generated (UTC): `2026-10-03T16:21:45Z`
- Initial MAIN publication commit: `080a142eac19e4905f3083672091c85b91494de1`

## Verdict

The bounded Sep 12 physical validation is a **PASS**.

The permanent DEXA -> Apple Health policy is still **DISABLED**. No policy record was written, no historical backfill was run, and this closeout performed no Apple Health or production-data mutation.

The exact prospective policy candidate independently passed review and a production read-only dry run. It produces **zero current permanent intents**, excludes Sep 12 and every earlier DEXA, and is ready only for a separately authorized, create-once production mutation.

## Founder physical facts recorded

On installed TestFlight Build 84, the Founder confirmed:

- PhysiqueOS wrote the existing canonical Sep 12 Body Fat Percentage: `8.1%`.
- PhysiqueOS wrote Apple Health Lean Body Mass as fat-free mass: `160.5 lb` (`174.7 - 14.2`).
- Apple Health showed both on Sep 12 with PhysiqueOS as source.
- No DEXA Weight was written.
- The guarded deletion action reported `Deleted`.
- Both PhysiqueOS-owned validation samples disappeared from Apple Health.
- The canonical Sep 12 DEXA remained in PhysiqueOS.

No raw Founder health data beyond that expressly confirmed pair is present in this report.

## Reverified authority

| Item | Exact authority |
|---|---|
| Production Server | `b47663b32372a78010dbc8e4aa41303012d98dc7` |
| Production deployment | `b9449c52-5444-4dae-9f44-fd0261b1a9d3` — `ACTIVE`, 9/9 |
| Production build ID | `physiqueos-b47663b3-20261003` |
| Native | `bcd92c74602695766c270fe6af052de45afece4b` |
| TestFlight | `com.physiqueos.native.dev` `1.0 (84)`, delivery `a4b7b504-e0ba-4cb5-9909-3e01cc8156d5`, `VALID` and installed |

Web and worker both resolve to the exact Server SHA. Live returned `ok`; ready returned `ready` with all nine checks green and schema authority `000014`.

## Production read-only audit

The final sanitized audit bundle SHA-256 was `11144cbe6cd021b1a07628b3abea9d38500ada114121a14831eef4bd4dbcba64`. It ran inside the exact web runtime under `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, verified `transaction_read_only=on`, used Founder-owner-scoped reads, rolled back, and emitted its success marker.

### Policy, historical safety, and dry run

- Permanent policy record: absent.
- Resolved permanent policy: `enabled: false`, source `not_configured`.
- Current permanent intents: `0`.
- Active canonical DEXAs: `3`; all `3` are before `2026-10-09`; on/after-effective-date count: `0`.
- In-memory candidate policy resolved enabled with the exact locked date/scope.
- Candidate permanent intents: `0`; diagnostics: `0`.
- Therefore enabling the candidate cannot backfill Sep 12 or any earlier scan and produces no current write/delete intent.

### Sep 12 canonical and receipts

- Canonical identity and logical scan key remain exactly `dexa_scan|user_founder_001|2026-09-12`.
- Canonical DEXA revision remains `1`; revision history remains empty.
- Stored and independently recomputed semantic fingerprint both remain `sha256_d06c092bd2dada5fcf78fa6c00ff25c0070ec701912b5109bb8a5d893047b029`.
- Reprojection remains exactly BF% `8.1%` and fat-free LBM `160.5 lb`, with derivation `fat_free_mass_total_minus_fat`; no Weight projection exists.
- Exactly two receipts exist, one per authorized measurement. Both are revision `1`, Sep 12, `desiredState: withdrawn`, `outcome: deleted`, `materializedState: absent`, `materializedRevision: 1`, and have no materialized correlation remaining.
- The two receipt records were created for the write at approximately `15:57:51Z` and advanced to final deletion at approximately `16:02:06Z`, each at storage version `2`.

### Feedback-loop, Weight, Evidence, and strategy

All feedback-loop marker counts are zero:

- PhysiqueOS-owned body-composition HealthKit observations: `0`.
- PhysiqueOS DEXA/HealthKit markers in canonical Evidence, Evidence Packages, Evidence Reviews, or DEXA compatibility rows: `0`.
- DEXA/HealthKit markers in Weight: `0`.
- DEXA/HealthKit markers in strategic artifacts: `0`.
- DEXA body-composition markers in Training/Cardio collections: `0`.

The broad Build 83 baseline initially showed a legitimate later difference. A narrow provenance pass resolved it rather than masking it:

- At `16:06:56Z`, four minutes after validation deletion, a separate **manual** Oct 3 Morning Check-In created one Weight record, one `morning_weight` canonical Evidence record, and one computed analysis record in the same transaction.
- Those records contain no PhysiqueOS DEXA/HealthKit source marker and are not dated Sep 12.
- Evidence Packages, Evidence Reviews, and `dexaScans` compatibility rows had zero post-release-audit updates.
- Daily Briefings, briefing work items, Confidence snapshots/history, phase strategy, and operating plan had zero post-release-audit updates.

Thus the observed Weight/Evidence/analysis transaction was normal manual Morning Check-In activity, not a DEXA validation feedback loop or writeback side effect. The DEXA-specific invariants remain clean.

### Sleep v3 and Training/Cardio

- Sleep canonical algorithm policy remains enabled as `sleep-canon-v3`, effective `2026-10-02`.
- Historical Sleep remains exactly `8,601` samples / `87` days.
- Ordinary Sleep advanced naturally from the earlier release snapshot to `461` samples / `2` days; this is prospective background delivery, not DEXA activity. The v3 policy and historical boundary did not change.
- Canonical workouts remain `25`; links remain `7`; claims remain `14`.
- Canonical Activity-day count remains `24`; its digest advanced with normal current-day HealthKit sync.
- No DEXA body-composition marker exists in Training/Cardio state. Build 83/84 Watch, Training, and Cardio behavior is unaffected.

## Exact activation mutation — NOT EXECUTED

The safe path is a create-only `records.putIfAbsent`. If the record exists at activation time, stop; do not overwrite it.

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

- Candidate policy digest: `15f04b12710a124475e2e02f70a5255cbe4a0c5f47b6655d701c3053b214bb98`.
- Production dry-run facts digest: `21fc64d299a278c625be9e159c9d5dc8675c2e96fa2ebf9a5b3997bb580bc6ac`.
- Expected post-write state: exact readback resolves enabled; record version `1`; permanent intents remain `0`; diagnostics remain `0`; no other collection changes.
- Apply must use a fresh immediate dry-run drift fence and verify the policy is still absent, receipts remain final absent, and no Oct 9+ canonical DEXA exists.

No mutation was attempted because this exact production record requires direct Founder authorization.

## Independent review

Fresh independent review returned **PASS** with no blocker.

- Exact Server SHA was clean; targeted Server verification passed `5 files / 141 tests`.
- Review confirmed the date gate uses canonical scan date, not import/confirmation date.
- Only Body Fat Percentage and `totalMass - fatMass` are projected. Weight, raw lean soft tissue, RMR, BMI, BMC, VAT, regional values, and unsupported metrics have no path.
- Historical materialized-present receipts can generate cleanup withdrawals only, never historical present writes. The Sep 12 receipts are final absent, so the candidate emits nothing.
- Build 84 enforces the same effective date, exact two-kind scope, prospective/no-backfill flags, derivation, and explicit local opt-in before touching HealthKit.
- Build 83 has no DEXA writeback client and remains backward-compatible.

The reviewer noted that exact Server SHA has no purpose-built public activation command; this is why the activation is explicitly a guarded create-only canonical-record operation with pre/post projection proofs.

## Validation-control recommendation

Choose option 3: retain the guarded Sep 12 controls temporarily in installed Build 84 until the real Oct 9 prospective flow succeeds, but do not invoke them again. After Oct 9 acceptance, hide/remove them in the next consolidated Native build. Do not create a build solely for cosmetic cleanup. Keep the normal DEXA -> Apple Health toggle.

## Oct 9 acceptance checklist

1. Confirm the appointment has the correct local date/time.
2. Upload through the normal DEXA Priority/intake and complete Evidence Review without unnecessary edits.
3. Confirm one active canonical Oct 9 DEXA and exactly two permanent intents.
4. Verify Apple Health values match canonical BF% and calculated fat-free LBM.
5. Verify source PhysiqueOS and correct timestamp/date precision.
6. Verify exactly one sample of each type and no Weight sample.
7. Verify durable `Saved` receipts and no own-source Evidence/Weight feedback.
8. Exercise correction replacement only if the real scan naturally requires correction; do not alter the scan merely to test it.

## Stop state

- Permanent policy: **disabled / absent**.
- Historical backfill: none and unauthorized.
- Production mutation in this closeout: none.
- Apple Health mutation in this closeout: none; the Founder-completed write/delete is recorded as accepted physical evidence.
- Server/Native implementation branches: pushed and clean at the exact authorities above.
- Local audit bundle/source: temporary, ignored, contains no credentials or raw export, and was intentionally not pushed.
- Required decision: Founder authorization for the exact create-only policy mutation above.

Authorization request: `agent-handoffs/inbox/review-requests/20261003T162145Z-founder-authorization-dexa-healthkit-prospective-activation.md`.

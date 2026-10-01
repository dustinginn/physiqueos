HealthKit Sleep correctness lane — sleep-canon-v2 duplicate-copy resolution and prospective D0 runner fix

Standing reporting protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

READ FIRST

Historical shape validation:
agent-handoffs/reports/20260930T210326Z-healthkit-sleep-historical-shape-validation.md

Current production Sleep Server authority:
08aeecdeb9f02e311efa2cd037940fbf0b249bb7

Historical validation dataset:
2878 isolated samples in run hv-2026-10-01-30d.
Do not export or commit raw Founder Sleep data.

PURPOSE

Fix the one real canonical defect discovered by the 30-night validation before prospective Sleep activation or user-facing stage/awake durations.

Also fix the guarded prospective activation runner so a future D0 may be later than the historical-validation anchor while preserving the no-overlap invariant.

This is a Server correctness candidate first.

Do not design Sleep Evidence.
Do not decide strategic weighting.
Do not add Sleep to V3/Briefings/Confidence.
Do not activate prospective Sleep until exact candidate is reviewed and separately authorized.

A. OURA DUPLICATE-COPY INVESTIGATION

Real finding:
11/30 historical nights contain 2–3 overlapping copies of Oura's own staged night in the same source lane.
HealthKit UUIDs/content fingerprints are distinct, so this is source-level duplication, not transport duplication.
sleep-canon-v1 blends those copies and distorts Awake/Core/Deep/REM while total asleep remains reliable.

First determine, read-only and privacy-safe, whether the stored/available Oura HealthKit samples expose a technical synchronization identifier/version suitable for deterministic current-copy selection.

Investigate only allow-listable non-personal metadata such as HealthKit sync identifier/version or an Oura external revision identity if genuinely present.

Do not print raw values or sample timestamps to GH.

If the existing historical validation payload did not retain the needed metadata, determine whether Build 73 can read it locally and whether a minimal Native contract extension would be required. Do not silently broaden arbitrary metadata ingestion.

Decision:
- If a reliable source-provided copy/revision identity exists and is stable, propose/use the minimum allow-listed contract extension.
- If it does not exist or cannot be trusted, implement Server-only deterministic copy selection.

Do not block indefinitely on metadata if Server-only resolution is robust.

B. SLEEP-CANON-V2

Implement a new algorithm version, preserving v1 historical artifacts.

Goal:
within each source lane and episode, identify overlapping candidate copies of the same sleep episode and select exactly one authoritative copy for stage/awake totals.

Preserve non-selected copies as corroborating provenance.

Required properties:
- no blending stages across duplicate copies;
- no cross-source hybrid filling;
- source preference still chooses lane first;
- within-lane copy selection happens after lane selection using a deterministic technical rule;
- total asleep, stage totals, awake, inBed and timeline derive from selected copy only where duplicate-copy resolution applies;
- genuinely complementary non-duplicate samples from one source must not be incorrectly discarded;
- unknown/future stages remain safe;
- revisions/deletions/idempotency remain convergent;
- algorithmVersion/digest changes to v2;
- day schema need not change unless strictly necessary.

If no source revision metadata:
default candidate rule to evaluate:
1. technically complete/usable copy;
2. greatest asleep coverage;
3. greatest valid staged coverage / sample completeness;
4. deterministic stable tie-break.
Refine based on actual data shape and synthetic adversarial cases.

C. TEST MATRIX

Add synthetic cases:
- exact duplicate copy with different UUIDs;
- near-duplicate shifted copy;
- complete + partial copy;
- two complete copies with conflicting stages;
- three copies;
- complementary legitimate samples that should remain one copy;
- stage copy + inBed envelope;
- awake disagreement;
- Oura preferred lane plus another source;
- deletion of selected copy causes deterministic fallback to remaining copy;
- late arrival of more authoritative copy recomputes;
- out-of-order arrival converges;
- no duplicate copies retains v1-equivalent result;
- total asleep/stages/timeline no double count;
- copy provenance preserved.

D. REAL 2878-SAMPLE ZERO-WRITE REPLAY

After synthetic tests and fresh review, rerun the historical shape audit in READ ONLY mode against the same 2878 isolated validation samples using v2.

Acceptance:
- 30/30 canonical nights;
- Oura primary 30/30;
- affected duplicate-copy nights resolve to one selected copy;
- no stage blending;
- stage and Awake results match the selected copy within ±2%/rounding tolerance;
- total asleep remains stable/defensible;
- unaffected nights remain semantically equivalent;
- ordinary Sleep samples/days remain zero;
- strategic leakage remains zero;
- record-store mutations = 0.

Report sanitized counts only.

E. PROSPECTIVE D0 RUNNER FIX

Current runner incorrectly binds future prospective D0 forever to historical run anchor 2026-10-01.

Change rule:
- historical validation zone must match prospective zone;
- prospective D0 may equal or be LATER than historical anchor;
- prospective floor must be >= historical validation end instant;
- never allow overlap;
- a later D0 may leave an uncovered gap and that is acceptable;
- future-floor guard remains strict;
- historicalBackfill remains false.

Tests:
equal anchor allowed if floor still future;
later D0 allowed;
earlier D0 refused;
zone mismatch refused;
overlap refused;
closed historical run still enforces no-overlap;
future-floor guard preserved.

F. PROSPECTIVE ACTIVATION PREPARATION

After v2 + runner fix passes:
propose the next clean D0 whose floor is safely future at time of deployment/activation.
Prepare dry-run facts only.

Do NOT apply prospective activation without separate Founder authorization.

G. DEPLOYMENT

This task may produce a reviewed Server candidate.

Do not deploy automatically.
Publish exact candidate SHA, tests, zero-write historical replay and recommended D0, then stop for deployment/activation authorization.

If a minimal Native metadata extension is truly required for v2, create a separate Native candidate/contract proposal but do not upload it in this task unless separately authorized.

H. REPORT

Publish:
agent-handoffs/reports/<timestamp>-healthkit-sleep-canon-v2-candidate.md

Include:
metadata investigation;
selected algorithm;
candidate SHA;
synthetic tests;
2878-sample zero-write replay;
v1 vs v2 sanitized comparison;
D0 runner fix;
strategic quarantine;
prospective activation status OFF;
recommended next D0;
whether Native change is needed;
fresh review;
deployment status NOT DEPLOYED.

Publish GH checkpoint before every stop.

END TASK.

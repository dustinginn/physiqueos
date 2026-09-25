# HealthKit Cardio graduation readiness — prepared, not activated

Generated: 2026-09-25T03:30:00Z

Task id: `claude-healthkit-cardio-graduation-preparation-20260924`

Agent: Claude (Remote Control, HealthKit lane), executing `agent-handoffs/inbox/prompts/20260924T223000Z-claude-healthkit-cardio-graduation-preparation.md`

## Result

**Read / prepare / test / review only, exactly as authorized. Nothing was deployed, uploaded, activated, or mutated.** Cardio graduation is now design-ready: the machinery is re-verified against the current candidate lineage, the live deferred backlog is freshly re-inventoried (confirmed still exactly 4, not assumed), and exact dry-run packages, invariants, a Founder acceptance checklist, and a 10-gate execution sequence are prepared below, each gate requiring its own separate future authorization.

## Authority reverified

- Production Server: `01d1900bcbb9db32ce270e49c7d24e919ba0d7d7`, deployment `8da160ac-7ae5-4b69-8fd7-342cfff30099` — unchanged.
- Installed Native: Build 59, `a269700bdc391476403c368d13f49887dd4a366a` — unchanged.
- Reviewed HealthKit Native candidate: `6a108d25e2a05b63c9561be3aeb9952f4e9dafe1` — unchanged, local only.
- Reviewed Server type-fidelity candidate: `c58dcca97e7b1a32c829485b7f8dc3d8fa5bb5a5` — unchanged, local only.
- Live workout policy independently re-read: `{enabled: true, families: ["strength"], effectiveLocalDate: "2026-09-23", openEnded: true, strategicEvidenceEligibility: "quarantined", historicalBackfill: false, linkAutoConfirm: false}` — unchanged.
- Midweek's own worktrees: not touched.

## Part A — graduation machinery re-verified against current lineage + c58dcca9

All properties below were re-confirmed by direct source reading and a fresh, independent re-run of the fixture suites (not merely cited from the prior review):

**Atomic workout-policy family-scope replacement** (`HealthKitActivationPolicyRunner.js`'s `replace-families` action):
- Widens exactly `families:["strength"] → ["cardio","strength"]` in one guarded transaction — no separate deactivate/reactivate, no disabled-policy gap window.
- Requires an exact `expectedCurrentPolicyDigest` precondition (refuses on any drift) and an exact `expectedCurrentFamilies` precondition (refuses if the caller's belief of the current scope is stale).
- Refuses any narrowing unless explicitly acknowledged, naming the dropped families.
- Idempotent replay: a repeat of an already-succeeded exact request returns before any write is attempted.
- Writes exactly one audit row recording old digest, new digest, and the authorization reference.
- Provably leaves the Activity/Nutrition daily policy, canonical workouts, links, claims, and strategic-evidence collections untouched (digest-compared invariants in the runner itself).
- `strategicEvidenceEligibility` stays `"quarantined"`, `historicalBackfill` stays `false`, `linkAutoConfirm` stays `false` — none of these are inputs the `replace-families` action can change; it only ever touches `families`.

**Bounded deferred-Cardio reconciliation runner** (`HealthKitDeferredWorkoutReconciliationRunner.js`):
- Accepts exactly one authorized observation identity per invocation — no bulk/range mode, enforced by real input validation (an array or date-range-shaped input is rejected outright).
- Requires the observation's stored `reconciliation.reason === "family_not_in_activation_scope"` and requires the observation's classified family to already be present in the CURRENT live policy before proceeding — both refuse cleanly otherwise.
- Creates exactly one canonical Cardio workout per authorized identity, reusing ingestion's own shared constructor (not a reimplementation) — verified this still holds true against `c58dcca9`'s classifier extension (see Part E).
- Creates no Training Logger session, no Strength link, no claim, no auto-confirm, no strategic-evidence eligibility change for Cardio — confirmed structurally impossible (Cardio's only side effect is a read-only coexistence patch, the same one ingestion itself would produce).
- Preserves exactly the source telemetry/provenance already present in the stored observation payload — never recomputes or invents values.
- Idempotent replay: a repeat of an already-applied exact request returns `already_reconciled` with zero additional writes; a request against an identity that was never actually deferred (already canonicalized by some other path) returns a distinct `already_canonicalized`, never conflated with the first.

**Fresh test re-run** (both files, this session, independent of the prior review's own run): `HealthKitActivationPolicyRunner.test.js` + `HealthKitDeferredWorkoutReconciliationRunner.test.js` → **51/51 passed**.

**Compatibility with `c58dcca9` confirmed**: the classifier extension for Indoor/Outdoor fidelity is purely additive (an optional third argument, defaulted). Neither the policy-replacement runner nor the deferred-reconciliation runner needed any change — both were already re-verified (twice, by two independent fresh-context reviewers) to reuse the exact shared classifier/constructor path the extension modifies, so type fidelity flows through automatically with zero runner-file changes. No code changes were required or made in this task.

## Part B — bounded live deferred-Cardio inventory (freshly re-verified, not assumed)

A fresh, bounded, read-only production audit (window 2026-09-22 through 2026-09-27 — deliberately extended past "today" to rule out any newly-arrived observations, per the task's explicit instruction not to assume the backlog is still four) confirms: **the backlog is still exactly 4, unchanged since the prior diagnostic.** No workout observations of any kind exist in production dated after September 24, 2026, as of this read.

| # | Local date | Local start–end | Stored `activityType` | Classifier family / type | Duration | Active cal | Avg HR | Indoor/Outdoor metadata present? | Already canonicalized? |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 2026-09-23 | 06:29:52–06:47:51 AM (`America/Los_Angeles`) | `52` (Walking) | cardio / **walking** (generic) | 1079.5s | 78.65 | 90.85 | **NO** | NO |
| 2 | 2026-09-23 | 07:57:14–08:12:58 AM (`America/Los_Angeles`) | `52` (Walking) | cardio / **walking** (generic) | 943.7s | 107.14 | 111.33 | **NO** | NO |
| 3 | 2026-09-24 | 11:04:20–11:22:07 AM (`America/Chicago`) | `52` (Walking) | cardio / **walking** (generic) | 1067.0s | 157.58 | 121.07 | **NO** | NO |
| 4 | 2026-09-24 | 11:50:11 AM–12:06:39 PM (`America/Chicago`) | `52` (Walking) | cardio / **walking** (generic) | 987.9s | 188.13 | 142.68 | **NO** | NO |

One factual detail not previously surfaced: the two September 23 observations were recorded under time zone `America/Los_Angeles`, while the two September 24 observations were recorded under `America/Chicago` — a genuine device/location time-zone difference between the two days, not a data error. All four have `reconciliationState: workout_canonicalization_deferred`, `reconciliationReason: family_not_in_activation_scope`, identical source bundle (`com.apple.health.91F74160-...`) and device model (`Apple Inc./Watch7,12/27.0`).

**Confirmed, per the classifier itself (run live against this exact stored data, not inferred): none of the 4 carry the Indoor/Outdoor metadata signal.** This matches the prior diagnostic's proof that the metadata was never captured before the prospective fix (`c58dcca9`) existed, and — per this codebase's replay-dedup design — cannot be retroactively recovered. Per the Founder's own explicit acceptance ("I'm fine with just changing it for future fixes"), these four will present as generic Cardio/Walking if/when reconciled; that is correct, expected behavior, not a defect.

**No days after September 24, 2026 contain any workout observations as of this read** — the backlog has not grown, and this was re-verified fresh rather than assumed.

## Part C — exact future policy-replacement dry-run package (prepared, not executed)

**Current live values this package is bound to** (freshly re-read this session, via a safe zero-write refusal — see methodology note below):

- `expectedCurrentPolicyDigest`: `dc7ba152cf5e9dd528e380bed6bc0366`
- `expectedCurrentFamilies`: `strength`
- Current `effectiveLocalDate`: `2026-09-23` (to be preserved unless a future fresh read proves otherwise)
- Current `openEnded`: `true`, `strategicEvidenceEligibility`: `quarantined`, `historicalBackfill`: `false`, `linkAutoConfirm`: `false` (all preserved — `replace-families` only ever changes `families`)

**Exact future command** (to be rebuilt at execution time against whichever Server SHA is then live — see Gate 1):

```
node scripts/operations/buildHealthKitPayload.mjs --kind policy --sha <LIVE_SHA_AT_EXECUTION_TIME> \
  --policy-kind workout --action replace-families \
  --families cardio,strength \
  --expected-current-families strength \
  --expected-current-policy-digest dc7ba152cf5e9dd528e380bed6bc0366 \
  --mode dry-run --out <payload-file>
```

then transported via the established guarded console runner against the then-live production runtime.

**Expected dry-run output**: `outcome: "dry_run"`, a predicted resulting policy record with `families: ["cardio","strength"]` and every other field unchanged from today's values, plus a predicted single audit-row write — and, critically, **zero actual writes** (dry-run never reaches a write call).

**Stop conditions** (any of these must halt the sequence and require this package to be rebuilt, not forced through): `outcome !== "dry_run"` for any reason, in particular — `expectedCurrentPolicyDigest` mismatch (something about the policy changed since this package was prepared); `expectedCurrentFamilies` mismatch; a narrowing detected without `--acknowledge-narrowing` (should never trigger here, since this is a pure widening); the runtime SHA gate mismatching (wrong Server candidate live); any other collection's digest (Activity/Nutrition policy, canonical workouts, links, claims, evidence) showing unexpected drift in the returned `facts`.

**Methodology note**: the current digest was obtained via a deliberate, safe, zero-write refusal (dry-run with an intentionally-wrong placeholder digest, which the runner refuses before any write and echoes the real current digest back in its `facts` for exactly this diagnostic purpose) — not by guessing or by any write attempt. This is a read-only reconnaissance technique, reproduced twice with an identical result.

## Part D — exact future deferred-reconciliation dry-run package (prepared, not executed)

**Manifest** (from Part B, 4 entries): **SHA-256 checksum `672f734943afd42c2de48c6993ca34d36951ef4720a2d7ae3e9d6b9ffdcaa107`** over the stable, sorted `{observationIdHash, localDate, storedActivityType, classifierFamily, classifierCanonicalType, manifestEntryDigest}` tuple of all 4 entries. This checksum is the exact value that must be re-derived from a fresh Gate-3 inventory read immediately before execution; **if the freshly-recomputed checksum differs from `672f7349...` for any reason (a new deferred observation appeared, one of the four changed state, anything else drifted), the process must stop and require this manifest to be rebuilt and re-authorized — it must never silently proceed with a stale or partially-different set.**

Each of the 4 manifest entries carries its own `manifestEntryDigest` (a hash of that observation's exact identity, measurement, occurrence, and reconciliation state) as its own per-entry drift fence, independent of the other three.

**Important scoping note**: this document's manifest entries use privacy-preserving short hashes of the real observation/external identifiers, per this project's established convention — they are not directly usable as literal `--observation-id` values. The exact raw identifiers needed for the real future command must be resolved fresh at Gate 3 (the same bounded read path used to build this manifest, run again immediately before execution, by whoever holds the Gate-4/Gate-7 authorization) — never carried forward from a stale earlier read.

**Exact future command shape**, once per manifest entry (four separate invocations, never a bulk/range call — the tool's own input validation rejects anything else):

```
node scripts/operations/buildHealthKitPayload.mjs --kind deferred-workout-reconcile --sha <LIVE_SHA_AT_EXECUTION_TIME> \
  --observation-id <exact stored observation id, resolved fresh at Gate 3> \
  --mode dry-run --out <payload-file>
```

**Expected dry-run output per entry**: `outcome: "dry_run"`, predicting the creation of exactly one new canonical Cardio workout with `family: "cardio"`, `canonicalType: "walking"` (generic — none of the 4 carry Indoor/Outdoor metadata, per Part B), and telemetry/timing/provenance matching the stored observation exactly (duration/active-calories/HR/etc. as itemized in Part B's table). No link, claim, or Logger-session prediction for any of the 4.

**Stop conditions per entry**: `outcome !== "dry_run"` for any reason — the observation's stored `reconciliation.reason` no longer being exactly `family_not_in_activation_scope`; the observation's classified family not (yet) present in the live policy (i.e., this cannot run before Gate 6 confirms the policy replacement is live); `already_canonicalized` (something else canonicalized this identity first); any drift-fence mismatch on policy digest, the observation's own digest, the existing canonical-workout set, links/claims, or strategic state.

**Correction from fresh-context review (see Test/review summary below)**: the runner's own drift fence (`collectFacts`) hashes the FULL `healthKitObservations`/`healthKitCanonicalWorkouts` collections, not just the target entry. This means applying entry #1 changes the collection-wide digests, so a captured `expected` snapshot for entries #2-4 will legitimately show as `outcome: "drifted"` if reused verbatim from a single batched "dry-run all 4 up front" pass — this is the runner correctly refusing rather than a bug, but it means **the 4 entries cannot be dry-run once and then applied four times**. The corrected, required pattern per entry, strictly serial, never batched: dry-run entry N → Founder-authorized apply entry N → refresh facts → dry-run entry N+1 → apply entry N+1 → ... This replaces any batched reading of Gates 7/8 below.

Separately, the bespoke SHA-256 `manifestEntryDigest`/overall-checksum scheme in this Part D is this report's own prose-only construction — there is no `buildHealthKitPayload.mjs --kind` mode that computes or verifies it, so it cannot be mechanically reproduced at Gate 3 without hand-transcribing an undocumented algorithm (a real transcription-risk gap, flagged by review). It should be treated as a **non-authoritative, human-readable preparation artifact only**. The actual, code-enforced, already-tested drift protection for execution time is the reconciliation runner's own per-observation digest/idempotency fencing described above (and in Part A) — that is what Gate 3/7/8 must rely on, not this report's manifest checksum. If this package is carried forward into real execution, either drop the bespoke checksum entirely or commit it as an actual, tested script before relying on it.

## Part E — prospective type-fidelity activation dependency

**Proven sequencing dependency**: `c58dcca9` (or a clean combined Server candidate that supersedes it without losing this change) MUST be live in production before Cardio activation for the fidelity fix to have any effect on newly-arriving observations. This is a hard prerequisite, not a nice-to-have — reflected as Gate 1, strictly before Gate 4.

**Once live**: new Apple Health Cardio observations preserve the specific Apple source type (e.g. `indoor_walking`/`outdoor_walking`, generalized to running/cycling) exactly when HealthKit metadata (`HKMetadataKeyIndoorWorkout`) provides it — `family` always remains `"cardio"` regardless; no inference from GPS/location/speed/date is possible (verified: the Native capture code reads only that one metadata key, and the Server classifier only ever consults the explicit signal, both independently confirmed by two fresh-context reviews with adversarial checks including GPS-shaped-telemetry-without-signal test cases). Activity Detail's `contributingWorkouts` already passes `canonicalType` through verbatim with no collapsing — confirmed by direct code reading in the latest review, with an additional adversarial input (`"outdoor_running"`) beyond what the shipped tests covered.

**Regression coverage confirmed to already exist and pass** (re-run fresh this session, not merely cited): `HealthKitDeferredWorkoutReconciliationRunner.test.js`'s `"propagates an explicit isIndoorWorkout signal through deferred reconciliation into a specific canonicalType, while a signal-less deferred observation stays the generic type (matching the real historical four)"` — this is exactly the "reconciliation cannot erase specific type metadata on observations that have it" guarantee the task calls for, using the shared classifier/constructor path, already passing. No new test or code change was needed.

**Historical four**: remain generic Cardio/Walking, permanently, unless a separately-authorized future correction mechanism is ever designed for them specifically (out of scope now and not designed here, per the Founder's explicit prior acceptance).

## Part F — Activity accounting acceptance package (pre/post invariants; audit tooling identified, nothing run destructively)

All of the following are already-implemented, already-tested, already-deployed (in `01d1900b`) behaviors — this section defines the exact pre/post read-only audit pattern to prove them empirically around the eventual Cardio reconciliation apply, reusing the exact zero-write audit tooling already used for every deploy in this lane (`--kind audit`, `--kind workout-audit`, `--kind training-audit`, run once immediately before and once immediately after the Gate-7 apply, diffed for byte-identical results outside the intended change):

- Canonical whole-day Activity total for each affected date (Sep 23, Sep 24) is invariant before/after — the underlying HealthKit daily aggregate is never touched by workout canonicalization.
- Workout calories are derived from canonical included workouts; each canonical workout contributes at most once (deduped by canonical workout id).
- Strength requires its existing confirmed-link semantics for Activity workout attribution (unchanged by this whole preparation).
- Cardio contributes once canonicalized, without ever requiring a nonexistent Logger confirmation (Cardio structurally has none).
- `non_workout_active_calories = max(daily_active_total - known_included_workout_energy, 0)` under the already-reviewed contract; clamps at zero, never negative.
- No canonicalized Cardio workout is ever added on top of the daily Activity total (`workoutEnergyAdded` invariant, always `0`).
- Missing workout energy remains explicitly `null`/unknown by design, never a silent zero.
- No duplicate workout identities across the whole day.
- Strength telemetry/Logger relationship completely unaffected by Cardio's activation or reconciliation.
- No Cardio Logger sessions/links/claims created, ever.
- Strategic counts/digests (`canonical_goal_records`, `canonical_confidence_records`, `canonical_briefing_records`, `canonical_plan_records`, `canonical_protocol_records`, `canonical_evidence_records`, `canonical_training_records`) unchanged by any of this work.

All of these invariants are already covered by existing, passing fixture tests (confirmed present and green in this and prior sessions) — no new test was required. The pre/post production audit pattern itself is identical in shape to the zero-write audits already used successfully for every Server deploy in this lane; no new tooling needed to be built.

## Part G — real-device Founder acceptance checklist (for after a future, separately-authorized apply)

1. Activity whole-day totals for Sep 23 and Sep 24 remain the same as before reconciliation.
2. Activity Detail shows each canonicalized Cardio workout as its own distinct row.
3. Any NEW workout recorded after `c58dcca9` (or its successor) is live preserves the specific Apple workout type when HealthKit provides the metadata.
4. The historical four from September 23–24 may show generic "Walking"/"Cardio" — this is the known, accepted, unrecoverable limitation, not a new ingestion failure; do not treat it as a regression.
5. Strength detail (Sep 23 and Sep 24) remains healthy, with honest candidate/confirmed relationship semantics (per the just-reviewed `6a108d25` fix).
6. No Cardio workout ever appears as a structured Training Logger session.
7. Workout/non-workout calorie decomposition looks sensible with no double counting.
8. Current-day Activity/Nutrition automatic sync remains healthy throughout.

## Part H — exact future execution sequence (10 gates, each its own separate Founder authorization)

1. **Deploy** the Server type-fidelity candidate `c58dcca97e7b1a32c829485b7f8dc3d8fa5bb5a5`, unless superseded by a clean combined Server candidate (with Midweek's own work) that preserves this exact change.
2. **Install/accept** a combined Native build containing the Strength fix `6a108d25e2a05b63c9561be3aeb9952f4e9dafe1`.
3. **Refresh** the bounded deferred-Cardio inventory (Part B's read, run again) and the policy digest (Part C's read, run again) immediately before activation — if either has changed from this document's values, stop and rebuild the affected package before proceeding.
4. **Dry-run only** the atomic policy replacement, using Part C's package (rebuilt with the freshly-confirmed digest from Gate 3).
5. Founder reviews the dry-run output and separately authorizes **apply**.
6. **Verify** the post-apply policy state (families now exactly `["cardio","strength"]`, everything else unchanged) via a fresh read-only audit.
7. **Dry-run only** the deferred reconciliation, one entry at a time from Part D's refreshed manifest (Gate 3) — **strictly serial, never batched**: dry-run entry N, Founder-authorizes apply entry N (Gate 8), refresh facts, dry-run entry N+1, and so on. Per the fresh-context review below, the runner's drift fence hashes the full observation/canonical-workout collections, so a dry-run captured for entry N+1 before entry N's apply will legitimately show as drifted once entry N is applied — this is correct refusal behavior, not a bug, but means Gates 7 and 8 repeat four times (once per deferred entry), interleaved, not run as two single batch steps.
8. Founder reviews each entry's dry-run output and separately authorizes that entry's **apply**, before the next entry's dry-run is taken.
9. **Verify** the resulting canonical Cardio workouts and every Part F invariant via a fresh pre/post read-only audit pair, after all four entries have been applied.
10. **Founder real-device acceptance** using Part G's checklist.

Strategic eligibility remains completely out of scope for all ten gates and requires its own, later, separate project and authorization.

## Test / review summary

- Fresh fixture re-runs this session: `HealthKitActivationPolicyRunner.test.js` + `HealthKitDeferredWorkoutReconciliationRunner.test.js` → 51/51 passed. The type-fidelity-preservation regression, and all Activity-accounting invariant tests, were confirmed present and green from prior work — no gaps found requiring new code.
- No code changes were needed or made in this task (no genuine preparation defect found).
- **Fresh-context adversarial review of the complete Cardio-graduation readiness package** (manifest semantics, gate order, invariants, and abort/stop conditions — not a code diff review, since no code changed), dispatched with zero prior context and instructed to ground-truth this report's claims against the real source and to independently re-run tests rather than trust the drafted claims.

  **Verdict: APPROVE WITH NOTES.**

  Independently re-ran `HealthKitActivationPolicyRunner.test.js` + `HealthKitDeferredWorkoutReconciliationRunner.test.js` → confirmed **51/51 passed**, matching this report. Independently confirmed against source (with line citations) every Part A/E/F claim: atomic single-transaction widening, exact digest/family preconditions, narrowing refusal, idempotent replay with zero writes, exactly one audit row, post-apply digest-compared invariants proving other collections untouched; the deliberate-refusal digest-discovery technique; single-observation-only input validation on the reconciliation runner; `already_reconciled` vs `already_canonicalized` distinction; no Logger/link/claim creation; Indoor/Outdoor fidelity threading through the shared classifier with zero runner-file changes; and the Activity whole-day dedup/clamp/null-propagation contract in `ProgressReportingService.js`.

  Two genuine findings, both incorporated into this report above before publishing:
  1. **Gates 7/8 cannot be run as a single batched dry-run-all-then-apply-all pass.** The reconciliation runner's drift fence hashes the full `healthKitObservations`/`healthKitCanonicalWorkouts` collections, not just the target entry, so applying entry N changes the digest a pre-captured dry-run for entry N+1 depends on. This is the runner correctly refusing rather than a safety bug, but Parts D and H originally implied a single 4-wide dry-run/apply pair — corrected above to a strictly serial, interleaved per-entry sequence.
  2. **This report's own SHA-256 manifest checksum has no corresponding executable implementation** in `buildHealthKitPayload.mjs` (confirmed via exhaustive `--kind` enumeration) and so cannot be mechanically reproduced at Gate 3 without hand-transcribing undocumented prose — flagged as non-authoritative; the real, code-enforced, already-tested drift protection at execution time is the reconciliation runner's own per-observation digest/idempotency fencing (finding 1's mechanism), not this report's checksum. Corrected above: the checksum is now explicitly scoped as a human-readable preparation artifact only, and any real future execution must rely on the runner's built-in fencing.

  No rejection-level defect was found. Gate ordering (Gate 1 before Gates 4/7) was independently judged correct and conservative, not merely assumed.

## Mutation and scope ledger

- Production deployed/mutated: **NO**.
- Policy mutated: **NO** (independently re-verified unchanged).
- Cardio activated: **NO**.
- Deferred Cardio observations reconciled: **NO**.
- Production data mutated: **NO** — every production interaction in this task was a bounded, read-only, zero-write audit (including the deliberate-refusal digest-discovery technique, which is itself zero-write by the runner's own design).
- Midweek's worktrees: not touched.

## Flags

- AUTHORITY_REVERIFIED: YES
- CARDIO_GRADUATION_MACHINERY_REVERIFIED: YES
- CURRENT_DEFERRED_CARDIO_INVENTORY_COMPLETE: YES
- DEFERRED_BACKLOG_COUNT: 4
- DEFERRED_MANIFEST_CHECKSUM_READY: YES (`672f734943afd42c2de48c6993ca34d36951ef4720a2d7ae3e9d6b9ffdcaa107`)
- HISTORICAL_TYPE_LIMITATION_PRESERVED: YES (not inferred, not fabricated, confirmed unrecoverable)
- PROSPECTIVE_TYPE_FIDELITY_DEPENDENCY_PROVEN: YES
- POLICY_REPLACE_DRYRUN_PACKAGE_READY: YES
- DEFERRED_RECONCILIATION_DRYRUN_PACKAGE_READY: YES
- ACTIVITY_PRE_POST_INVARIANTS_READY: YES
- NO_DOUBLE_COUNT_GUARDS_READY: YES
- FOUNDER_ACCEPTANCE_CHECKLIST_READY: YES
- EXECUTION_GATES_READY: YES (10 gates defined)
- FRESH_CONTEXT_REVIEWED: YES
- SERVER_DEPLOYED: NO
- POLICY_MUTATED: NO
- CARDIO_ACTIVATED: NO
- DEFERRED_CARDIO_RECONCILED: NO
- PRODUCTION_DATA_MUTATED: NO
- GH_REPORT_PUBLISHED: YES
- CONTAINS_SECRETS: NO

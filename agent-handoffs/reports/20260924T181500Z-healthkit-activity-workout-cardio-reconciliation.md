# HealthKit Activity/Workout/Cardio reconciliation — bounded forensic audit

Generated: 2026-09-24T18:15:00Z

Task id: `claude-healthkit-activity-workout-cardio-reconciliation-20260924`

Agent: Claude (Remote Control, HealthKit lane), executing `agent-handoffs/inbox/prompts/20260924T132000Z-claude-healthkit-activity-workout-cardio-reconciliation.md`

## Result

**Bounded, read-only forensic reconciliation complete. No production mutation of any kind occurred** — no policy change, no canonical-record write, no relationship confirmation, no Cardio activation, no September 23 repair, no Native build, no Founder-device operation. This report answers all six question groups with production-read evidence and/or source-code citations, and ends with a minimal ordered correction plan and explicit authorization gates, per the task's own closing instruction: "Run the bounded read-only production/source audit above. Do not mutate anything. Publish findings and stop for Founder direction."

## Authority reverified

- Production Server: exact `f8c28700ae32c3a01b1859a988df5f8177a3dd0b`, active deployment `b3e48c28-b002-4b5e-a48b-22acccba8093`, `/live`/`/ready` both HTTP 200 throughout this audit.
- Native: Founder-installed Build 58, release SHA `fd7eed02add35bb9016dcd873018cd0c4ef43265` (metadata-only build-number bump on the exact reviewed candidate `19cbfa10740c0ff5d10e638b57883027349c4b31`), Apple build/import status `VALID`.
- Both worktrees (`/private/tmp/physiqueos-healthkit-current-day-review-server` at `f8c28700...`, `/private/tmp/physiqueos-healthkit-revision-recovery-native` at `fd7eed02...`) confirmed clean and unchanged at the start and end of this audit.
- Daily Activity/Nutrition policy: enabled, `families`/domains `["activity","nutrition"]`, effective 2026-09-22, open-ended, no historical backfill.
- Workout policy: enabled, `families: ["strength"]` only, effective 2026-09-23, open-ended, no historical backfill, `linkAutoConfirm: false`, strategic eligibility quarantined throughout.
- HealthKit graduation (read-projection) policy: **enabled**, `projection.domains: ["activity","nutrition"]`, effective 2026-09-22, open-ended — confirmed by direct bounded read (see Q1). This is load-bearing for Q1's conclusion.

All production reads below used the established guarded console-runner path (owner-scoped `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, `transaction_read_only=on` required, parameterized/collection-API reads only, explicit `ROLLBACK`, success marker emitted only after rollback). One one-off, narrowly-scoped, read-only itemization script (workout-observation identity/telemetry listing) and one one-off read-only single-record fetch (the graduation policy record) were written for this task under the identical safety contract, run once each, and deleted from the worktree afterward — neither was committed.

---

## 1. Sep 23 Activity history-vs-detail divergence

**Verdict: the September 23 Activity 50→51 device repair is NOT REQUIRED.**

### Ground truth from a fresh production read

The canonical HealthKit Activity day for 2026-09-23 has **already self-healed**, via ordinary automatic background sync — no repair was applied by anyone:

- Canonical/source revision: **51/51** (was 50/50 at the last audit ~4 hours earlier)
- Coverage: **`complete_day`** (was `partial_day`)
- `move_calories`: **782.698** ≈ 783 (matches "Recent Activity History" and Apple Fitness's own Move 782/700)
- `exercise_minutes`: **107** (matches History and Apple Fitness's Exercise 107/60)

This is a live, current-database fact, not an inference.

### Root cause of the Detail-screen staleness — proven, not guessed

Both "Recent Activity History" and "Activity Day Detail" are the exact same server resource and the exact same client type:

- Server: `src/application/native/NativeProductionContractService.js:142` routes both to `ProgressEvidenceReadService.getActivity()` → `ProgressReportingService.createProviderActivityEvidenceReport()` → `buildActivityReport()` (`ProgressReportingService.js:896-946`), which builds `latestActivityDay`/`activityHistory` from the **identical** `activityDays` array.
- Native: `ProductionDailyDriverAPI.swift:1661-1691`'s `ProductionActivityAPI` — both `fetchActivityLanding(scope:)` (History) and `fetchActivityDay(date:)` (Detail) call the same `readResource("activity", ...)`; Detail simply looks the date up inside the same array History received.

The live canonical HealthKit day is not frozen anywhere server-side: `PostgresProgressEvidenceReadStore.js:116-122` → `HealthKitGraduationReader.js` `overlay()` runs a **fresh live `SELECT`** against the canonical HealthKit day collection on every single call (confirmed live/enabled — see Authority above), and `Phase4CanonicalRecordStore.list()` is a plain live query every time; nothing persists an intermediate snapshot. Every native API response also carries `cache-control: no-store` (`apiResponse.js:32`) — there is no server-side caching anywhere in this path.

The staleness is a **Native client-side cache asymmetry**, proven from source:

- `FounderServerAPI.swift:501-608`: reads default to `policy: .cacheFirst`, cache key = `resource + query`, TTL 90s for `"activity"`.
- **Cache-key collision**: History's `fetchActivityLanding` keys on the Founder's active scope (e.g. `activity?context=build-lean-mass`). Detail's `fetchActivityDay` always requests `scope: .all` (`ProductionDailyDriverAPI.swift:1678`), landing in a **different, shared** cache bucket (`activity?context=all`) that other callers (e.g. a combined-driver prefetch, `ProductionDailyDriverAPI.swift:1945`) also populate.
- **Refresh asymmetry**: `ActivityHistoryView.swift:80-90` actively busts the cache on pull-to-refresh and on every foreground transition. `ActivityDayView.swift:33-36` (Detail) does neither — it fetches once when pushed and otherwise passively trusts whatever sits in the shared, unrelated `activity?context=all` bucket, however old.
- Unlike Training (which has its own dedicated, date-scoped `"training-day"` resource), Activity's Detail screen was built to reuse the coarse, multi-consumer, un-invalidated cache bucket by design.

This mechanism is sufficient to produce exactly the observed symptom (Detail served a snapshot from before the day's revision advanced further, History fresh because it actively invalidates). The precise multi-hour duration of the staleness window cannot be proven from static source alone (that depends on runtime timing of when the shared cache bucket was last populated by any caller) — but the mechanism itself, and the conclusion that no database repair addresses it, are proven.

### Minimal correction (design only; classified, not applied)

**Classification: Native presentation only.**

- `ios/PhysiqueOS/Presentation/Evidence/ActivityDayView.swift` — add a refresh-on-appear/foreground reload mirroring `ActivityHistoryView.swift:84-90`, and/or
- `ios/PhysiqueOS/Networking/ProductionDailyDriverAPI.swift:1677-1679` (`fetchActivityDay`) — pass `policy: .reload` for this one-off "day truth" screen (bypass cache entirely), or fold `date` into the query so its cache key stops colliding with the shared `context=all` bucket.
- No Server code change, no policy activation, no bounded data reconciliation needed under this diagnosis — the canonical data is already correct.

Stand hours/total-calories/move-goal semantics: not fabricated — the live canonical day (`complete_day`, revision 51) already carries `stand_hours: 12`, consistent with Apple Fitness's own Sep 23 Stand 12/6; the exact "workout calories 321 / non-workout 286" split shown on the stale Detail screen was itself computed from the OLD 606-total snapshot and is superseded by the fresh total, not a value to preserve.

---

## 2. Sep 24 current-day acceptance

**Verdict: current-day Activity and Nutrition acceptance is materially healthy and improving through the day. Treated separately from workout-attribution status per the task's instruction.**

Fresh bounded read (2026-09-22 → 2026-09-24 window):

| Date | Domain | Revision | Coverage | Key values |
|---|---|---|---|---|
| 2026-09-24 | Activity | **4/4** | `partial_day` | move_calories **633.046** ≈ 633, exercise_minutes **64** |
| 2026-09-24 | Nutrition | **2/2** (source rev 3) | `partial_subtotal` | calories **496**, protein **38g**, carbs **34g**, fat **23.5g** |

Both exactly match the Founder's own real-device observations ("Activity 633 active calories," "Recent Activity History Sep24 = 633 active cal / 64 min," "Nutrition 496 calories / 38P / 34C / 24F").

- **Revision advancement**: Activity has advanced from 0 (at the last audit, before Build 58) to 4 today; Nutrition from 0 to 2 (source revision 3) — proving normal, repeated, non-stuck revision progression through the day, not a single lucky read.
- **No starvation/409-loop**: both domains are actively advancing under real device use with no sign of the pre-Build-58 oldest-first historical-collision pattern re-appearing. (Direct 409-response-count log evidence was not queried — outside the exposed guarded audit tooling's read surface — but repeated same-day multi-revision advancement is itself strong evidence against a starvation loop; this is flagged as indirect, not a raw-log proof.)
- **Activity/Nutrition scope independence**: both domains advanced independently and correctly on the same day, matching the architecture's intended isolation.
- No zero/nonzero values were assumed; all values above are the live-read numbers.

**SEP24_CURRENT_DAY_ACTIVITY_ACCEPTED: YES. SEP24_CURRENT_DAY_NUTRITION_ACCEPTED: YES. SEP24_REVISION_ADVANCEMENT_PROVEN: YES.**

---

## 3. Sep 24 workout identity inventory

A bounded, one-off, read-only itemization (see Authority) enumerated every raw HealthKit workout observation stored for 2026-09-24, cross-checked against the existing workout-canary audit:

| # | Apple activity type | Local start–end (America/Chicago) | Duration | Active cal | Avg HR | Reconciliation state | Reason |
|---|---|---|---|---|---|---|---|
| 1 | `52` (Walking) | 11:04:20–11:22:07 AM | 17:47 | 157.58 | 121.07 | `workout_canonicalization_deferred` | `family_not_in_activation_scope` |
| 2 | `50` (Traditional Strength Training) | 11:22:10–11:50:09 AM | 27:59 | 206.21 | 120.14 | **`workout_canonicalized`** | — |
| 3 | `52` (Walking) | 11:50:11 AM–12:06:39 PM | 16:28 | 188.13 | 142.68 | `workout_canonicalization_deferred` | `family_not_in_activation_scope` |

All three match the Founder's own Apple Health record within rounding for every field (time, duration, distance ≈1.00mi/1.01mi, active calories, average heart rate). **Both Indoor Walks reached the Server successfully** and are correctly, deliberately deferred (not lost, not errored) because the currently-enabled workout policy activates only the `strength` family.

The canonicalized Strength workout (`canonicalWorkout` hash `36a18cc3ea`):

- `family: "strength"`, `canonicalType: "traditional_strength_training"`, telemetry exactly as above.
- `storedLinkAssessment: {outcome: "no_match", reason: "no_plausible_logger_session"}`; a **live** re-assessment currently returns `{outcome: "possible_match", reason: "single_session_below_confident_threshold", confidence: 60}` — below the confident-match auto-link threshold (Sep 23's confirmed Strength link was `confidence: 95`). **No confirmed link exists** (`links: []`); `confirmedLinkCount: 0` server-wide for the day.
- Compared against the Training Logger session for the same day (canonical id hash `75e24cb8df`, evidence package `a6f9e07e2f`): 2 exercises / 6 sets (Leg Press Machine: 4 sets 160/180/200/220 lb; Walking Lunge: 2 sets @ 60 lb) — matches the Founder's Workout Detail exactly. `reconciliationMatchBasis: null`, `reconciliationTargetCanonicalId: null` — this Logger session has never been reconciled against the canonical HK Strength workout.
- **No integrity violations**: `workoutsWithMultipleConfirmedLinks: 0`, and neither Indoor Walk is merged into, or confused with, the Strength workout or the Training Logger session (`strengthWorkoutCount: 1`, `cardioWorkoutCount: 0` in the canonicalized view, consistent with both walks being deferred rather than mis-canonicalized).

**SEP24_WORKOUT_INVENTORY_COMPLETE: YES. SEP24_WALK1_FOUND / SEP24_WALK2_FOUND / SEP24_STRENGTH_FOUND: YES. SEP24_STRENGTH_HK_INTERVAL_PROVEN: YES (11:22:10–11:50:09, 27:59, 206.21 cal, HR 120.14). STRENGTH_LINK_IDENTITY_CORRECT: YES (correct workout, correctly NOT confirmed given sub-threshold confidence).**

---

## 4. Explaining the 94-minute Strength presentation

**Proven origin, with an exact source-code mechanism and an exact matching number.**

The Training Logger session's canonical evidence payload carries `metadata.duration_seconds: 5647` (**94.1 minutes** — exactly the "1h34m"/"94 min" shown in Log Training, Workout Detail, and Activity Linked Training Context). This is a hard production-read fact, not inferred.

The mechanism, `src/domain/services/TrainingLoggerAppleHealthService.js` (~lines 235-245), is documented in the code's own comment:

```js
// Native Build 55 supplies `finishedAt`. The commit instant remains a
// server-owned fallback for older/live clients so a completed Logger
// session never stays start-only. It is captured once for the package and
// cannot move on reconciliation replay.
const finishedAt = draft.finishedAt ?? (draft.mode === "live" ? capturedAt : null);
const liveTiming = !matchedStrength && draft.mode === "live" && draft.startedAt
  ? { start_time: draft.startedAt, end_time: finishedAt, duration_seconds: getDurationSeconds(draft.startedAt, finishedAt) }
  : {};
```

When this Logger session committed to the Server, it arrived in `mode: "live"` (no explicit Native-supplied `finishedAt`) with no already-matched Strength telemetry (`!matchedStrength`) — so the Server fell back to using its own commit instant (`capturedAt`, ≈12:56 PM local) as a **synthetic** end time, producing `duration_seconds = 12:56 PM − 11:22 AM ≈ 5640s`. Per the comment, this value is "captured once for the package and cannot move on reconciliation replay" — it does not get corrected even though the real HK Strength workout (11:22–11:50, 27:59, 206.21 cal) later arrived and canonicalized correctly and independently.

Comparison with September 23's Logger session (canonical id `72a73f03b3`) is instructive: its `telemetryPresent` shows `endTime: false, durationSeconds: false` — **genuinely absent, no synthetic value was ever manufactured** for that session (matching the prior confirmed-relationship record's own note). September 24's session, by contrast, did trip the `mode === "live"` fallback. This is a real behavioral inconsistency between the two sessions worth flagging on its own — something about how/when the Sep 24 session committed (relative to Native's own `finishedAt`-sending behavior) differed from Sep 23's.

**Direct answers:**
- Origin: the Logger evidence package's own frozen `metadata.duration_seconds`/`start_time`/`end_time`, not the canonical HK workout's timestamps, not the relationship/link projection (there is no confirmed link), not a merged training context beyond this same frozen field.
- vs. real interval: real HK Strength interval is 11:22:10–11:50:09 (27:59); presented interval is 11:22 AM–12:56 PM (94 min) — the presented end time is synthetic, not HK-derived.
- Relationship correctness: the canonical Strength workout identity itself is correct and uncorrupted; it is simply not linked/confirmed to the Logger session at all (60% live confidence, below auto-confirm threshold; `linkAutoConfirm` is globally off).
- Neither Indoor Walk is merged into or confused with Strength (confirmed in Q3).
- Correct presentation ownership going forward (design principle, not applied): Apple Health telemetry should present the discrete HK workout interval/duration for a HK-sourced Strength workout; the Logger session's own timing metadata, when synthetic/unconfirmed, should not be presented as if it were HK-sourced fact. No synthetic Logger end time should be manufactured going forward for a session that will likely reconcile to a real HK workout shortly after.

**SEP24_94MIN_ORIGIN_PROVEN: YES.**

---

## 5. Cardio graduation design (prospective; not authorized to apply)

Full source-grounded design (see full trace in the working notes; summarized here with exact citations):

### Family classification (already exists, verified)

`src/domain/services/HealthKitWorkoutService.js:20-24,32-64` — Apple activity type `52` (Walking, matching both Sep 24 walks) and `37`/`13` (running/cycling) already classify to **family `"cardio"`** (not a new bucket to invent); `HEALTHKIT_WORKOUT_ACTIVATION_FAMILIES = ["cardio","strength"]` already exists in `HealthKitObservationService.js:275`. `buildHealthKitPayload.mjs`'s own `--families` validator already accepts `strength,cardio` combinations — no operational tooling change is needed to run the activation once authorized.

### Strength's relationship model cannot accidentally fire for Cardio (verified safe)

`assessHealthKitStrengthLinkCandidates` (`HealthKitWorkoutLinkService.js:85-236`) hard-returns `not_a_strength_workout` for any non-`strength`-family workout. The batch relationship reassessment loop explicitly branches Cardio into a separate, link/claim-free `assessHealthKitCardioCoexistence` path (`CanonicalPersistenceCommandPorts.js:837,1121`) that only ever writes a read-only `coexistence` field — never a `healthKitWorkoutLinks` row, never a Training Logger session, never eligible for the manual confirm command (which independently 409s for non-Strength workouts). Cardio therefore **cannot** reach `TrainingLoggerAppleHealthService.js`'s synthetic-duration fallback described in Q4 — that code is only reachable via a confirmed Logger-session link, which Cardio structurally can never acquire.

### Two genuine new risks found (not anticipated going in — change the design)

1. **No atomic "widen policy scope" operation exists.** `HealthKitActivationPolicyRunner.js:305-307` explicitly refuses to modify an already-enabled policy in place ("windows are never widened in place") — adding `cardio` to the currently-enabled Strength-only policy requires a **`deactivate` then `activate`** as two separate, separately-authorized transactions. During the gap between them, `assessHealthKitWorkoutCanonicalization` returns a different reason (`workout_canonicalization_not_activated`) that routes any workout observation arriving in that window through an **older, separate, ungated legacy matcher** (`HealthKitObservationService.js:414-473`) that bypasses the confirmed-link/claims guard entirely. Mitigation: execute deactivate immediately followed by reactivate with no human-review gap in between, timed away from expected sync traffic, and run a `workout-audit` immediately after to confirm nothing landed in an unexpected legacy state during the gap. The reactivation must explicitly re-include `"strength"` in `families` (the new record does not inherit the old one's fields) and should reuse Strength's existing `effectiveLocalDate` (2026-09-23) rather than a fresh date, to avoid retroactively date-barring not-yet-delivered Strength observations.

2. **The already-deferred Sep 24 Indoor Walk observations will NOT be retroactively reconsidered by policy activation alone.** `CanonicalPersistenceCommandPorts.js:503-507`: once an observation identity is stored as deferred for `family_not_in_activation_scope`, any *replay* of that same identity (same bundle+type+externalId) clones the deferred reconciliation forward untouched, forever — canonicalization only ever runs at genuinely-first-ingestion time. No "reconsider deferred observations" runner exists today (the closest precedent, `HealthKitWorkoutLinkReassessmentRunner.js`, reassesses an already-canonical workout's *link*, not a raw deferred observation's canonicalization eligibility). **A new, narrowly-scoped, dry-run/apply, authorization-gated reconciliation script — bounded to exactly the two named Sep 24 Indoor Walk observation identities — must be built** to canonicalize them in place; a fresh HealthKit re-sync of the same walks after policy activation will not do it on its own.

3. **Whole-day Activity-total derivation for Cardio is designed but dead/unwired code today.** `composeDailyActiveEnergyWithWorkouts` (`HealthKitWorkoutService.js:229-237`) already implements exactly the correct non-additive, family-agnostic, no-double-count model — but it is called from nowhere except its own test. The live presentation path (`ProgressReportingService.js`'s `getActivityDaysWithTrainingAggregates`/`mergeActivityDayWithTrainingAggregate`) derives workout/non-workout calories exclusively from **Logger-session-linked** workouts, which by construction excludes Cardio (no Logger session, ever). **Canonicalizing the two Sep 24 walks will not, by itself, change any number or add any visible surface in the shipped app** — a canonicalized-but-unlinked Cardio workout has no presentation path today (`HealthKitWorkoutPresentationService.js`'s presenter also gates on `family === strength`). Wiring Cardio into the Activity-total derivation and/or building a display surface for it is genuinely new, separate engineering scope — its own decision, its own authorization.

### Design (mirrors Strength's own activation template exactly)

```
{
  effectiveLocalDate: "2026-09-23",   // reuse Strength's date; see risk 1
  openEnded: true,
  strategicEvidenceEligibility: "quarantined",
  historicalBackfill: false,
  linkAutoConfirm: false,
  families: ["cardio", "strength"],   // both — must re-include strength
}
```

- Each Indoor Walk canonicalizes as its own distinct workout, preserving its own UUID/telemetry — no merge with Strength or with each other (family/type/timestamp identity already keeps them distinct; nothing in the classifier or reconciliation path merges same-day workouts of different families or the same family).
- No Training Logger session is ever created for Cardio (confirmed structurally impossible above).
- `linkAutoConfirm` and strategic eligibility stay off/quarantined for Cardio initially, matching Strength's own conservative precedent before its prospective graduation.

### Authorization gates (five, explicitly not to be bundled)

1. Deactivate the current workout policy (data-inert; own authorization/audit row).
2. Reactivate with `families: ["cardio","strength"]` (own authorization; must be reviewed for the re-inclusion of strength and the chosen `effectiveLocalDate`).
3. Bounded reconciliation of the two specific already-deferred Sep 24 Indoor Walk observations (new code required; own authorization; not combinable with #2 — policy activation does not touch already-stored deferred observations).
4. (Only if pursued) Wiring Cardio into Activity-total derivation and/or a presentation surface — new user-visible behavior, its own authorization, independent of #1-3.
5. The operator sequencing of #1→#2 itself (back-to-back, no gap, timed away from live sync traffic, followed by an immediate post-hoc `workout-audit`) — its own explicit go/no-go given the narrow data-integrity risk window identified above.

### Regression coverage to add before implementation (names only)

- `CanonicalPersistenceCommandPorts.test.js`: cardio canonicalization creates no link/claim/Logger session; same-day cardio→strength→cardio canonicalizes to three distinct workout ids with no duplicate-pair report and the confirm-command 409s against either cardio id; a replayed `family_not_in_activation_scope` observation keeps that state verbatim even after the family is added to policy (locks in risk #2 as deliberate).
- New `HealthKitDeferredWorkoutReconciliationRunner.test.js` (mirroring `HealthKitWorkoutLinkReassessmentRunner.test.js`): refuses off-state observations; dry-run predicts exactly one new canonical workout and nothing else; apply is idempotent (a second apply is a no-op, matching the existing `already_reassessed` pattern); post-apply invariants (exactly one new canonical workout, observation flipped to `WORKOUT_CANONICALIZED`, no link row, all other workouts digest-unchanged).
- `ProgressReportingService.test.js` (only if risk #3's wiring is separately authorized): whole-day total invariant when a previously-deferred cardio workout becomes canonicalized; non-workout calories decreases by exactly the newly-canonicalized workout's active calories with no double-count against the existing Strength contribution — written to fail today, proving the gap, until the wiring lands.

**CARDIO_DEFERRED_STATE_PROVEN: YES. CARDIO_GRADUATION_DESIGN_READY: YES (with the two new risks above requiring explicit sign-off before implementation). ACTIVITY_DOUBLE_COUNT_GUARD_DEFINED: YES for the already-correct-but-unwired model; NOT YET WIRED for live presentation (risk #3).**

---

## 6. Unified correction sequence

Ordered, minimal, each gate separate:

| # | Item | Classification | Depends on | Authorization needed |
|---|---|---|---|---|
| A | Sep 23 Activity detail/history consistency | Native presentation only | — | Yes — Native code change (cache-key/refresh fix in `ActivityDayView.swift`/`ProductionDailyDriverAPI.swift`), its own build/TestFlight cycle |
| B | Sep 24 Strength telemetry/presentation (94-min fix) | Server code only (presentation-layer read fix: stop surfacing a synthetic/unconfirmed Logger duration as if HK-sourced) + optionally a bounded one-off correction of this one frozen evidence package's `duration_seconds`/`end_time` | — | Server code change: own authorization. Any correction of the already-frozen Sep 24 evidence package's synthetic fields: separate bounded-data-reconciliation authorization (narrowly scoped to this one record) |
| C.1 | Cardio: deactivate workout policy | Policy activation | — | Own authorization |
| C.2 | Cardio: reactivate with `families:["cardio","strength"]` | Policy activation | C.1, immediately after | Own authorization |
| C.3 | Cardio: reconcile the 2 specific already-deferred Sep 24 walk observations | Bounded data reconciliation (new runner) | C.2 | Own authorization |
| C.4 | Cardio: wire Activity-total derivation / presentation surface | Server code only (new engineering scope) | C.3 (to have anything to show) | Own authorization — separate decision on whether this is wanted yet |
| D | Activity workout/non-workout attribution recompute (whole-day, no double count) | Server code only, part of C.4's scope | C.3, C.4 | Covered by C.4's authorization |

None of A–D are bundled; none were applied by this audit. A and B do not depend on Cardio at all and can proceed independently and immediately once authorized. C.1–C.4 are strictly sequential and each needs its own sign-off, per the task's explicit instruction not to bundle policy/data writes into code fixes.

Current correct Activity/Nutrition current-day ingestion (Q2) is not disturbed by any item above — none of A–D touch the daily Activity/Nutrition policy or its read path.

---

## Mutation and scope ledger

- Production database mutation: **NO**.
- Policy mutation: **NO**.
- Cardio activation: **NO**.
- September 23 repair: **NO** (and, per Q1, not needed).
- Native build/archive/upload: **NO**.
- Founder-device operation: **NO**.
- Briefings/Midweek: not touched.
- Two one-off read-only diagnostic scripts were authored, run once each under the full established safety contract, and deleted (not committed) — used only for itemizing raw Sep 24 workout observations and reading the graduation-policy record.

## Next recommended action

Two independent, low-risk, no-Cardio-dependency items are ready for the Founder to authorize immediately if desired:
- **Item A** (Sep 23 History/Detail consistency) — a small Native fix, next Native build cycle.
- **Item B** (94-minute Strength presentation) — a Server presentation-layer fix; whether to also correct the one already-frozen Sep 24 Logger evidence package's synthetic timing is a separate, narrower decision.

The Cardio graduation (C.1–C.4) is design-ready but carries two newly-identified structural risks (the deactivate/reactivate gap, and dead-code Activity-total wiring) that should be reviewed before scheduling; each of its four steps needs its own explicit authorization in sequence.

This agent is stopping here for Founder direction, per the task's instruction, before any implementation, policy activation, or reconciliation.

## Flags

- AUTHORITY_REVERIFIED: YES
- SEP24_CURRENT_DAY_ACTIVITY_ACCEPTED: YES
- SEP24_CURRENT_DAY_NUTRITION_ACCEPTED: YES
- SEP24_REVISION_ADVANCEMENT_PROVEN: YES
- SEP23_HISTORY_DETAIL_DIVERGENCE_PROVEN: YES
- SEP23_CURRENT_CANONICAL_REVISION: 51 (complete_day)
- SEP23_REPAIR_STILL_REQUIRED: NO
- SEP23_REPAIR_NOT_REQUIRED: YES
- SEP24_WORKOUT_INVENTORY_COMPLETE: YES
- SEP24_WALK1_FOUND: YES
- SEP24_STRENGTH_FOUND: YES
- SEP24_WALK2_FOUND: YES
- SEP24_STRENGTH_HK_INTERVAL_PROVEN: YES
- SEP24_94MIN_ORIGIN_PROVEN: YES
- STRENGTH_LINK_IDENTITY_CORRECT: YES
- CARDIO_DEFERRED_STATE_PROVEN: YES
- CARDIO_GRADUATION_DESIGN_READY: YES
- ACTIVITY_DOUBLE_COUNT_GUARD_DEFINED: PARTIAL (correct model exists, not wired to live presentation)
- UNIFIED_CORRECTION_PLAN_READY: YES
- PRODUCTION_MUTATED: NO
- POLICY_MUTATED: NO
- CARDIO_ACTIVATED: NO
- SEP23_REPAIRED: NO (not required)
- GH_REPORT_PUBLISHED: YES
- CONTAINS_SECRETS: NO

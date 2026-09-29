# HealthKit Cardio → V3 graduation: inert candidate deployed, two more bugs found/fixed/deployed, final pre-activation audit PASSED — activation blocked pending explicit authorization

Generated: 2026-09-27T00:15:00Z

Task: `claude-healthkit-cardio-v3-deploy-fix-activate-20260926`, executing `agent-handoffs/inbox/prompts/20260926T235000Z-claude-healthkit-cardio-v3-deploy-fix-activate.md`

## Result

**Steps 1–3 of the authorized sequence are complete. Step 4 (adding `cardio_training` to the live evidenceEligibility domains) is prepared, dry-run verified against production, and awaiting one more explicit Founder authorization sentence before executing — the environment's auto-mode permission classifier gates this specific production feature-flag write separately from the code deploys already completed.** No production data mutated by anything below except the two authorized, verified code deployments; no historical artifact regenerated; Strength untouched; no device operated.

## Step 1: inert candidate deployed and verified

Commit `cc8bd0b706e155223b112d44a95d93680d0a0054` (the Phase 1 Cardio graduation candidate, already reviewed per the prior report) pushed to `combined-app-platform-cutover` and deployed (App Platform deployment `b5efd6f1`, reached ACTIVE 9/9). Post-deploy verification: both `web` and `worker` `source_commit_hash` confirmed `cc8bd0b7`; `/health/live` and `/health/ready` both 200 with `buildId: physiqueos-cc8bd0b7-20260926`; no migration drift (schema check still `PROVIDER_MIGRATION_000014_APPLIED`); a bounded zero-write simulation confirmed the live graduation policy's `evidenceEligibility.domains` unchanged (`["activity","nutrition"]`) and all real data counts (572 evidence objects, 79 activity days, 246 training objects, 7 Cardio + 3 Strength workouts) identical before and after — the deploy touched code only.

## Step 2: two additional defects found, fixed, tested, reviewed, and deployed

While implementing the requested Photo Event narrative fix, self-review surfaced a defect in my own prior commit, not previously caught:

1. **Graduated evidence-object wrapper shape gap.** `overlayGraduatedHealthKitCardioWorkouts` produced objects with only `{id, canonicalId, payload}` — missing the top-level `evidence_type`/`quality`/`lastObservedAt`/`firstObservedAt`/`createdAt`/`updatedAt`/`userId` wrapper fields the established canonical-evidence-object contract requires (see the existing, already-live `projectActivityDay`/`projectNutrition` in the same file). Several real consumers (`WeeklyNarrativeService`'s `within(item.lastObservedAt)` week-window filter in particular) read these at the wrapper level, not inside `payload` — meaning a graduated Cardio workout would have been silently invisible to them once the scope went live, defeating this task's own purpose. Fixed by stamping the same wrapper shape.

2. **`PhotoEventNarrativeService.js` resistance-training mislabel** (the defect the task explicitly asked to be fixed): `deriveExecutionSupport` counted any `evidence_type: "training"` record toward "Resistance training was consistent through the week" with no resistance-specific filter. Fixed by reusing the same predicate `WeeklyNarrativeService.js` already uses for this exact distinction (Logger `exercises` present, or a strength/resistance/lifting/weights label) — extracted into a new, dependency-free `TrainingEvidenceClassification.js` rather than importing `WeeklyNarrativeService.js` directly, because a first attempt at that direct import pulled in its large composition graph and broke `productionPhotoEventNarrativeComposition.test.js`'s "no legacy read" boundary test — caught immediately by rerunning the regression suite and corrected.

A follow-on fresh-context review of this fix (separate from the review of Step 1's candidate) approved it as safe to deploy, and found one additional minor gap: the graduated Cardio wrapper was also missing a top-level `provenance` field relative to the `projectActivityDay`/`projectNutrition` reference shape (a read-model display field degrades gracefully to null without it — not narrative-affecting). Fixed in a small follow-up commit.

**Validation**: new/updated deterministic tests for all three fixes, RED/GREEN mutation-verified. Full affected regression suite (10 files, 145–106 tests across runs) passes with no regressions. A targeted before/after comparison against the previously-deployed baseline confirmed the only test-file-level change from this fix is its own new coverage — the same 9 pre-existing, unrelated failures (missing local fixtures, e.g. `private/founder/runtime-store.json`) are present in both runs, proving nothing else broke.

**Deployed**: commits `74652b025d1aaf236d0b42fb5fc609d23f2b934f` + `49211870c552b104aaf7840939f55d9dc9ecc1df` pushed to `combined-app-platform-cutover` and deployed (deployment `3134643d`, reached ACTIVE 9/9). Post-deploy verification identical in kind to Step 1: both services confirmed on `49211870`, health checks green, no migration drift, live policy still unchanged, all real data counts identical.

## Step 3: final pre-activation audit — PASSED

Reconfirmed all required properties, several via a live integration test run against the actual deployed code (not just synthetic unit assertions):

- **Cardio canonical/presentation pipeline remains accepted**: unaffected, unchanged by this task (already-live `a399916a`).
- **No Activity/workout strategic double counting**: proven via zero-write simulation (`activityDayUnchanged: true`) and by construction (a separate `evidence_type: "training"` object, never merged into `activity_day`).
- **Duplicate suppression remains intact**: proven against real production data — all 7 real canonical Cardio workouts in the Sep 1–26 window are correctly duplicate-suppressed against existing Founder-logged Training evidence.
- **Strength reconciliation remains separate**: the `family !== CARDIO` guard (defense-in-depth, backed by the presentation projector's own independent family check) means Strength never graduates under this scope regardless; confirmed via test and against real data (0 of 3 real Strength workouts ever graduate).
- **Historical generic Cardio is not relabeled Indoor/Outdoor**: confirmed — the presentation label is derived only from the stored `canonicalType` at ingestion time (never inferred), and the workout classifier has exactly one caller, at ingestion, with no retroactive reassessment sweep for Cardio (unlike Strength links, which do have one, per the unrelated `524f1882` commit).
- **No historical briefing/Confidence/Narrative/Goal artifact regeneration**: both deploys are code-only; the official guarded ops tool's own dry-run reports `historicalBriefingRegeneration: false` / `historicalBriefingsRegenerated: 0`.
- **Ordinary low-materiality Cardio does not mechanically alter Confidence or force a Narrative mention**: proven with an integration test run against the real deployed code — 4 ordinary walks (`no_other_source`, non-duplicate) correctly reach evidence (`applied: 4`) but produce **no** resistance-training narrative claim from the now-fixed `deriveExecutionSupport`. Separately reconfirmed the Confidence model (`CanonicalConfidenceAssessmentModel.js`) has zero references to a `"training"` evidence-type string.
- **Material Cardio can enter the normal evidence pipeline prospectively**: the same integration test confirms the graduated objects carry the correct `evidence_type: "training"`, full wrapper fields, and correct provenance.

**One transparency note, not a blocker**: the official guarded `healthKitGraduationPolicy` ops tool's own dry-run simulation only models the day-based Activity/Nutrition overlay (`overlayGraduatedHealthKitDays`) — it does not simulate the Cardio workout overlay at all, and self-reports this (`"trainingAndWorkoutChanges":"none"`). This is a pre-existing scope limitation of that tool, not something this task's diff introduced or was asked to fix. I compensated by independently verifying the real Cardio effect via my own separate zero-write simulation tooling (`healthKitCardioStrategicGraduationSimulation.entry.mjs`, built as part of this work) directly against real production data.

## Step 4: activation dry-run verified, apply blocked pending authorization

Ran the official guarded dry-run against production with the exact target policy (`evidenceEligibility.domains: ["activity","nutrition","cardio_training"]`, preserving the existing `startLocalDate: "2026-09-22"`, `endLocalDate: null`, and leaving `projection` completely untouched). Confirmed: `changed: true`, the diff is exactly the one intended domain addition, `unchangedByDesign` counts match the pre-deploy baseline exactly (371 observations / 12 canonical days / 572 evidence objects / 10 canonical workouts — zero drift from the dry run itself, as expected of a rolled-back read), and `historicalBriefingRegeneration: false`.

**Blocked**: building/executing the guarded `apply` payload (the actual production feature-flag write) was denied by the Claude Code auto-mode permission classifier under a distinct category, `[Feature Flag Writes]` — separate from the `[Production Deploy]` gate the two code deploys above needed. Per this lane's established protocol for this classifier, I stopped immediately rather than attempting any workaround, and am holding for the Founder's explicit authorization sentence for this exact action before proceeding. The GH task's own written authorization ("Founder authorizes adding cardio_training... using the established guarded policy operation") does not by itself satisfy this environment-level gate — a live chat confirmation is required each time, as has been true for every production-mutating action in this lane so far.

## What happens once authorized

Apply the guarded operation with the dry-run-verified `desired` policy and the exact `expected` facts digest captured from the dry run above (refuses automatically if anything drifted in between). Then: verify the live policy contains `activity`, `nutrition`, `cardio_training` and that Strength remains outside this path; run a bounded zero-write validation of the resulting live evidence projection; publish the final HealthKit Cardio Phase 1 closeout report exactly as the task's Step 5 specifies. No briefing will be manually generated or historical artifact rewritten to "prove" activation — natural future V3 briefing generation is the live acceptance point, per the task's own instruction.

## Decisions required

1. **Explicit authorization** for the guarded `healthKitGraduationPolicy` apply operation adding `cardio_training` to the live `evidenceEligibility.domains` (preserving `activity`, `nutrition`, and the existing start date) — the dry run above shows exactly what this would do.
2. No other open decision from this report; Strength diagnosis and the batched next-Native-candidate work remain queued after this Cardio/V3 sequence closes out, per the standing sequencing.

## Safety

No production data mutated beyond the two authorized, verified code deployments (`cc8bd0b7`, `49211870`) and read-only dry runs. No historical artifact regenerated. No Founder device operated. Sep 24 Strength case untouched, not retried.

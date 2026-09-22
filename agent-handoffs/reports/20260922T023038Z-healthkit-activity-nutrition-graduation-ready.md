# healthkit-activity-nutrition-graduation-ready-20260921 - completion report

Task id: healthkit-activity-nutrition-graduation-ready-20260921

## Outcome

The complete production graduation path for HealthKit Activity and Nutrition is built, tested, independently reviewed and deployed dormant. Server 93491bc5 (deployment 1156849f-d5af-47ec-a5d3-d247a99033ee, ACTIVE, web and worker, health live and ready 200) adds a Server-owned graduation policy with two independent scopes, both absent in production. Nothing about the active 2026-09-21 Activity + Nutrition proving day changed, no HealthKit record became strategic Evidence, and no Training/Workout/Confidence/briefing code changed. Native candidate c116867f (reviewed, not built or uploaded) extends the pending Build 50 lineage with the two small UI changes graduation actually needs.

## Part A - why the days were invisible, and the smallest fix

healthKitCanonicalDays is an application-only collection; every normal read model (Log, Activity/Nutrition detail and history, Energy, Evidence Hub, the Photo Event's V3 evidence universe, the recurring-briefing generation snapshot) consumes a canonicalEvidenceObjects array that never contained them, and HEALTHKIT_STRATEGIC_EVIDENCE_ELIGIBLE is a hard-coded false. The smallest fix is a pure, read-time overlay (no write, no schema change) that projects an accepted canonical day into the ordinary activity_day / nutrition object shape for exactly the array a reader is about to consume, gated by a Server-owned policy.

## Architecture

HealthKit canonical day (healthKitCanonicalDays, unchanged, quarantined) -> policy-gated read-time overlay (HealthKitGraduation.js, never persisted) -> the SAME existing selectors, presentation, Energy pairing and V3 adapters every other source already uses. There is no HealthKit-specific strategic category. Two independent, exact-domain/exact-date Server-owned scopes in one policy record (healthkit_canonical_graduation_policy):

- projection: normal Log rows, Activity/Nutrition detail and history, Energy detail, Evidence Hub landing and timeline, operating plan (any coverage; a partial "so far" day is shown as partial).
- evidenceEligibility: V3/Energy observations/briefings, through the recurring-briefing cadence generation snapshot and the Photo Event's own bounded V3 evidence universe (complete day only).

Neither implies the other. A malformed policy record disables both and never throws. historicalBriefingRegeneration is not a parameter; the policy is invalid if it names anything but false.

## Server changes (candidate 93491bc5 on production base 3e5e6758)

- src/domain/services/HealthKitGraduation.js (new, pure): resolveHealthKitGraduationPolicy, assessHealthKitGraduation, projectHealthKitCanonicalDay, overlayGraduatedHealthKitDays. One logical day per domain and date: Activity reuses the existing source-authority and coverage precedence (a partial HealthKit snapshot never outranks an ordinary day; an existing explicit Founder correction or manual entry is never silently overridden by a device); Nutrition reuses the existing daily-total authority contract (a device full-day total outranks meal-derived, partial or OCR-summary totals; a Founder-typed full-day total or another device total is never overridden; independent meal detail is preserved as detail, never overriding the authoritative total). Disagreement is surfaced, never silently overwritten. Zero-meal Nutrition is a complete, valid, high-reliability day; no meal is fabricated. Workout energy is never added to Activity.
- src/platform/database/HealthKitGraduationReader.js (new): the one sanctioned read seam, memoizing one policy lookup per explicit run and otherwise always re-fetching (never a stale cache outside a bounded run), fail-closed to the ordinary array on any error.
- Seams (enumerated by a structural test, no other reader may import the overlay): Progress evidence store (Activity/Nutrition/Energy lists), Progress hub store (Evidence Hub landing), Evidence timeline store, Core navigation store (Log and operating-plan only; the policy row rides in the same provider query, so Log stays one query when off and when on), the recurring-briefing cadence composition (evidence purpose; a read-only generation snapshot; the publication and Confidence stores keep the raw, non-overlaid runtime), and the Photo Event's V3 evidence universe (evidence purpose, bounded to the Event's own window; the Event's own canonicalObjects are never overlaid).
- src/platform/operations/HealthKitGraduationPolicyRunner.js (new): the ONLY writer. The dry run IS the graduation simulation (runs the real overlay against stored state); apply needs the dry-run facts and an authorization reference, refuses on drift, writes exactly the policy record and one audit row, verifies in the same transaction that the canonicalization and Workout policies, canonical days, observations, links, claims and Evidence are byte-identical, and a completed-day simulate-complete option (dry-run only, refuses to apply) previews a still-partial day.
- Minimal Log-row copy: a zero-meal device daily total is never described by a meal count it does not have; the Activity and Nutrition rows attribute Apple Health when it is the actual source, including a device total merged alongside independent meal detail. Progress reporting marks Apple Health "Connected" only when a graduated day actually names it.
- No schema migration.

## Native candidate (c116867f, on Build 49 candidate 2bfbf54a / pending Build 50 candidate d96db0d0; not built or uploaded)

Confirmed the Log page needs no Native change: LoggedTodayCardView already renders only the Server-composed summary/context strings, and destination decoding already routes a HealthKit-shaped Nutrition day id to the ordinary day screen. The only Native delta: a zero-meal Nutrition day (any populated macro, not calories alone) reads "Daily totals only. No meal detail for this day." instead of "No meals recorded", and the meals-per-day average only counts days that actually carry meal detail (relabeled "Average Meals per Detailed Day" so it is not confused with the adjacent, differently-denominated "Logged Days" tile). No new card, banner or dashboard. No HealthKit/Workout/entitlement/build-metadata file touched.

## Backend projection and source reconciliation

Singleton logical day per domain/date in every graduated read (structurally proven: selection diagnostics stay empty). Deterministic, semantic source reconciliation, never last-write-wins (tested against a screenshot, an OCR summary, a Founder manual/corrected entry, and meals whose sums exceed a device total). Observed local date owns the day. Apple Watch active energy is the identical underlying wearable measurement whether it arrived as a screenshot or direct HealthKit; the two are never stacked, and workout calories are never added on top.

## Normal Evidence/V3 eligibility

No healthkitEvidence parallel universe. When the evidence scope is on, an eligible complete canonical day reaches V3/Energy/briefing generation as the identical ordinary observation another source would produce (source-invariance tests: same Activity value from a screenshot vs HealthKit gives the same factual Energy observation, status, direction, confidence and limitations, with only source/reliability metadata differing; same for Nutrition daily totals; same canonical inputs give the same Energy fact; two representations of one day never produce two observations). No HealthKit-specific V3 switch exists. Confidence is unaffected beyond the existing evidence-quality model. Historical published briefings cannot regenerate: the overlay never persists anything and the late-evidence/freshness machinery only reacts to a real canonical-evidence commit.

## Explicit graduation policy and runbook

Both scopes are independently controlled by the one policy record; rollback (turning a scope off) stops future use prospectively and deletes nothing. Runbook for the future GREEN completed-day moment (not run in this task):

1. Verify the completed-day Activity + Nutrition audit is GREEN.
2. Verify Server authority (this candidate deployed, both scopes still absent) and, if the Native UI delta is wanted, that a build containing c116867f is installed.
3. Run the graduation dry run (buildHealthKitPayload --kind graduation --mode dry-run --desired <json>, optionally --simulate-complete first). It reports the exact dates/domains affected, projection changes, duplicate suppression, predicted Log rows, Energy inputs, Nutrition authority, V3 eligible-day count, and states no historical briefing regeneration and no Training/Workout change.
4. Founder authorizes the transition in chat.
5. Apply with the dry-run facts and an authorization reference (projection first, then a separate apply for evidence eligibility).
6. Verify Log/Evidence/Activity/Nutrition rows and the Apple Health source label.
7. Verify V3 sees the canonical facts once.
8. Verify no historical briefing changed.
9. Continue normal operation; rollback is the same operation with a scope set off.

## Sep 21 graduation simulation (plumbing proof, not acceptance)

A live, read-only dry run was run against the deployed SHA with both scopes set to a would-be-enabled window covering 2026-09-21. It correctly predicted a projected Activity day and, once real Nutrition evidence for that date appeared in production during this session (an ordinary Founder submission through the normal Evidence pipeline, unrelated to this task), correctly kept the existing evidence and withheld the HealthKit day rather than overriding it - proving the semantic precedence rule holds against real state, not just fixtures. No production value is reproduced here per the no-raw-export policy; the counts and mode decisions were confirmed in the sanitized JSON facts only (evidenceCount 563, canonicalDayCount 2, canonicalWorkoutCount/linkCount/claimCount 0, eligibleObservationDaysAdded 0 with eligibility off).

## Tests, review, deployment

- Server: unit 8517 tests (+80 over the base) with the identical 298 pre-existing failures and zero new; all ten phase suites identical failure sets to the base (migration-safety 15, phase3 1, phase6 3, phase6.photo 2, others 0); ESLint clean; exact-SHA production build succeeded.
- Native: full suite 1258 tests, 0 failures (up from the Build 50 candidate's 1257, plus one new regression test).
- Independent fresh-context review, Server: found one real BLOCKER on the first candidate (d78e70ef) - the Activity merge could silently override an existing explicit Founder correction because the merge only checked the incoming HealthKit side for an explicit-correction marker, never the existing side, so a Founder-typed correction could be silently replaced by a lower-authority device read. Fixed (a guard now protects an existing explicit correction or plain manual entry; both the author and the reviewer independently mutation-tested the fix against the reviewer's exact failing input). Three further minor/note fixes: a seam-level test proving the policy is re-fetched across separate reads rather than staying cached; a corrected doc comment; Log-row Apple Health attribution when a device total is authoritative alongside independent meal detail. Two further seam commits (Evidence Hub landing, Photo Event V3 evidence universe) were reviewed with the same adversarial criteria. Final verdict: APPROVE on 93491bc5.
- Independent fresh-context review, Native: found one real MAJOR - the zero-meal copy gated on calories alone, so a day with populated macros but no calories value would still show the stale "No meals recorded" string. Fixed (checks any populated macro), plus a label rename removing a denominator ambiguity between two adjacent report tiles and a locale-independent test fix. Recommended merging into the Build 50 lineage since the two commits are file- and risk-orthogonal. Final verdict: APPROVE WITH NON-BLOCKING FOLLOW-UPS on c116867f.
- Deployed with the Founder's chat authorization via a fast-forward push, spec stamp and force-rebuild deployment. The stale-commit spec-deployment gotcha recurred in a new form this time (the deployed commit hash was correct but the PHYSIQUEOS_GIT_SHA/PHYSIQUEOS_BUILD_ID environment values are a separately-maintained spec field, not auto-derived, and had not been updated); corrected and redeployed as 1156849f-d5af-47ec-a5d3-d247a99033ee, confirmed live via a direct runtime probe of the corrected value. Preservation refs pushed: claude/healthkit-graduation-server and claude/healthkit-graduation-native.

## Zero-write and Sep 21 proving-day proof

Bounded read-only baselines before and after the deploy show the HealthKit-specific collections (healthKitCanonicalDays, healthKitConfiguration, healthKitObservations) byte-identical, with their most recent write timestamps unchanged from the day before this deploy - confirming this deploy wrote nothing to any HealthKit collection. No healthkit_canonical_graduation_policy record exists. Training, goal, confidence and briefing record digests are unchanged. The Sep 21 policy and canonical Activity/Nutrition days are the same records observed at task start. Unrelated to this deploy, ordinary Founder Evidence-intake activity (a normal photo/evidence package -> review -> commit) occurred in production during the deploy window with timestamps that land inside it; it is documented here for honesty and is not something this task's code path can cause (it touches no evidence write path) - confirmed by cross-referencing the exact write timestamps against the deploy's own build/deploy phases.

## Flags

NORMAL_ACTIVITY_PROJECTION_READY=YES
NORMAL_NUTRITION_PROJECTION_READY=YES
LOG_UI_HEALTHKIT_READY=YES (no Native change needed; Server-composed rows already render)
EVIDENCE_HUB_HEALTHKIT_READY=YES
NUTRITION_ZERO_MEALS_VALID_UI=YES
SOURCE_PROVENANCE_UI_READY=YES
ACTIVITY_SOURCE_INVARIANCE_PROVEN=YES
NUTRITION_SOURCE_INVARIANCE_PROVEN=YES
ENERGY_SOURCE_INVARIANCE_PROVEN=YES
DUPLICATE_STRATEGIC_OBSERVATION_PREVENTED=YES
PROJECTION_POLICY_INDEPENDENT_OF_ELIGIBILITY=YES
EVIDENCE_ELIGIBILITY_POLICY_READY=YES
HISTORICAL_BRIEFING_REGEN_DISABLED=YES
WORKOUT_FOUNDATION_UNCHANGED=YES
SEP21_TESTDAY_UNCHANGED=YES
SERVER_DORMANT_GRADUATION_PLUMBING_DEPLOYED=YES
NATIVE_GRADUATION_CANDIDATE_READY=YES (reviewed; not built or uploaded; extends the pending Build 50 lineage)
GRADUATION_SWITCH_ENABLED=NO
READY_TO_GRADUATE_AFTER_COMPLETED_DAY_GREEN=YES

## Follow-ups and findings

- Fixed during this task (not latent): the Activity manual-correction override (BLOCKER), the Native zero-meal copy gate (MAJOR), and four further minor/note items (policy-lookup staleness test, a misleading doc comment, Log-row attribution on a merged Nutrition day, a report-label ambiguity).
- Process note: the App Platform PHYSIQUEOS_GIT_SHA/PHYSIQUEOS_BUILD_ID spec fields are not derived from the deployed commit; a future deploy must update both explicitly, not only fast-forward the branch, or exact-SHA production-gated tooling will fail closed against the live runtime with a stale value even though the deployment record itself shows the correct source_commit_hash.
- Backlog preserved: completed-day Activity + Nutrition Sep 21 revision and audit (Founder sets the canary date back to 2026-09-21 before the after-midnight sync; needs a new task id); Build 50 archive and upload after Activity + Nutrition acceptance, now carrying both the dormant Workout canary and this graduation UI (Founder decision: keep waiting, no change); display-only projection was this task's own scope and is now live dormant; HealthKit background delivery and a durable Native revision floor; Workout Logger draft survival; Photo tap-to-expand production mismatch; Coaching Updates delivery-time UI cleanup.

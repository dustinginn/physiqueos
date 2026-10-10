# Goal Adaptation: Phase 0 + Phase A implementation candidate (dormant)

- Task id: `claude-goal-adaptation-phase0-phasea-20261010`
- Prompt: inbox `20261009-claude-goal-adaptation-phase0-phaseA-authorized.md` at `090d2e19`
- Generated: 2026-10-10T05:22Z
- **Status: candidate complete; dormant; awaiting Founder review of thresholds and behaviour.**
  - Not deployed. No production writes. No Native or TestFlight change. No schema migration. No activation. Release pointer unchanged.

## Candidate

| Item | Value |
|---|---|
| Branch | `claude/goal-adaptation-phase0-phaseA-20261010` (from production `85a98025`; candidate only, never merge directly) |
| Phase 0/A core | `1c4f8c901da12adfc002da0122127b5871cad4a8` |
| Docs + read-only payloads | `f48c229d` |
| **Final candidate head** (adds the remaining Phase A rungs and the scenario gate) | **`5d4701e757872cf83f4c92901dd10465fa4bae38`** |
| Production at the time | Server `85a98025`, deployment `40122906` ACTIVE (web and worker match); Native Build 94 `49829781` |
| Code | `src/domain/goalAdaptation/**` (new) and a 13-line opt-in hook in `src/domain/intelligence/v3/ConfidenceNarrativeV3Pipeline.js` |
| Design notes | `docs/GOAL_ADAPTATION_PHASE0_PHASEA.md` |
| Commits on GitHub | https://github.com/dustinginn/physiqueos/commit/1c4f8c901da12adfc002da0122127b5871cad4a8 · https://github.com/dustinginn/physiqueos/commit/5d4701e757872cf83f4c92901dd10465fa4bae38 |

## What was built

### Phase 0: policy and contracts

No runtime wiring.

**`goal_adaptation_policy_v1`** has status `draft_requires_founder_review` and activation `off`. It encodes the Founder refinements:
- **DEXA is never required.** Evidence is goal-specific and source-flexible: lean-mass gain, fat loss, maintenance and strength each have their own rules. A scan only adds precision; without one, lean tissue is reported as "estimated".
- **Photos** never yield an exact body-fat value, and count only once validated.
- **Three separate questions:** evidence coverage, plan adherence, and strategy sustainability.
- **Missing data is not nonadherence.**
- **HealthKit domains** (nutrition, activity, steps, workouts, sleep) are never prompted for manually.
- **The 28-day first checkpoint** is not a guarantee of a proposal and not a delay for safety exceptions.
- **Below range while gaining** is watched and coached first; it is reviewed only once it persists.
- **Triggers:** Weekly and Monthly originate a proposal, DEXA is optional, Photo only when reliable and corroborated, Midweek link-only.

**Additive contract builders:**
- adaptation recommendation (lifecycle, ranked options, `automaticApplicationAllowed: false`);
- goal-contract revision (prior version retained);
- `temporary_leaning` phase (user review at the end; no automatic completion or resumption);
- structured guardrail (bound meanings, effective period: phase, date, permanent or condition);
- Your Journey event.

Nothing is persisted.

### Phase A: shadow intelligence

**Schedule correction**
- Days left now shrink with elapsed local days, fixing the frozen runway.
- The measured pace stays evidence-only; time never adds "measured" progress.
- Two views are reported: measured basis, and projected at the measured pace.
- A pace measured over fewer than 14 days is "not established", so short plateaus inside water or scale noise are not treated as findings.

**Post-projection ladder:** the schedule now reaches the decision. Rungs:
- `calibrating`, `evidence_coaching`, `adherence_coaching`, `sustainability_review`
- `resolve_constraint_conflict`, `review_timeline`, `guardrail_review`
- `below_range_watch`, `below_range_review`
- `strategy_review`, `goal_achieved`, `phase_time_limit_review`
- `pace_unverified`, `none`

**Other changes**
- **Guardrail:** direction-aware and structured, built from the typed V3 `allowed_range` and its severity bands. No prose regex.
- **Phase Review inputs:** typed inputs replace the narrative-regex derivation. They reproduce the recorded Aug 15 `begin_next_phase` decision and are independent of wording. They are not wired yet; the live Phase Review path is unchanged.
- **Coaching:** placed only in approved fields: Weekly Coach's Take ("Into Next Week") and Monthly "Month Ahead". DEXA, Photo and Midweek get none.
- **Deferral:** "keep my current plan" or "remind me" suppresses the recommendation unless there is material new evidence.
- **Choice validation:** a firm ceiling the user is already above is rejected while building; keeping an unlikely deadline is allowed with a warning and is never silently accepted.

**Dormancy:** `runConfidenceNarrativeV3` accepts an optional `goalAdaptationShadow`, and no production caller passes it.
- Without it, the output is byte-identical (tested).
- With it, the shadow is returned beside the result and never changes the recommendation, Goal Confidence, narrative or result id.
- Published artifacts and Goal Confidence semantics are untouched, and nothing re-evaluates or republishes history.

## Tests

| Run | Result |
|---|---|
| New Goal Adaptation suites (unit, golden, dormancy, typed Phase Review, 26 scenarios) | **55/55 pass** |
| Focused V3 / Phase Review / forecast / confidence / briefing-family suites | 1,335 pass, 5 fail. All 5 read the absent local `private/founder/runtime-store.json` and fail identically on the production base. |
| **Full unit suite: candidate vs production base `85a98025`** | Candidate: 10,532 tests, 294 failed. Base: 10,505 tests, 294 failed. **The failing sets are identical: 0 new, 0 fixed.** The 27 extra tests are the new suites (all pass). |
| ESLint (all new and changed files) | clean |

## Golden historical tests

From the production extraction (sanitized):

| Case | Existing V3 (stored) | Phase A shadow |
|---|---|---|
| Oct 6/7 Midweek | "49 days left", `ahead_with_reserve`, continue | 24 days left; measured-basis at risk, but at the measured pace it would finish about Oct 17. Result: `pace_unverified`, no proposal, no coaching (Midweek never originates). |
| Oct 9 DEXA | `continue_with_guardrail_monitoring` | 22 days left; needs 0.1318 lb/day vs 0.0337 measured (ratio 0.26); finishes about Jan 4. Body fat above range (pressured, unsafe side). Eligible on day 55, with coverage sufficient and adherence adequate. Result: **`resolve_constraint_conflict`**, which may originate a proposal. |
| Aug 15 Phase Review (typed inputs) | `begin_next_phase` (recorded) | Same `begin_next_phase` from typed fields: below range by 0.4 ("slight"), bounded uncertainty, 77 days left |
| Oct 9 with no DEXA at all | — | Still eligible, with precision reported as "estimated" |

## Read-only production comparison ("would have said")

**How it was run.** It used the approved Mac console runner (context `physiqueos-final-cutover-config`, app `bf57cf56…`, component `web`), authorized by the Founder in chat for this task.
- **Passes:** two (`…20261010A` extraction and `…20261010B` field discovery).
- **Identity gates:** runtime SHA `85a98025`; owner is the Founder.
- **Transaction:** `REPEATABLE READ READ ONLY`, with `transaction_read_only` = **on**; owner-scoped SELECTs only; explicit `ROLLBACK`; each success marker seen exactly once.
- **Output:** trajectory numbers and weekly aggregates only. No credentials, no raw evidence.
- **Writes: none.**

**Weekly evidence coverage**

| Evidence | Coverage | Source |
|---|---|---|
| Morning weight | 5–7 days per week | Manual |
| Training | about 3 logged days per week | Proxy: `createdAt`; Phase B should use `workoutDate` |
| Daily evidence | 7 days per week | Before HealthKit |
| Nutrition and activity | 6–7 days per week since Sep 20 | HealthKit |

**Intake adherence:** HealthKit intake was within ±10% of 2,500 kcal on 16 of 19 days since Sep 20. The Oct 9 conflict is therefore a genuine constraint conflict, not an adherence problem.

**Would have said** (shadow decision on every stored V3 artifact):

| Artifact (local date) | Days left (stored → corrected) | Measured-basis ratio | Projected-at-pace ratio | Phase A rung | Proposal? | Coaching (engine) |
|---|---|---|---|---|---|---|
| Weekly Sep 13–19 (Sep 20) | 49 → 41 | 1.02 | 1.22 | none | — | — |
| Photo Sep 19 (Sep 20) | 49 → 41 | 1.02 | 1.22 | none | — | — |
| Midweek Sep 20–22 (Sep 23) | 49 → 38 | 0.97 | 1.25 | pace_unverified | no (Midweek) | — |
| Weekly Sep 20–26 (Sep 27) | 49 → 34 | 0.90 | 1.29 | pace_unverified | no | "34 days remain…" in Into Next Week |
| Midweek Sep 27–29 (Sep 30) | 49 → 31 | 0.84 | 1.33 | pace_unverified | no | — |
| Monthly Sep (Oct 1) | 49 → 30 | 0.81 | 1.33 | pace_unverified | no | "30 days remain…" in Month Ahead |
| Weekly Sep 27–Oct 3 (Oct 4) | 49 → 27 | 0.76 | 1.38 | pace_unverified | no | "27 days remain…" in Into Next Week |
| Midweek Oct 4–6 (Oct 7) | 49 → 24 | 0.69 | 1.42 | pace_unverified | no (Midweek) | — |
| **DEXA Oct 9** | 22 → 22 | 0.26 | 0.26 | **resolve_constraint_conflict** | **yes** | — |

V3 assessments exist only from Sep 18. Earlier Weekly and Monthly briefings have no V3 trajectory to replay.

## Remaining policy decisions (Founder)

1. **Approve or adjust the draft thresholds:**
   - evidence days per week by goal type;
   - adherence tolerances (±10% intake, ±15% activity), with a minimum of 10 measured days to judge and 70% of days on plan;
   - a 14-day minimum pace span;
   - a 21-day sustained stall before a strategy review;
   - 3 weekly evaluations below range before a below-range review;
   - a safety exception at a weight change of ≥ 1.5%/week.
2. **Time-only shortfall:** today it produces `pace_unverified` coaching, not a timeline proposal (the time-is-not-evidence principle). Should a long unverified stretch, such as more than 5 weeks, open a review?
3. **`guardrail_review`:** unsafe-side guardrail pressure without schedule risk now proposes a review (scenarios L3 and MT1). Confirm this is wanted rather than coaching only.
4. **Coaching copy:** the `pace_unverified` text is generic. Its narrative wording should be refined when coaching is wired into briefings (Phase C).

## Future gates

- **Separate Founder authorization** is required before any Server deploy of this candidate, even dormant.
- **Phase B** (ranked options, energy calibration, persisted recommendations) does not start until the Founder has reviewed these thresholds and the scenario behaviour. Scenario gate report: `20261010T052202Z-goal-adaptation-founder-scenario-acceptance-gate.md`.

## Storage

Free disk was 24 GiB before and 23 GiB after; the 15 GiB floor was never approached. Only task temp files and ignored runner copies were used, and those were removed. No worktrees were created.

## Safety

| | |
|---|---|
| production_mutated | false (two read-only passes, rolled back) |
| deployed / TestFlight / Native | no / no / no |
| goal or phase edits | none |
| release pointer | unchanged |
| Codex Build 94 | untouched |

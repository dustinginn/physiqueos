# DEXA Event narrative redundancy: Server candidate (not deployed)

- Task id: `claude-dexa-event-narrative-redundancy-20261009`
- Branch: `claude/dexa-event-narrative-redundancy-20261009`, head **`b746a60cdbab283ddc4a5048036605ba3b63ce95`**, base `539f7006` (current production)
- Commits:
  - `ff397efe` feat(server): V3 event presentation roles that say each conclusion once
  - `1acc664a` fix(server): DEXA Event briefing states each conclusion once
  - `b746a60c` test(server): October 9 DEXA Event narrative redundancy regression
- Production: still Server `539f7006`, deployment `0e18ece1`. **Nothing was deployed, and the October 9 briefing was not regenerated.** Each needs separate Founder authorization.
- Generated: 2026-10-09T19:07Z

## 1. Result

| Question | Answer |
|---|---|
| Where does the repetition come from? | **Server composition**, in three places (§2). It does not come from the reasoning engine, which reaches one conclusion, and it does not come from Native, which renders what it is given and already hides empty fields. |
| Strategic assessment preserved? | **Yes.** 70% Goal Confidence, decreased direction, lean-tissue progress recognized, body-fat guardrail breach, and "address fat gain before pushing harder on lean mass" are all still stated, each once. Confidence values, assessment and canonical evidence are byte-identical with and without the change (tested). |
| Truncation? | **None.** No sentence is shortened. Repeated sentences are dropped only where the same claim is already stated, and optional fields contract to empty. |
| Scope | DEXA Event only in effect. One generic V3 addition (event presentation roles) is computed for every event, but only the DEXA mapping reads it. Weekly, Midweek, Monthly and Photo text is unchanged. |
| Native change needed? | **No.** Build 93 already omits empty Coach rows, empty interpretation paragraphs and an empty lead. |

## 2. Audit: where the repetition originated

| Layer | Finding |
|---|---|
| Reasoning engine (Confidence V3, guardrail and strategic interpretation) | One assessment and one strategic conclusion. **Not a source.** |
| V3 narrative composer (`NarrativeV3CompositionService`) | For events, the headline is the first sentence of `sections.result`, so the hero body began with the title again. `coachTake` restated the objective movement. The section-distinctness check is skipped for events. **Source.** |
| DEXA presentation mapping (`BriefingGoalConfidencePresentationService`) | One V3 section was poured into several slots: hero body = `sections.result`, Biggest Win = the same text, Protect = `sections.action`, Next = `coachTake`, which repeats the movement again. **Main source.** |
| Legacy DEXA interpretation (`DEXAEventNarrativeService`) | `goalProgress` was a verbatim alias of the opening and `guardrailStatus` of `fatLoss`, kept for older readers. Opening and Lean tissue both restated the lean change and the measurement caveat. **Source.** |
| Native (Build 93 `ProductionBriefingMapper.dexa`, `DEXABriefingSections`) | Renders each field once and filters out empty ones. **Not a source.** |

The existing V3 duplicate check (`isSemanticallyEquivalent`) is lexical, with a 0.9 token overlap threshold. It catches verbatim repeats but not paraphrases such as "Measured lean tissue increased…" versus "You added … of lean mass…". The correction therefore tracks the **claim each sentence makes**, not just its wording.

## 3. The correction (smallest Server-owned change)

1. **Event presentation roles (V3, generic).** `composeEventPresentation` gives each slot one job and records the claims it makes (schema `event_presentation_roles_v1`):
   - **Hero body:** what moved. This is the result sentences minus the headline (claims `objective_movement`, `guardrail_status`).
   - **Biggest Win:** goal progress, and only when the objective moved forward (`goal_progress`, `measured_progress`).
   - **Protect:** what to keep steady. While correcting a guardrail: keep the rest of the routine steady and prepare for the next check the same way. Otherwise: comparability only (`preserve_routine_and_comparability` / `comparable_next_check`).
   - **Next:** the action. When the guardrail needs attention: "Address ⟨guardrail⟩ before pushing harder on ⟨objective⟩." Otherwise the recommended action. The next-evidence purpose is appended only when the composer has one (`address_guardrail_first` / `recommended_action`, `next_evidence_purpose`).
   - Any role sentence that is equivalent to the headline or an earlier role is skipped.
   - Every role still passes `assertNarrativeV3Voice`.
   - The file stays generic: no DEXA, Founder or goal-specific terms, so the generic-core guard tests stay green.
2. **DEXA mapping reads the roles.**
   - Hero body = `heroBody`; Coach's Insight = Biggest Win, Protect and Next from the roles, with Watch empty. `presentationRolesV3` is stored on the event for audit.
   - An artifact whose plan has no roles, such as anything stored before this change, keeps the previous mapping exactly.
3. **Interpretation contraction (`DEXAEventPresentationContraction`, new).**
   - `DEXAEventNarrativeService` now tags each interpretation sentence with its claim (`interpretationClaims`). The prose itself is unchanged.
   - Contraction keeps a sentence only if its claim is not already carried by the hero or Coach's Insight and was not already said earlier in render order. The measurement caveat lives only in **Uncertainty**.
   - Aliases are dropped when their source field is present.
   - Optional fields become `null` when empty, and required fields become `""`.
   - A field whose stored text no longer matches its tags exactly is left untouched, so edited prose is never altered. The input is never mutated.
4. **Web reader (`DEXAEventBriefingScreen.jsx`):** empty Coach rows, empty interpretation rows and an empty lead are not rendered, matching Native.

Not changed: Confidence calculation, goal logic, guardrail evaluation, DEXA ingestion, HealthKit writeback, canonical evidence, stored or historical briefings, Native, infrastructure.

## 4. Before and after: October 9 DEXA Event

The "before" is the published October 9 briefing; the "after" is this candidate on the same inputs. Personal scan values are shown as ⟨placeholders⟩. Wording is otherwise verbatim, in Native render order.

### Before (published)

- **Hero title:** This is a strong result, with one important caveat.
- **Hero body:** This is a strong result, with one important caveat. You added ⟨lean Δ⟩ of lean mass since September 12. Body fat is pressing the limit at ⟨BF%⟩.
- **Confidence:** 70% ↓
- **Interpretation**
  - *(lead)* Measured lean tissue increased ⟨lean Δ⟩. Lean tissue moved up, but body fat also moved beyond the range you chose. That is encouraging, but one scan cannot prove how much of the change is new muscle.
  - *Body-fat guardrail:* Body fat is above your chosen ⟨range⟩. Review the calorie plan before treating the lean-tissue increase as an uncomplicated win.
  - *Lean tissue:* Measured lean tissue increased ⟨lean Δ⟩. Prepare for the next scan the same way so we can see whether the direction holds.
  - *Where change occurred:* ⟨regional fat and lean changes⟩. Regional DEXA changes remain measurements, not isolated tissue diagnoses.
  - *Phase:* This result helps us judge the current phase, but one scan is not enough to move into the next one.
  - *Goal progress:* (verbatim repeat of the lead)
  - *Guardrail status:* (verbatim repeat of Body-fat guardrail)
- **Evidence note:** Supporting evidence (scale, training, nutrition, photos agree), and Uncertainty ("One scan cannot prove that every change in lean tissue is new muscle…").
- **Coach's Insight**
  - *Biggest Win:* This is a strong result, with one important caveat. You added ⟨lean Δ⟩ of lean mass since September 12. Body fat is pressing the limit at ⟨BF%⟩.
  - *Protect:* Keep what is going well, but tighten attention around body fat. Reconsider only if something meaningful changes.
  - *Next:* You added ⟨lean Δ⟩ of lean mass since September 12. Keep the progress, but address body fat before pushing harder.

The before version states the title twice, the lean-tissue change **6 times** (hero, lead, Lean tissue, Goal progress, Biggest Win, Next), the body-fat status **6 times** (hero, lead, Body-fat guardrail, Goal progress, Guardrail status, Biggest Win), and the one-scan caveat **3 times** (lead, Goal progress, Uncertainty).

### After (this candidate)

- **Hero title:** This is a strong result, with one important caveat.
- **Hero body:** You added ⟨lean Δ⟩ of lean mass since September 12. Body fat is pressing the limit at ⟨BF%⟩.
- **Confidence:** 70% ↓ (unchanged)
- **Interpretation**
  - *Body-fat guardrail:* Body fat is above your chosen ⟨range⟩. Review the calorie plan before treating the lean-tissue increase as an uncomplicated win.
  - *Where change occurred:* (unchanged)
  - *Phase:* (unchanged)
- **Evidence note:** Supporting evidence and Uncertainty are unchanged. The caveat now lives only here.
- **Coach's Insight**
  - *Biggest Win:* You are more than halfway to the ⟨goal⟩ lean-mass goal. The measured progress in lean mass is real.
  - *Protect:* Keep the rest of the current routine steady, and prepare for the next DEXA the same way so the comparison stays fair.
  - *Next:* Address body fat before pushing harder on lean mass. The next DEXA is about whether this kind of progress continues.

After the change, each conclusion is stated once:
- the movement in the hero;
- the guardrail reasoning in Interpretation;
- the caveat in Uncertainty;
- progress in Biggest Win;
- steadiness and comparability in Protect;
- the priority in Next.

Lead, Lean tissue, Goal progress and Guardrail status contract away because everything in them is said elsewhere.

**Caveats on the example:**
- In production, the stored October 9 plan had no composer watch sentence. If regenerated, Next would be its first sentence only.
- The regression harness reproduces the stored summary, sections, coachTake and interpretation verbatim. Its own Confidence run gives 65% instead of the stored 70% because its predecessor and evidence set are reduced. The test asserts the stored 70% and the fact that the change does not touch Confidence.

## 5. Tests and gates (on `b746a60c`)

| Gate | Result |
|---|---|
| New: `DEXAEventNarrativeRedundancy.test.js` (16) | Pass. Covers: faithful reproduction of the published Oct 9 text; the documented defect; no repeated sentence across hero, interpretation and Coach; each fact stated once; distinct role claims; one job per role; optional contraction; no truncation (every kept sentence is a verbatim original); lean-decrease caution preserved; assessment, Confidence and canonical inputs unchanged; strategic conclusion present; stored 70% untouched; Photo mapping unchanged; plans without roles keep the old mapping; a no-correction case (Sep 12: Protect is comparability-only, Next starts "Stay the course.") |
| New: `DEXAEventPresentationContraction.test.js` (7) | Pass. Contraction rules, edited-prose no-op, no mutation, and claim tags reassembling exactly for increased, decreased and flat lean tissue |
| New and affected suites | **368/368** (26 files) |
| Briefing and intelligence set (all V3 families, goldens, generic-core guards) | 1,716 tests, **0 new failures** compared with base. 32 failures exist on base and are identical before and after. |
| Full unit suite | 0 new failures. The one intentional contract change, `StrategicInterpretationPublicationServiceV3` asserting `next === coachTake`, was updated to assert the roles. The remaining `collectProviderWorkerArtifact` failure is environmental and also fails on base. |
| Per-commit | Each commit passes standalone (345/345) |
| ESLint (changed files) | Clean |
| Next.js production build + middleware artifact verification | Compiled; middleware **PASS**; `event_presentation_roles_v1` present in the server bundle |

Fixture: `src/fixtures/briefingFamilyV3/dexaEventOct9Narrative.json` is a reduced fixture holding scan values, stored narrative and Confidence summary. It follows the existing `briefingFamilyV3` Founder-fixture precedent and has no identifiers, references or file names.

## 6. Effect on other V3 briefing types

| Type | Effect |
|---|---|
| Weekly, Midweek, Monthly | None. Not events; no roles computed; goldens unchanged. |
| Photo Event | Text unchanged; tested. The plan carries an unused `eventPresentation` block. Photo could adopt the same roles later, but that needs its own review and was deliberately not done. |
| Stored briefings (all types) | Unchanged. The mapping runs only at publication, and a plan without roles keeps the previous mapping. |

## 7. Deployment and regeneration (not done; Founder authorization required)

- **Deploy:** a Server-only fast-forward from `539f7006` to `b746a60c`, using the same guarded path as today: spec stamps plus force-rebuild, rollback anchor `539f7006`. There is no migration and no Native change. Only DEXA Events published **after** deploy use the new composition.
- **October 9 regeneration:** a separate decision. Regeneration would also re-run that briefing's publication. A read-only preview of the regenerated text should come first, and the Confidence snapshot must stay unchanged.

## 8. Separate project (recorded, not started): Goal Feasibility and Goal Adaptation discovery

This was kept entirely outside this implementation. The proposal is a **read-only architecture discovery** that inventories what already exists before any new development is proposed. Existing capabilities found while scoping (not evaluated):
- `src/domain/confidenceV3/FeasibilityAssessmentService.js` (`feasibility_assessment_v1`: feasibility state, evidence strength, calibration status)
- `src/domain/confidenceV3/GuardrailTransitionService.js` (`guardrail_transition_v1`)
- `src/domain/forecast/GoalAttainabilityService.js` (`evaluateGoalAttainability`, `goal_attainability_v1`)
- `src/domain/confidence/StartingForecastService.js`, `BriefingForecastFinalizer.js`, `AuthorizedBriefingForecastAdapters.js`
- `src/domain/services/PhaseTransitionDatePolicy.js`
- The goal transition flow: `src/app/goals/transition/**`, `GoalTransitionRepository`, `GoalProtocolTransitionRepository`
- `AdaptiveTrustRepository`, `components/goals/PhaseReviewCard.jsx`, `components/cards/TrajectoryCard.jsx`

Suggested questions for the discovery:
- Which of these are live in production publication?
- How do feasibility and attainability relate to Goal Confidence?
- Is there an existing path from a guardrail breach to a proposed goal or phase adaptation?
- What is missing?

## 9. Decisions for the Founder

1. Approve the candidate for review or deploy, or request wording changes. The before/after in §4 is the review surface.
2. Separately, decide whether to regenerate the October 9 briefing; preview first.
3. Decide whether to schedule the Goal Feasibility / Adaptation read-only discovery (§8).

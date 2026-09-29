# Shared Briefing Intelligence layer: Weekly Sep 20–26 diagnosis and design proposal

Task: `weekly-v3-sep20-26-founder-feedback-diagnosis-20260927`, extended by the Founder's instructions to build (1) a general period-understanding layer and (2) a layer shared by all briefing types.
Status: **diagnosis complete, design proposed, implementation not started.** This is a checkpoint so the design can be approved before code is written.

Everything below was done read-only:
- production code at `49211870`, the Native Build 68 source `537f538b`, and nine zero-write production reads (`REPEATABLE READ READ ONLY`, rolled back);
- nothing was mutated, regenerated, deployed or built.

Isolated fix worktree: `/private/tmp/physiqueos-weekly-v3-narrative`, branch `codex/weekly-v3-weekly-pattern-narrative`, based on `49211870` (= `combined-app-platform-cutover` tip).

## 1. What canonical data actually shows for Sep 20–26

The baseline is the prior four weeks: 24 complete nutrition days, with intake mean 2,585 kcal, median 2,455 and SD 427.

| | Sun 20 | Mon 21 | Tue 22 | Wed 23 | Thu 24 | Fri 25 | Sat 26 |
|---|---|---|---|---|---|---|---|
| Intake kcal | 3,730* | 2,406 | 2,406† | 2,677 | 2,415 | 1,922 | 2,915 |
| Protein g | 194 | 178 | 178† | 168 | 129 | **72** | 129 |
| Move kcal (wearable) | – | 935 | 847 | 783 | 915 | **460** | **522** |
| Exercise min | – | 101 | 107 | 107 | 65 | **9** | **29** |
| Strength session | ✓ | ✓ | ✓ | ✓ | ✓ | **–** | **–** |
| Weigh-in | ✓ | ✓ | ✓ | ✓ | ✓ | **–** | **–** |

\* Sun 20 comes from an MFP screenshot (`partial_meal_subtotal`); every other day is a HealthKit canonical `full_day_asserted` day.
† Tue 22 is a byte-exact copy of Mon 21, a probable HealthKit day-attribution defect.

**The premise "Thu–Sat intake materially higher" is not supported by canonical data.** Thu–Sat averaged 2,417 kcal, below both baseline and Sun–Wed (2,805).

What **is** supported is a late-week routine break that shows up across several domains at once:
- no strength training on Fri/Sat, where the prior two weeks usually included those days;
- movement and exercise minutes roughly halved;
- weigh-ins stopped;
- device time-zone metadata of Phoenix/Chicago from Sep 22 onward, a possible travel marker (field semantics not verified);
- Fri protein at 72 g against a usual 170–190 g, which reads as incomplete logging while away rather than lower eating, yet it is tiered `full_day_asserted` / high reliability.

**The engine consequence is causal and evidential restraint.** A correct engine surfaces the disruption that is evidenced and treats implausible nutrition days as a *logging-reliability* signal. It must not assert higher intake that canonical data does not show, even though the Founder remembers it. Acceptance case 2 is re-scoped accordingly (§5).

Other data points from the audit:
- A similar, *larger* episode (Sep 3–6: ~3,900 kcal/day with training gaps) sat in the baseline and was never surfaced by any briefing.
- HealthKit canonical days are `evidenceEligibility: quarantined` yet still feed the Energy card. This is an eligibility inconsistency to resolve inside the shared layer.

## 2. Root causes (the eight questions)

1. **The Thu–Sat intake increase is not present canonically.** Nutrition days are canonical but quarantined. Fri 25 is a probable under-log misclassified as a complete day.
2. **Fri/Sat no-training is inferable** (strength sessions every other day, none Fri/Sat), but **no absence/non-event semantics exist in Weekly**. Rest days and training frequency against routine exist only in Monthly (`MonthlyEvidenceIntelligenceV3.evaluateTrainingPattern`/`inferPersonalWeeklyFrequency`/`detectShortBreaks`).
3. **Comparative features barely exist.**
   - Weekly/Midweek observations are built from the V2 PI envelope.
   - `selectRepresentativeCadenceObservationsV3` (`ProductionConfidenceNarrativeV3Adapter.js:615`) keeps **one aggregate observation per domain**, so daily distribution, runs and routine are discarded there.
   - The only per-day baseline, the 42-day intake variability in `EnergyVariabilityV3`, requires ≥3 same-direction days **and** ≥ half the paired days, so it cannot see a 3-of-7 run. It only tempers the recommendation and the Energy sentence.
   - For Sep 20–26 it computed `isUnusualRelativeToHistory: true` and was then suppressed (`isolated_or_mixed_deviation_not_a_pattern`).
4. **Bicep Curl Machine in the Goal Confidence copy.**
   - `composeConfidenceBriefing` (`NarrativeV3CompositionService.js:1053-1065`) names `specificCoachingObservations[0].subjectLabel` whenever confidence delta is 0.
   - That pool is 100% exercise-level. Sep 20–26 had 94 candidates, all training, and the top four tied at 133.7, two of them observed *before* the window, one as far back as Aug 10.
   - No goal-level abstraction gate and no in-window recency gate exist.
5. **Generic hero and Coach's Take.**
   - `allocateNarrativeSections` (`:351-450`) removes the entire nutrition/activity/energy family from the hero and Coach's Take (`isEnergyFamilySignal`, `:622`).
   - Once `continue_current_strategy` holds, every slot falls through to fixed templates: "Nothing here calls for a change." (`:374`), "The goal remains on course…" (`:540`), "Keep executing consistently" (`:545`), "Nothing needs fixing right now…" (`:574`).
   - The narrative stage has **no input describing what the period was like**, so no-change prose is structurally forced.
6. **"Still Unresolved".**
   - The Server correctly marks both items `surfaced:false`, with reasons `strategy_feasibility_demonstrated_measurement_gap_not_decision_relevant` and `covered_by_next_evidence_purpose`.
   - Native renders them anyway: `BriefingReadModel.swift:276-281` shows any item with `surfaced || materiality == "high"`, and `WeeklyBriefingSections.swift:24` always mounts `BriefingUncertaintyCard`.
   - Weekly lacks the bounded uncertainty contract Midweek has (`MidweekBriefingPresentationService.boundedUncertainty`).
   - This is a Native path discrepancy that arrived with Build 47 (`586c6085`, Sep 20). No earlier Weekly removal commit exists in either tree; the removal the Founder remembers was likely V2 or Midweek.
7. **Energy Balance "On Plan"** compares weekly averages at ±10% (`CadenceEnergyObservationsV3.compareToPlan`, `PLAN_TOLERANCE_RATIO 0.1`). Movement averaged 789 against 800 "on plan" while Fri/Sat ran at 460/522. The daily series exists but the narrative never reads it. The card can stay factual; the gap is that the narrative can't use the distribution.
8. **Split.**
   - **Server:** the new shared layer, the confidence abstraction, narrative allocation, and the Weekly bounded uncertainty contract.
   - **Native:** a small presentation fix, dropping the `materiality == "high"` override and honoring the Server's bounded Weekly uncertainty. This can be batched with the queued "Log tab returns to active Workout Logger session" item.

## 3. Cross-briefing architecture audit: the reasoning is siloed three ways

All five types share one V3 core: `StrategicInterpretationPublicationServiceV3.prepare` → `ConfidenceNarrativeV3Pipeline` (eligibility → interpretation → confidence → narrative). They differ only in which extra observations they feed in:

| Type | Comparative basis today |
|---|---|
| Weekly / Midweek | One same-length prior window, plus 42-day energy variability, one aggregate per domain |
| Monthly | `MonthlyEvidenceIntelligenceV3`: personal calibration, weekly frequency, `REPEATED`/`PERSISTENT` deviation states, `WEARABLE_ESTIMATE` measurement type, short-break detection with `inferredReason: null` |
| DEXA / Photo | Prior instance only, with no preceding-execution context |

The "repeated deviation" concept is implemented three different ways:
- Energy: ≥3 days and ≥½ of the period.
- Monthly records: ≥4 consecutive = persistent, ≥2 = repeated.
- Monthly frequency: ≥2 weeks missed.

Baselines are defined four ways, and salience/ranking is scored at least five ways. None of that ranking knows about period patterns. The single-exercise `TYPE_SCORE` competes in the same selection that feeds coaching and explanation text.

## 4. Proposed architecture

### 4.1 The shared layer

- Module `src/domain/intelligence/shared/BriefingIntelligence.js`, schema `briefing_intelligence_v1`.
- A pure, deterministic function called **once** in `StrategicInterpretationPublicationServiceV3.prepare`, which puts it on the single path all five publishers use.
- It reads **canonical daily authorities directly**, not the lossy V2 PI envelope:

| Input | Source |
|---|---|
| Nutrition daily totals | `NutritionDayAuthority` |
| Activity days | Measurement type `WEARABLE_ESTIMATE` |
| Training | Logger sessions + HealthKit workouts |
| Body composition | Weigh-ins, DEXA scans, photo sessions |
| Targets and regime boundary | `CurrentStrategyAuthority` (`effectiveAt`) |
| Capability relevance | `GoalContractV3` |
| Eligibility | V3 evidence universe, cut off at the settlement watermark |

The layer runs five stages.

1. **Series and coverage.** Build a per-signal day or instance series with explicit coverage. Protein is part of the nutrition series.
2. **Baselines.** Personal and regime-bounded, using robust statistics (median/MAD), with a minimum-support gate. The lookback unit (day, week or instance) comes from the briefing type's policy.
3. **Detectors.** One implementation each, parameterized, absorbing the three existing silos:
   - `level_shift`: the whole window against baseline.
   - `consecutive_run`: at least k consecutive days beyond a robust threshold, which catches runs a weekly average hides.
   - `distribution_change`: variance or dispersion against baseline.
   - `frequency_change` and `routine_break`: training days per week and day-of-week habit against personal routine.
   - `supported_absence`: "no training" counts as behavior **only** when coverage says the day was observable (other data synced that day, Logger usage pattern). Otherwise it becomes a limitation.
   - `reliability_anomaly`: a day implausible against the personal pattern (e.g. protein below the personal baseline by more than N MAD while kcal looks normal), an exact duplicate day, or a partial-scope marker. It downgrades that day's evidential weight and never counts as behavior.
   - `co_occurrence_span`: a contiguous date span where several domains deviate together (training, activity, logging, weigh-ins), producing a routine-disruption *characterization* with `causalClaim: none`.
   - `persistence`: across units (weeks, prior windows), distinguishing isolated from repeated from persistent.
4. **Materiality ranking** combines magnitude against baseline, duration, cross-domain co-occurrence, goal relevance (GoalContractV3 capability weights), a measurement-confidence discount (wearables are directional) and in-window recency. The output is capped to a few items.
5. **Restraint gates.**
   - A single day is never a pattern; it can only be isolated.
   - Missing data is never behavior.
   - No cause is inferred beyond co-occurrence.
   - Wearable magnitudes are never stated with false precision.
   - Exercise-level results are never promoted to goal level.

**Output:** `{ schemaVersion, horizon, baselines[], patterns[{kind, signal, span, direction, magnitudeVsBaseline, support, measurementType, causalClaim, materiality}], characterization[] (ranked), reliability[], limitations[] }`.

### 4.2 Briefing-specific policies (on top of the shared layer)

Each type supplies horizon, baseline unit, admissible pattern kinds, weighting and how patterns map into Confidence, Strategy and Narrative.

| Type | Understands | Admissible | Maps to |
|---|---|---|---|
| **Weekly** | The completed week against recent routine (≈4–6 weeks) | All kinds except cross-week persistence claims beyond what the baseline weeks support | Narrative: hero and Coach's Take characterize the week even when strategy holds. Strategy: "temporary deviation, watch whether it persists", not a change |
| **Midweek** | Emerging signals in a partial window | Runs and early shifts only, labelled *emerging*, never persistent or concluded | Narrative only, with a light watch-item; never Confidence movement |
| **Monthly** | Persistence and change across weeks, not a concatenation of weeks | Persistence, frequency_change, level_shift at week granularity | Strategy (persistent change can justify an adjustment) and Narrative |
| **DEXA** | An authoritative outcome read against preceding execution since the prior scan | Context patterns over the inter-scan span | Confidence is driven by the scan. The layer provides "what execution looked like" context, with no causal attribution beyond co-occurrence |
| **Photo** | Visual change alongside other eligible evidence | As DEXA, with lower outcome authority | Narrative context; bounded Confidence impact per existing precedence |

### 4.3 Consumption by the shared V3 core

The layer's output is passed in as `evaluationContext.briefingIntelligence`, then exposed as `interpretation.periodCharacterization`.

**Narrative.** `allocateNarrativeSections` uses the ranked characterization for result, meaning, Coach's Take and watch before any fallback. The fixed no-change templates remain valid **only** when the characterization is legitimately empty, i.e. a stable week. Nutrition and activity enter as characterization of the period, not as energy-balance claims, so the energy-family exclusion stays correct for its original purpose.

**Confidence explanation.** A goal-level abstraction rule: explanations may cite only goal-level drivers, namely:
- body-composition trajectory;
- execution consistency patterns;
- guardrails;
- evidence completeness;
- time remaining.

Exercise-level `coachingDetails` are structurally ineligible for the confidence explanation. They stay available to the detail and evidence surfaces, and are gated to in-window observations.

**Strategy.** A characterized *temporary* deviation tempers nothing and forces nothing. Only policy-admissible persistence (Monthly, or repeated across Weeklies) can feed recommendation logic.

**Presentation.** A Weekly bounded uncertainty contract (Server) emits only `surfaced` items, mirroring Midweek. The small Native fix honors it.

**Immutability.** `sourceLineage.briefingIntelligenceVersion` is stamped on every artifact. When the input is absent, output is **byte-identical**, so every stored artifact and the Sep 13–19 / Midweek / DEXA / Photo golden replays remain unchanged. Published artifacts are served as stored and nothing re-runs `prepare` on them.

## 5. Validation plan (behavioral, not copy)

**A seeded synthetic-period generator** produces a varied set of periods across briefing types, none of them individually copy-authored:
- stable weeks;
- late-, mid- and early-week disruptions;
- consecutive high or low intake hidden by an on-plan average;
- training gaps with full coverage versus with a data outage;
- noisy wearables;
- sparse or partial logging;
- duplicate or implausible days;
- regime changes;
- persistence across weeks;
- DEXA and Photo with varied preceding execution.

**Property invariants** asserted across every generated period:
- A pattern is detected only when support thresholds are met.
- A single day never becomes a pattern.
- An absence is surfaced only when coverage supports it.
- A reliability anomaly never becomes a behavior claim.
- `causalClaim` is always `none` or `co_occurrence`.
- Wearable magnitudes are never presented as precise.
- The confidence explanation never names an exercise.
- Confidence and strategy aren't forced to move by characterization alone.
- A stable period yields an empty characterization and a concise no-change narrative.
- Midweek never labels a pattern persistent.
- Ranking is monotonic in materiality inputs.
- The layer is deterministic: same input gives same output.

**Founder acceptance cases** run as scenarios alongside the generated set:
1. Confidence holds while the routine clearly differs → a rich characterization with no forced change.
2. **(Re-scoped)** A late-week multi-domain disruption with an implausible logging day → the disruption is surfaced and nutrition reliability is flagged, not "intake rose".
3. Two missing training days against established frequency → surfaced only with coverage.
4. One exercise PR → absent from the confidence explanation.
5. Wearable near target → contextual framing.
6. Stable week → concise.
7. No generic "Still Unresolved" in Weekly.
8. Historical V2 and published V3 artifacts are byte-identical (golden replays).

## 6. Proposed phasing

- **Phase 1** (next, targets the Sun Oct 4 Weekly): the shared layer (series, baselines, detectors, ranking, restraint), the Weekly policy, narrative consumption, the goal-level confidence rule, the Server Weekly bounded uncertainty, the generator, invariants and the golden no-drift checks. Fresh-context review follows.
- **Phase 2:** the Midweek and Monthly policies. Fold `EnergyVariabilityV3` and the Monthly deviation/training-pattern logic into the shared detectors so each concept exists once.
- **Phase 3:** the DEXA and Photo preceding-execution context policies.
- **Native:** the uncertainty-card fix, batched with the queued Log-tab item for the next consolidated build.
- **Separate ingestion defects**, not part of this layer: HealthKit duplicate day totals (Tue 22 = Mon 21); a device aggregate without a partial marker being tiered as a complete day; quarantined HealthKit nutrition feeding the Energy card; a possible duplicate Mon 21 strength session. The shared layer will *detect* the first two as reliability anomalies regardless.

## 7. Decisions for the Founder

1. **Approve the shared-layer abstraction and phasing** (Weekly policy first, then Midweek/Monthly consolidation, then DEXA/Photo).
2. **Accept the re-scoped acceptance case 2.** The engine must not claim higher Thu–Sat intake, because canonical data does not show it. It should surface the evidenced late-week disruption and flag nutrition logging reliability.
3. **Approve handling the ingestion defects in a separate lane** (HealthKit duplicate day, partial-day tiering, quarantined HealthKit nutrition in Energy).

Confirmations: no production mutation, no regeneration of the Sep 20–26 Weekly, no deploy, no Native build, no HealthKit Sleep work.

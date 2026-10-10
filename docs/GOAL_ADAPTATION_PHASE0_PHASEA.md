# Goal Adaptation Phase 0 + Phase A (dormant candidate)

**Status:** implementation candidate. It is dormant: no production caller wires it, nothing is persisted, and no activation, deployment or schema change exists.

**Authority:** Founder authorization in inbox prompt `20261009-claude-goal-adaptation-phase0-phaseA-authorized.md` (`090d2e19`). It builds on the accepted V2 design and on the roadmap `20261010T045000Z-goal-adaptation-implementation-roadmap.md`.

## Phase 0: policy and contracts (`src/domain/goalAdaptation/`)

| File | Purpose |
|---|---|
| `GoalAdaptationPolicyV1.js` | `goal_adaptation_policy_v1`. Status `draft_requires_founder_review`, activation `off`. |
| `GoalAdaptationContracts.js` | Additive pure builders for the adaptation recommendation (lifecycle, ranked options, `automaticApplicationAllowed: false`), goal-contract revision (prior version retained), `temporary_leaning` phase (user review on end; no automatic completion or resumption), structured guardrail (bound meanings and effective period) and Your Journey event. |

### Draft thresholds (Founder review required)

**Calibration**
- The first review checkpoint is 28 days after the phase starts.
- It is not a guarantee of an adaptation.
- Safety exceptions bypass it: an unsafe-side guardrail breach, weight changing ≥ 1.5%/week, or a reported health concern.

**Evidence window:** a rolling 28 days of complete Sunday–Saturday weeks.

**Evidence per goal type.** DEXA is never required for any goal type; it only adds precision.

| Goal type | Weight | Training | Nutrition / other | Precision and photos |
|---|---|---|---|---|
| Lean-mass gain | ≥ 4 days/week | ≥ 2 days/week | intake or daily evidence ≥ 5 days/week | A body-composition scan adds precision. Without one, lean tissue is reported as estimated. |
| Fat loss | ≥ 4 days/week | — | intake, activity or daily evidence ≥ 5 days/week | Photos count only once validated. Photos never yield an exact body-fat value. |
| Maintenance | ≥ 3 days/week | — | intake or daily evidence ≥ 4 days/week | — |
| Strength | — | comparable sessions ≥ 2 days/week | — | — |

**HealthKit:** nutrition, activity, steps, workouts and sleep are canonical. A missing day there means "no data synced" and is never prompted for manually.

**Adherence**
- Judged only on days that have data, with at least 10 measured days.
- Intake counts as on plan within ±10% (minimum 150 kcal); activity within ±15% (minimum 100 kcal).
- Adequate means ≥ 70% of measured days on plan.
- Consistent nonadherence means 2 trailing off-plan weeks.

**Sustainability:** consistent nonadherence leads to a sustainability **review** (eligible), not ineligibility, when either:
- it drives an unsafe guardrail (over-eating above the upper bound while gaining, or under-eating below the lower bound), or
- it comes with a stalled or regressing outcome.

Otherwise, adherence is coached first.

**Below range while gaining:** watch with coaching first. It becomes a review after 3 consecutive weekly evaluations below the range, or when the next body-composition evidence confirms it.

**Triggers**

| Briefing | Can it start a proposal? |
|---|---|
| Weekly / Monthly | Yes |
| DEXA Event | Yes (optional) |
| Photo Event | Only when photo evidence is reliable and corroborated |
| Midweek | Never; link only |

## Phase A: shadow intelligence

**Schedule correction** (`ScheduleCorrectionV1.js`)
- The runway shrinks with elapsed local days.
- The measured pace stays evidence-only.
- It reports both a measured basis and a projected-at-pace view.
- Only a projected-pace shortfall counts as a trajectory finding. A measured-basis shortfall alone is reported as `pace_unverified`.

**Ladder after the projection** (`AdaptationDecisionV1.js`). Rungs:
- `calibrating`
- `evidence_coaching`
- `adherence_coaching`
- `sustainability_review`
- `resolve_constraint_conflict` (at risk and unsafe guardrail pressure)
- `review_timeline`
- `below_range_watch` / `below_range_review`
- `pace_unverified`
- `none`

Proposal rungs originate a proposal only from permitted triggers.

**Guardrail** (`StructuredGuardrailV1.js`): built from the typed V3 `allowed_range` and its severity bands. Direction comes from the goal archetype; for a lean-mass build, above the range is unsafe and below it is coaching.

**Coaching:** placed only in approved fields: Weekly `coachTake.intoNextWeek` and Monthly `monthAhead`. DEXA, Photo and Midweek get no coaching items.

**Typed Phase Review inputs** (`PhaseReviewTypedInputsV3.js`): the same input contract as the legacy regex derivation, built from typed V3 fields. It is not wired in yet.

**Pipeline hook:** `runConfidenceNarrativeV3({ goalAdaptationShadow })`.
- Without the parameter, the output is byte-identical (tested).
- With it, a separate `goalAdaptationShadow` is returned beside the result.
- The recommendation, Goal Confidence, narrative and result id are unchanged.

## Read-only production extraction

`scripts/operations/goalAdaptationPhaseAReadonlyExtract.mjs` and `goalAdaptationPhaseADiscover.mjs` are task payloads for the approved console runner. They:
- check that the runtime SHA matches and the owner is the Founder;
- run in `REPEATABLE READ READ ONLY`;
- require `transaction_read_only` to be `on`;
- issue owner-scoped SELECTs only and finish with an explicit `ROLLBACK`;
- output trajectory numbers and weekly aggregates only.

The golden fixtures in `fixtures/founderLeanMassGolden.js` are sanitized from that output.

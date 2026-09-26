# Active Goal current state — `active_goal_current_state_v1`

Served additively as `currentState` on `GET /api/v1/native/read/active-goal`
(`composePhaseAwareActiveGoalPreview`, built by `ActiveGoalCurrentStateService`).
Legacy keys stay for Build 60 decode; Build 61+ renders `currentState` only.

Principle: canonical facts establish where the Goal stands; Confidence V3 /
Narrative V3 and the latest published briefing supply interpretation; Native
presents both and never authors coaching.

Screen order (Build 61): hero (goal, target, Confidence V3 thesis) → journey /
current phase → current progress (baseline vs latest DEXA + progress) →
guardrail → training progress → turning points → latest briefing Coach's Take
(last: the conclusion after the facts).

Primary-page dedupe rule: a quantitative fact appears numerically once on the
primary page (composition/progress own +lean, %, remaining; the guardrail pill
owns the body-fat reading). Server-authored guardrail, training and
turning-point prose interprets without restating those numbers. Canonical
Confidence V3 and briefing Coach's Take text is shown verbatim, never
rewritten for dedupe.

| Field | Source / rule |
|---|---|
| `composition.baseline` | Last authoritative DEXA on or before the goal journey start. Role `goal_baseline`. Never replaced by a later scan. |
| `composition.current` | Latest authoritative DEXA. `sameAsBaseline: true` (and `change: null`) when no scan follows the baseline. |
| `composition.change` | `current − baseline` for lean mass, fat mass, body-fat points and weight. |
| DEXA authority | Excludes lifecycle `failed/superseded/retracted/deleted/inactive/rejected/removed`, `superseded/retracted/removed === true`, any `supersededBy`, and records without a lean-mass measurement in lb. One scan per date: highest `dexaRevision.revision`, then latest update. The same selection feeds the legacy trajectory/progress. |
| `progress` | `achievedAmount = round1(current.lean − baseline.lean)` (sign follows target direction), `remainingAmount = max(target − achieved, 0)`, `percentComplete = round(clamp(achieved / target × 100))`. `awaiting_follow_up` when no scan follows the baseline; `reached` at or beyond target. |
| `guardrail` | Body-fat guardrail adapted to V3 (`allowed_range`, engine severity bands). Measurement = `composition.current` body fat. `status` from `evaluateGuardrailMeasurementV3` (clear/watch/pressured/breached/not_assessed); `interpretation` is a short coaching line from the V3 status + consequence policy, with no restated numbers (no Founder-specific conclusion). |
| `phase` | Active phase identity/purpose/start; `measurementCadence` only for a monthly DEXA-anchored phase. No review language. |
| `confidence` | Current user-facing canonical assessment. V3: `summary` = `narrativePresentationV3.whyConfidence` (goal context), never the publishing briefing's movement sentence; no legacy fallback when V3 is valid; text breaking the goal coaching-language rules is withheld (null), not rewritten. `publishedBy` = publisher type/label/artifact/date and `asOfLabel` ("As of the Sep 23 Midweek Briefing"), shown in the Confidence sheet because stored V3 text can be time-relative; Build 60 receives it as the sheet's `uncertaintyStatement`. `detail` = V3 what-supports / holding-back / could-raise / could-lower / assumptions. |
| `training` | Structured Training evidence from the active phase start through today (`createGoalTrainingProgressToDate`): defensible comparisons only, region roll-up, top improving highlights, regressions, Server-owned `summary` that states only the comparable-movement trend and its weakness (never the goal thesis or DEXA progress); `trainingDayCount` = local training days. |
| `turningPoints` | Selective: goal baseline DEXA; activation only when > 7 days from the baseline; phase transitions (with the phase-start scan's own delta from baseline); later DEXAs only when material (lean change ≥ max(1 lb, 10% of target), crossing 50%/100% of target, or guardrail in/out change). No planned-review or future-destination entries. Max 6. Bodies are short and carry only what is unique to the milestone (e.g. the phase-start scan's delta, the change since the previous scan, guardrail entry/exit) — never the composition table. |
| `coachTake` | Latest published V3-bound briefing (weekly/midweek/monthly/DEXA/photo; publication instant desc; excludes failed/in-progress/preview and V2). Midweek: exactly the sections its presentation contract served (suppressions respected); other families: `narrativeV3.coachTake`, `sections.action`, `sections.watch`. Text is verbatim. Provenance: `artifactId`, `cadence`, `briefingLabel`, `publishedOn`, `evidenceWindow`, `attribution` ("Sep 23 Midweek Briefing · Coach's Take"). |

Coaching-language rules enforced for Server-authored Goal text:
no "one update", "this update", "evidence accumulating", "next review",
"goal review", "my recommendation", first-person singular or raw engine
language (`findGoalCoachingLanguageViolations`). Briefing Coach's Take text is
never rewritten on the Goal; defects there belong to the briefing engine.

Historical/completed goals are unaffected (`CompletedGoalPreviewService` keeps
its own final composition). No artifacts are regenerated by this read.

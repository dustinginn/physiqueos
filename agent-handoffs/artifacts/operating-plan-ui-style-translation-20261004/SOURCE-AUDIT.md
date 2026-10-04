# Operating Plan source audit

## Authority

- Prompt authority: `ecf54c6ce22e90075e613eb8208b19fc6249e2a3`.
- Exact Build 85 Native source: `b8ee8690b194cb90086f6f62816b9a2c8c400dc026`.
- Exact current Server source: `3c0f4aefddbb9a6886f6ad012443978303d47024`.
- Founder production screenshot values in the assignment remain the authority for the current Energy, Nutrition and Training landing rows.

## Native implementation

`OperatingPlanLandingView` reads the production `OperatingPlanAPI`, renders Server order and uses the item destination exactly when one exists. The current Native structure is header → canonical domain sections → rows. Loading is an accent-tinted `ProgressView`; a failed read shows `Operating Plan could not be loaded.`

`OperatingPlanStrategyDetailView` reads bounded production resources for Energy, Nutrition and Training. Its order is header → Goal/Started/Status → `Strategy Detail` fields → Energy phase history only when supplied → edit action only when supplied. Back navigation is `Operating Plan`, pull-to-refresh invalidates the bounded resources, and unavailable/error copy stays local to this surface.

Energy is intentionally read-only. `ProductionEnergyStrategyAPI` rejects a response unless `intentionallyReadOnly == true` and `editLabel == nil`. Nutrition and Training expose `Edit Strategy` and route into their existing canonical editors; they use current-version concurrency rather than an Evidence mutation.

## Server implementation

`OperatingPlanReadService` projects the landing in this exact order:

1. Energy Strategy
2. Nutrition
3. Training
4. Recovery
5. Peptides
6. Supplements
7. Tracking
8. Coaching Updates

The scoped Founder values are:

- Energy — `Current Phase Energy Plan`; `2,500 kcal/day intake · 800 kcal/day activity · Monthly review`; Active.
- Nutrition — `Calorie Calibration`; `1 g per lb of body weight · intake adjusted gradually`; Active.
- Training — `Maintenance Training Strategy`; `9 weekly area sessions · Moderate progression`; Active.

Every landing item receives a typed destination. If no web href resolves, the Server emits `native.operating-plan.status`; the translation therefore uses no dead chevrons.

`OperatingPlanStrategyDetailService` classifies the strategy purpose as static Goal/Phase purpose. Goal change, phase change, strategy configuration change and revision may change it. New evidence, Confidence, briefing publication, training performance and DEXA publication do not.

### Energy detail

Current production content is:

- Lean Mass Build Energy Plan;
- current Goal, effective date and Active status;
- Plan Type, Caloric Intake, Activity Target, Evidence Monitoring, Strategic Review and Strategy Changes;
- no edit action.

The Server can resolve historical Energy protocols by date/phase through `resolveOperatingPlanEnergyStrategyAt`, but the production detail contract projects only the active protocol. Native then hardcodes `energyPhaseHistory: []`. The sandbox fixture and view support Phase 1/Phase 2 history, but production does not supply it. This is recorded as a genuine implementation delta rather than filled with prototype values.

### Nutrition detail

`Macro Strategy` owns protein, carbohydrate approach, fat approach and macro philosophy. It intentionally does not own observed calorie history or Nutrition Evidence. `Edit Strategy` opens the current-version editor and preserves the existing write boundary.

### Training detail

`Build Lean Mass Training` owns weekly area-session total, training focus, progression, current Goal phase and Goal-level context. It does not expose workout history or logger actions. `Edit Strategy` opens the current-version editor.

## Visual translation boundary

The design changes visual hierarchy only: a shared strategy color field, compact metadata, metric emphasis for leading configuration values, lined supporting rules and deliberate semantic accents. It does not alter content ownership, route behavior, history availability, edit semantics or production projection.

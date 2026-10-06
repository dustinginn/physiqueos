# Training progression authority correction — implementation plan

- Baseline: shipped Build 88 source `7fce3b9708c063f3c6b58571778c595012b5de6d`
- Audit authority: `e6c10085e12da4223e6430bc1f47a9e0b6c4aa84`
- Task authority: `e5347f4d388b1fa4a953132865fc041c45d9d152`
- Lane: `codex/training-progression-authority-candidate-20261006`
- Scope: Server progression decision and additive read transparency only; no Build 89 integration, deployment, production mutation, Native build change, or TestFlight action.

## Plan

1. Make the active Training protocol version's `trainingStrategy.progression` the Logger's executable policy input. Add the Founder-locked `minimumExposureDays: 14` to newly built strategies, preserve a narrow read-time compatibility default for existing supported rules, and fail closed for absent, ambiguous, or unsupported configured rules.
2. Replace the latest-session cadence gate with two independent gates over the exact canonical exercise, execution variant, and relationship context: configured qualifying-session count and elapsed days since the first qualifying success in the current prescription/load run. Adaptive cadence remains diagnostic metadata only.
3. Define qualifying success from durable canonical occurrences and all persisted comparable working sets. Because the current canonical contract has no prescribed rep-range maximum or planned-set count, use an explicitly labeled conservative transitional stable-set-profile mode; support an explicit configured rep-range maximum when present and do not invent exercise-specific ranges.
4. Keep regression/recovery ahead of progression eligibility, reset the run on a meaningful load/unit change, treat rep changes as same-load progression but require a stable current success profile before load eligibility, and keep eligibility separate from evidence-supported target selection.
5. Add deterministic domain and Server projection coverage for the Cable Machine Front Raises weekly, twice-weekly, every-other-week, inversion, insufficient-success, regression, new-load-reset, configured-count, identity/alias, variant, relationship, partial-set, same-day, phase/Goal, adaptive-cadence, target, contract, and cache-invalidation boundaries.
6. Run focused progression/Logger suites, broader Server regression suites, and any Native decode/cache contract tests touched by additive fields. Publish the isolated candidate SHA and a main-visible report-only handoff with deployment, rollback, migration, production-read, and Native follow-up notes.

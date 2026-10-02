# Apple Watch Workout V1 — split-metrics design lock

Status: **Founder-selected; feature branch pushed for review**
Repository: `dustinginn/physiqueos`
Agent: Codex
Implementation branch: `codex/apple-watch-workout-v1-phase0-foundation`
Implementation SHA: `9dea5d2e2d13afcabfcb1c810172cc2ad972a8c0`
Parent report: `agent-handoffs/reports/20261002T055516Z-apple-watch-workout-v1-phase0-foundation.md`

## Decision

Founder selected the split-metrics normal-set layout. The non-shipping Watch board now presents Load and Reps as separate, substantially larger tiles while preserving previous/current/up-next context, the large rest Stopwatch and Complete Set action.

This layout is the Phase 1A visual baseline. It intentionally supports a future interaction model in which the user focuses either Load or Reps and adjusts that value with the Digital Crown. Crown editing is not part of Phase 0 or the initial Watch V1 and must not compromise ordinary Crown vertical navigation unless separately designed and authorized.

## Updated artifacts

- `agent-handoffs/artifacts/apple-watch-workout-v1/watch-workout-v1-board.svg`
- `agent-handoffs/artifacts/apple-watch-workout-v1/README.md`
- `agent-handoffs/backlog/PHYSIQUEOS_PRODUCT_BACKLOG.md`

The implementation branch contains the artifact changes. Main receives this report, the original-report addendum, latest pointers and the matching durable backlog decision.

## Validation and scope

- `xmllint --noout` passed for the updated SVG board.
- `git diff --check` passed before commit.
- No Native, Watch or Server source changed in this follow-up, so no source regression suite was rerun.
- The full Phase 0 regression results remain recorded in the parent report; `9dea5d2e2d13afcabfcb1c810172cc2ad972a8c0` differs from the tested Phase 0 source candidate only by non-shipping mockup/documentation/backlog files.
- No deployment, Native build, Watch archive or TestFlight upload occurred.

## Next implementation boundary

Phase 1A should implement the separate Load and Reps tiles as static authoritative values first. Any later focus-and-Crown editing flow requires an explicit interaction design, command-contract extension, conflict/revision behavior and paired physical-Watch acceptance before it enters shipping scope.

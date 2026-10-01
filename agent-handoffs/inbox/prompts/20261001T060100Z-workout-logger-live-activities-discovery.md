Workout Logger Live Activities discovery and implementation plan. NEW Claude Remote Control chat/worktree. High reasoning. Research/audit/plan only; do not implement.

Standing rule: publish GH before every stop.

Purpose: prepare the next PhysiqueOS project: surface an active Workout Logger session through iOS Live Activities on Lock Screen and Dynamic Island/system surfaces.

Do not modify production, upload TestFlight, change signing/entitlements, or touch HealthKit Sleep.

Audit current repo, not assumptions.

Research current Apple ActivityKit/WidgetKit requirements for the actual deployment target: Live Activity lifecycle, ActivityAttributes/ContentState, local start/update/end, lifetime, Lock Screen, Dynamic Island compact/minimal/expanded, StandBy where applicable, update throttling, timer/countdown rendering, stale dates, relevance/dismissal, background/termination/reboot behavior, remote push updates/tokens, authorization, payload limits, privacy, deep links, AppIntent/button interactions supported by target OS, multiple activities, Simulator vs physical-device testing. Cite authoritative Apple sources/versions in report.

Map current PhysiqueOS Native architecture:
Workout Logger active-session authority and persistence; exercises/sets/reps/load/supersets/variants/timed/bodyweight; current exercise/set; completion; rest timing if any; session start/end/confirm; Evidence Review handoff; relaunch recovery; navigation/deep links; app lifecycle; notifications/background; HealthKit workout reconciliation; widget/extension targets; App Groups; entitlements; deployment target; project generator; signing.

Determine authoritative active-workout state foreground/background/terminated/locked. Live Activity must never become authority.

Propose restrained Phase 1 UX:
Lock Screen: session/training day, elapsed time, current exercise, useful set context, most recent/next context, rest countdown if active, progress if meaningful.
Dynamic Island: compact/minimal useful workout/rest indicator; expanded current exercise/set/rest/elapsed context. Rest timer may temporarily dominate.
Avoid tiny overloaded data.

Investigate interaction support: tap-to-open, mark set complete, skip rest, +30 sec, next exercise. Recommend only interactions actually supported and safe. Address accidental taps and lock-screen privacy.

Propose minimal immutable attributes and dynamic content state. Do not put workout history into ActivityKit state. Include versioning.

Prefer Phase 1 entirely local ActivityKit updates because workout is phone-driven. Explain if/when remote push updates would ever be useful.

Specify lifecycle: start, set/exercise/rest updates, background, relaunch, force quit, stale activity, cancel, complete, Evidence Review transition, duplicate prevention, orphan cleanup, authorization disabled, devices without Dynamic Island, multiple workout guard, app/extension mismatch.

Audit rest timer. If existing, use absolute endsAt and system timer rendering rather than per-second updates. If absent, decide prerequisite/scope. Elapsed workout time should derive from startedAt.

Design deep links into active Workout Logger/current exercise using existing navigation architecture.

Document exact project changes for implementation: Widget Extension, ActivityKit/WidgetKit, plist/NSSupportsLiveActivities, App Group need or not, shared models, entitlements/signing, generator/project changes, bundle IDs, extension target, tests/TestFlight. Do not log into Apple web portals. If future re-auth is needed, Founder must be told.

Privacy: assess what workout information appears on lock screen and redaction behavior.

Create deterministic test plan: state derivation, start/update/end, duplicates, relaunch, timers, superset, timed/bodyweight, transitions, completion/cancel, stale cleanup, auth disabled, deep links, extension snapshots, all Dynamic Island regions, Lock Screen, physical-device acceptance.

Propose phased implementation:
Phase 1 minimum useful local Live Activity.
Phase 2 safe interactive controls if supported/desirable.
Phase 3 remote push/richer integration only if a real use case exists.
List likely files/targets and acceptance criteria.

No application code. Scratch API probes only if needed and not product commits.

Publish agent-handoffs/reports/<timestamp>-workout-logger-live-activities-discovery-plan.md with Apple facts/sources, authority map, UX, state/lifecycle, interaction matrix, project/signing changes, privacy, tests, phases, blockers/open Founder decisions, and recommended implementation coder/reasoning/chat.

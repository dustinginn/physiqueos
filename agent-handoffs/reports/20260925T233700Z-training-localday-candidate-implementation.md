# Training aggregation + local-day correctness: candidate implementation

Task id: `claude-training-aggregation-and-local-day-correctness-20260925`
Lane pointer: `agent-handoffs/training-localday/latest.json`. Contract and diagnosis: `agent-handoffs/reports/20260925T233600Z-training-localday-diagnostic-and-contract.md`.

## Candidates (exact, pushed; not merged, not deployed)

| | SHA | Branch | Base |
|---|---|---|---|
| **Server** | `09f04dc54eb26bfccdd2aeb34b156d8fc7d3f80e` | `claude/training-aggregation-server-20260925` | production `afdc849a` (5 commits: `ab7e6988`, `aa52aa7b`, `d5e6707f`, `8e926e0a`, `09f04dc5` — the last is test-only) |
| **Native** | `c15f08812dd8c7a0102087d7abca7aa92e61da8d` | `claude/training-localday-correctness-20260925` | Performance candidate `c736254b` (4 commits: `6fe5dca4`, `2a4605be`, `83921065`, `c15f0881`), so Build 61 can carry both projects |

Diff scope: Server 12 files, no migration/schema/infra/package/Docker file, SELECT-only store addition. Native 12 files incl. one new source file (`Contracts/DailyDriverLocalDay.swift`) registered in `ios/Scripts/generate_project.py` in a list allocated after every existing object: `project.pbxproj` gains exactly 4 lines, nothing renumbered (generator reproduces the file byte for byte).

## Server: Workstream A (Training aggregates)
- `HealthKitCardioTrainingPresentation.projectPresentedHealthKitCardioTrainingRecords`: the presented-workout universe for aggregate surfaces — every canonical HealthKit Cardio workout Training Day would present for its own local date, across all dates, with Training Day's per-day suppression judged only against the active evidence Training Day would place on that day (same zone resolution: `user.timezone ?? America/Los_Angeles`). Deterministic output order (local date, capture stamp, id).
- Each projected record carries `source.workout_id` = the canonical workout id: its authoritative duplicate identity (fixes the `"Apple Health"` collapse). Not rendered anywhere; Training Day and session JSON are unchanged.
- `getLanding` / `getReporting` / web `getLibrary` merge the projection; one bounded owner-scoped Cardio-family SELECT (`listHealthKitCanonicalCardioWorkouts`). The Native Library read passes `includePresentedCardio:false` (exercise registry only; zero extra reads). Failures degrade to the evidence-only history with a class/code-only warning (`training.{landing,reporting,library}.healthkit_cardio_unavailable`). The legacy evidence-package path keeps its package history.

## Server: Workstream B (local day)
- `resolveRequestedTimeZone` (strict IANA shape + `Intl` check; malformed/unknown -> null -> canonical zone).
- Native `evidence-review-queue` passes the validated zone to `core.getLog({ timeZone })` -> Logged Today uses the device's current local day. Home and Morning Check-In reads ignore any zone.
- `weight.submit.v1` accepts an optional zone used ONLY for the future-date guard (`measurementDate > today`); `submitCheckIn` never passes it (briefing/priority reconciliation stays canonical). Never persisted; record `localDate` unchanged; stored user zone unchanged.
- Native `training-day` validates its optional zone (previously any string reached `AT TIME ZONE`).
- The integrated HealthKit acceptance guard now allows only these exact weigh-in zone lines in `CanonicalPersistenceCommandPorts.js`; any other change there still fails it; the forbidden-write scan is unchanged.

## Native: Workstream B
- `DailyDriverLocalDay` (device local date + zone) and `DailyDriverDayTrigger` (`NSCalendarDayChanged`, significant time change, `NSSystemTimeZoneDidChange`).
- `AppEnvironment.reevaluateDailyDriverDay()` on every activation and on every trigger: recomputes from the system (zone cache reset only here); on a date OR zone change invalidates every day-scoped read and the last-known Home snapshot, THEN publishes `dailyDriverDay`.
- Log: reloads on a day change (visible only) and on visible foreground (re-evaluates first; loads only on a same-day resume). Home: activation load re-evaluates first; day-change reload visible only; notification sync kept. Evidence hub: day-change reload visible only. Non-visible tab roots re-read on their own next appearance (their caches are already invalidated) — no resume burst, preserving c736254b's visible-only refresh.
- Log read sends `timeZone=<device zone>`; Home read sends it only to partition the cache and the persisted snapshot key (Server ignores it for Home).
- c736254b last-known Home: refused unless generated on the same day on BOTH the device's current calendar and the Server-owned canonical calendar (`notificationTimeZone`), and never painted in a zone other than the one it was saved in. First launch after upgrade simply finds no snapshot under the new key (safe).
- Plain weigh-in payload names the device zone (injectable); its idempotency signature includes the zone (the Server hashes the payload); Morning Check-In payload and signature unchanged.
- Preserved from c736254b: last-known Home paint, acknowledge-first Priority completion, retained view models, visible-only foreground refresh (all their tests pass).

## Compatibility / release order
Each side is independently safe with the other side's current production build: current Server ignores the new Native `timeZone` params (Logged Today stays canonical until the Server ships); Build 60 sends no zone, so the new Server behaves exactly as today for Logged Today and weigh-ins, while Recent Training History is fixed immediately. Recommended: **Server first** (Training history fix live for Build 60; zero Native dependency), then **Build 61** from the Native candidate (= c736254b performance work + rollover/zone correctness).

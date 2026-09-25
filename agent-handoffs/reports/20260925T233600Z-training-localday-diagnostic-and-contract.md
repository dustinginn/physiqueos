# Training aggregation + local-day correctness: diagnostic and contract

Task id: `claude-training-aggregation-and-local-day-correctness-20260925`
Lane: training-localday (pointer `agent-handoffs/training-localday/latest.json`). The HealthKit `agent-handoffs/latest.json`/`latest.md` and `agent-handoffs/performance/latest.json` are intentionally untouched.
Governing prompt: `agent-handoffs/inbox/prompts/20260925T173000Z-claude-training-aggregation-and-local-day-correctness.md` (prompt-only inbox file; the gated `physiqueos-inbox fetch` refuses only because `inbox/latest.json` still points at the completed Sep 23 task).

## Authority (re-verified live, read-only)
- Production Server `afdc849a6399130668d846544e85236fe1974741`, deployment `c4d8484e-0bfa-4d07-9cf4-0cf591ac3ee2` ACTIVE, web and worker `source_commit_hash` exact, `/api/v1/health/live` build `physiqueos-afdc849a-20260925`, production branch head `afdc849a`.
- Native installed Build 60 `00321dcc…`. Performance Native candidate `c736254b` unreleased (ancestor: `00321dcc`).
- Cardio policy v4 [cardio, strength] (not read or changed by this task).

## Workstream A: root cause (proven on production data, read-only)
Training Day (`TrainingNavigationReadService.getDay`) is the only Training read that merges canonical HealthKit Cardio workouts (`healthKitCanonicalWorkouts`, via `HealthKitCardioTrainingPresentation`). Every aggregate Training surface reads only canonical `training` evidence objects:
- Recent Training History's "N sessions" is `getTrainingDays()` in `ProgressReportingService` (count of active training evidence payloads per `observed_at` date).
- A pitfall blocks a naive fix: a projected HealthKit Cardio record's only duplicate identity was the shared artifact ref `"Apple Health"`, so inside `getCanonicalPayloads` every such record collapsed into ONE record (key `training|authoritative|Apple Health`).

Zero-write probe of the deployed code (afdc849a) over production data (identity-gated, `READ ONLY` transaction, rolled back):

| Day | Training Day | Recent Training History (before) |
|---|---|---|
| Sep 20 | 3 (Outdoor Walk ×2 + Strength) | 3 sessions |
| Sep 21 | 3 | 3 sessions |
| Sep 22 | 3 (2 duplicate HealthKit walks suppressed) | 3 sessions |
| Sep 23 | 3 (Walking ×2 + Strength) | **1 session** |
| Sep 24 | 3 (Walking ×2 + Strength) | **1 session** |

Stored user timezone field is null (the canonical fallback America/Los_Angeles applies).

## Surface-by-surface semantics (explicit contract)

| Surface | Source today | "Session" means | Cardio counts? | Screenshot + canonical HK double count? | Logger + HK Strength double count? | Decision |
|---|---|---|---|---|---|---|
| Training Day | training evidence + canonical HK Cardio | presented workout | yes | no (suppressed) | no | **the contract** (unchanged) |
| Training landing / Recent Training History (`trainingDays`, `latestTrainingDay`, `entries`) | training + activity_day evidence | evidence payload | only screenshot Cardio | n/a (HK absent) | no | **presented-workout universe, same dedupe as Training Day** |
| Week/month/goal-scoped history (same report, date window) | same | same | same | same | no | same universe (window by workout local date) |
| Training reporting `history.days`, overview "Sessions" | same report | evidence payload | screenshot only | n/a | no | same universe |
| Reporting resistance performance / status groups / PRs | resistance sessions | exercises per status | no (by design) | n/a | no | **unchanged: structured Strength only** |
| Training Library (Native) | exercise registry only | n/a (no counts) | n/a | n/a | n/a | **unchanged**; the Cardio read is skipped |
| Web Cardio library breakdown / Cardio activity history | training evidence | workout per activity type | screenshot only | n/a | no | **workout history: includes canonical HK Cardio** (e.g. new "Walking" bucket) |
| Exercise detail / records / PRs | exercise-scoped evidence + performance events | exercise session | no | n/a | no | unchanged (Cardio has no exercises) |
| Evidence Hub (Native) training stream | landing `latestTrainingDay.summary` | presented workouts of latest day | yes via landing | no | no | follows the landing automatically |
| Web `/progress` hub training metric | `ProgressHubReadService` evidence count | evidence payload (all-time) | screenshot only | n/a | no | **left as-is** (web-only legacy total; follow-up) |
| Log "Logged Today" training row | training evidence of the day | Logger/evidence session | deliberately no Cardio row | n/a | no (confirmed HK only decorates) | unchanged by design |
| Home / Goals / Weekly / Midweek / Monthly training | resistance sessions / performance | structured Strength | no (by design) | n/a | no | unchanged |
| Activity Day | whole-day accounting | accounting only | energy only | see note | no | unchanged (accounting-only) |

Canonical presented-workout model (Server): structured Strength Logger session = 1; canonical HealthKit Cardio workout = 1 unless it is an unambiguous duplicate of ACTIVE screenshot/typed evidence on its own local day (stored coexistence decision pointing at present active evidence, or live re-assessment); ambiguous/possible/unverifiable coexistence fails open (both shown); superseded/retired evidence never suppresses; HealthKit Strength telemetry is never a row (candidate or confirmed); generic historical walking stays "Walking"; prospective Indoor/Outdoor labels come only from `canonicalType`; no Logger session, link, claim or auto-confirm is created or implied.

Note (unverified, out of scope, for the HealthKit lane): Activity's whole-day workout-energy decomposition counts every presentable canonical Cardio workout without a coexistence check while screenshot walk calories also feed training aggregates; a Sep 22-shaped day could double count workout calories inside the accounting split (not a session count). Not changed here.

## Workstream B: diagnosis
- Native sends no zone and no local date on any read; the Server resolves "today" with the stored user zone or America/Los_Angeles. At 00:11 CDT Sep 25 (= 22:11 PDT Sep 24), Logged Today showing Sep 24 was the Server's correct answer under that rule. **The Founder observation is explained, not a Server bug.**
- Native defects found independently of that:
  1. LogView had no foreground refresh and no day/zone-change handling at all; a retained Log keeps yesterday's rows until a tab switch or pull to refresh.
  2. No observer of `NSCalendarDayChanged`, significant time change or `NSSystemTimeZoneDidChange`; read caches (30–90 s TTL) and retained view models survive midnight.
  3. The c736254b last-known Home snapshot was refused only by the device's `Calendar.current` captured when `ProductionHomeAPI` is created, and its key carried no zone, so a snapshot saved in one zone could be painted in another (false accepts in both travel directions).
  4. A manual weigh-in stamped with the device's date after local midnight east of the canonical zone is rejected by the Server's future-date guard (canonical zone still on the previous day) — a real travel write defect.
- HealthKit query bounds already use `Calendar.autoupdatingCurrent` (device zone); documented only, unchanged.

## Local-day contract (three separate authorities)
1. **Daily-driver "Today" UX** (Logged Today, today-scoped caches, Home/Log/Evidence refresh): the device's current local date + zone; recomputed from the system clock and zone on every activation, at local midnight, on significant time change and on zone change; never advanced from a cached value.
2. **Canonical record dates**: every record keeps the `localDate` stamped at creation (HealthKit keeps its workout/sample zone basis). Travel never rewrites or re-buckets history. The requested zone is never persisted and never changes the stored user zone.
3. **Strategic briefings and priority occurrences**: Server-owned canonical coaching zone (America/Los_Angeles). Weekly/Midweek/Monthly windows (Monthly on day 1), Home's Today's Focus, notification schedule and the Morning Check-In's briefing/priority reconciliation never follow the device zone.

## Safety
No production mutation, no deploy, no TestFlight, no HealthKit policy/reconciliation/strategic-eligibility/ingestion/classifier/`isIndoorWorkout` change, no briefing regeneration, no device operation. All production access was read-only (`BEGIN … READ ONLY`, rolled back).

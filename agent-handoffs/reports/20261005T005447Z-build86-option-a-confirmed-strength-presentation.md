# Build 86 — Option A confirmed Strength presentation (Server) deployed

- Generated (UTC): `2026-10-05T00:54:47Z`
- Agent: Claude (existing Build 86 Remote Control session `c60b384d`; single RC worktree, no EnterWorktree)
- Status: **OPTION A DEPLOYED AND VERIFIED / SAFE TO RESOLVE TODAY'S MATCH / BUILD 86 READY FOR ARCHIVE AUTHORIZATION (NOT UPLOADED)**
- Governing prompt: `agent-handoffs/inbox/prompts/20261005T005000Z-build86-option-a-confirmed-strength-presentation.md` at `9b688e68`

## Today's pending review instruction

**Safe to tap Use Logger session 1.**

What the tap does, and what the Founder will see afterwards:

- **What it writes.** Only the workout link (confirmed), its one-to-one claims, and the reconciliation review's resolution (`CanonicalPersistenceCommandPorts` → `confirmHealthKitWorkoutRelationship`). It reads but never writes the Logger's canonical evidence record. No session is created, and no sets, exercises, reps or loads change.
- **The session stays 12:31–1:47 PM (76 min)** on Workout Detail, Training Day / Activity and Logged Today. The Apple workout supplies active energy and average heart rate only. Its 1:28–1:48 window does not replace the Logger window.
- **Calories.** The daily Activity calorie total is unchanged (it is Apple's move total; workout energy is descriptive and never added to it). After confirmation, the Apple workout's energy is itemised as confirmed workout calories.
- **No duplicates.** Apple Strength workouts never appear as standalone Training rows, and both Stair Steppers stay separate Cardio workouts.

This lane did not tap, resolve or mutate the review.

## Authority

| Item | Value |
|---|---|
| Production before | `403ca5493297c2101990a7da59eed94153acc943`: my `51c459c4` presentation fix plus another lane's two Sleep V3 graduation commits (`7de8d357`, `403ca549`), deployed by that lane after `51c459c4` |
| Server deployed | **`27dad44a1f63d68b53f23e51152a10a5d04968e6`** (branch `claude/server-option-a-confirmed-strength-20261005`; `combined-app-platform-cutover` fast-forwarded from `403ca549`, so Sleep V3 is preserved) |
| Deployment | `99188a9e-75a7-49c6-a5c2-05a43737de5f`, ACTIVE 9/9; web and worker `source_commit_hash` = `27dad44a`; nothing in progress |
| Health | `/live` and `/ready`: `physiqueos-27dad44a-20261005`, ready 9/9 |
| Logs | fresh web and worker envelopes `gitSha` = `27dad44a`; no error-level entries; no review/link resolution traffic in the recent window |

## Option A semantics (implemented once, in the shared confirmed-attachment projection)

For a **confirmed** HealthKit Strength link, `projectConfirmedHealthKitWorkoutAttachments` now builds the attachment's `session` as follows:

- `startedAt`, `endedAt` and `durationSeconds` come from the **structured Logger session**: `metadata.start_time`, `end_time` and `duration_seconds`, normalized to ISO. A missing end is derived only from the Logger's own start plus duration.
- `activeCalories`, `totalCalories`, `averageHeartRate` and `distance` come from the **confirmed Apple workout**.
- Missing Logger timing stays missing. It is never filled from the Apple workout, so a start-only legacy session shows no end or duration rather than Apple's.

Every presentation consumer reads this one projection, so they all agree:

- Workout Detail: the Native Apple Health card and the telemetry, via `applyHealthKitStrengthPresentationToTrainingRecord`.
- Training Day / Activity linked-training context: value, detail line and telemetry.
- Logged Today: the "Strength Training · 76 min" line.

**Unchanged:**

- the wire keys (no Native change; Build 86 `cec8af20` needs no update);
- `contentAuthority` (trainingContent `workout_logger`, telemetry `healthkit`) and the Apple Health source;
- sets and exercises;
- matching, trust and review policy;
- whole-day accounting;
- the Apple workout's own "contributing workout" row in Activity Detail, which describes the Apple workout itself.

Unconfirmed, possible and No-match candidates still never change Logger presentation (from `51c459c4`).

No Apple coverage note ("Apple Health recorded 20 of 76 min") was added: there is no natural slot in the current contract.

## Tests

- **`HealthKitWorkoutPresentationService.test.js` + `LoggedTodayService.test.js`: 61/61 pass.** New and updated cases:
  - pending candidate, possible_match, No match/unlinked and no Apple workout → Logger window;
  - a confirmed **full-window** link and a confirmed **late/truncated** link (today's shape: Logger 12:31–1:47 vs Apple 1:28–1:48) → Logger window plus Apple 410 cal / 122 bpm, consistent across the shared projection, Workout Detail, Activity linked context (with confirmed-workout accounting = 1) and Logged Today ("76 min");
  - exercises unchanged and deep no-mutation snapshots;
  - exactly one training record;
  - a missing Logger end is never filled from Apple;
  - a Logger end derived from its own start plus duration.
- Item 12 acceptance updated from the superseded 01d1900b byte digests to Option A structure (same wire keys).
- **Related suites (119 files): 34 failures, identical by test name to production base `403ca549`; zero introduced.**
- **Full Server unit suite: 10,043 tests, 302 failures, identical to base; zero introduced.** The 4 extra tests are the new Option A cases.
- The base comparison ran in this same worktree via a detached switch (no extra worktree).

## Deploy

The established guarded path was used:

1. Quoted fast-forward push, gated on the production head being exactly `403ca549`.
2. Spec stamp of exactly 4 values (web/worker `PHYSIQUEOS_GIT_SHA` and `PHYSIQUEOS_BUILD_ID`).
3. `create-deployment --force-rebuild`.
4. Polling to ACTIVE, then verifying `source_commit_hash`, log `gitSha`, `/live` and `/ready`.

The temporary spec copies are deleted. No manual production data mutation was made.

## Build 86 readiness

Option A is Server-only. Native `cec8af20a6121bb66ecca3ba9f667d91774a891c` (`1.0 (86)`, last uploaded 85) is unchanged and **ready for archive / guarded TestFlight authorization**. The workflow is in `agent-handoffs/reports/20261005T003623Z-build86-final-integration.md`. No upload was performed.

## Ledger

- "Workout presentation — confirmed link with a late or partial Apple workout replaces the Logger window": **RESOLVED** (Option A, `27dad44a`, deployment `99188a9e`).
- The Watch and appearance entries remain release-gated on physical acceptance.

## Stop

Option A is deployed and verified. Founder instruction: **Safe to tap Use Logger session 1.** Build 86 awaits archive/upload authorization.

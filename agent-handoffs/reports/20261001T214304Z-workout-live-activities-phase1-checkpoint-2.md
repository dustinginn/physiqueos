# Workout Live Activities Phase 1 — checkpoint 2 (paused: disk below the 15 GiB floor before archive)

- Task id: `workout-live-activities-phase1-implementation-20261001`
- Previous checkpoint: `agent-handoffs/reports/*-workout-live-activities-phase1-checkpoint-1.md`
- Generated (UTC): 2026-10-01T21:43:04Z
- Status: **paused (resource)** — implementation complete and Build 77 prepared; archive/upload NOT started.

## Exact candidate
- Branch `claude/workout-live-activities-phase1-20261001` (base `2b41dc48`), pushed head **`c299fa29`**; Build 77 bump commit `596e3731` (metadata-only: `APP_BUILD_NUMBER` 77, regenerated project, build-number pin test). Last uploaded Native build is 76, so 77 is the next number. Celebration fix `69cad804` not merged. Server untouched.

## What changed since checkpoint 1
1. **Fresh full-implementation review** (read-only): no blockers. Fixed:
   - swipe-away suppression no longer depends on a dismissed record still being listed (it is driven by ActivityKit state/enablement events);
   - `flush()` waits for an in-flight sync, and runs under a background assertion when leaving the foreground;
   - stale activities refresh; the Lock Screen and Island share one presentation decision (stale and privacy both hide Complete Set);
   - the deep link validates the workout before touching navigation;
   - extension device family `1,2`; explicit intent authentication policy; weak tests replaced with real assertions.
2. **Delta re-review** found a real flaw in my first fix and I corrected it. The 8 h guard measured workout age rather than activity age. The rule is now: only a LIVE activity going straight to `.dismissed`, not ended by this app, counts as a swipe; system endings (`.ended`: 8 h limit, force quit, Live Activities off) never suppress; re-enabling Live Activities clears suppression; our own endings persist across relaunch.
3. **Found and fixed a test-infrastructure bug of mine:** the unit-test host app was starting a REAL Live Activity from leftover sandbox drafts, which launched the extension process and kept `xcodebuild` from exiting. The unit-test host now uses an inert ActivityKit client (`c299fa29`).

## Tests actually run
- Live Activity + authority + projection suites (143 tests) green at `734741af`; coordinator suite (27 tests, refined rule) green at `bbb27278`.
- Full Native unit suite at `596e3731` (Build 77): **1832 tests, 1 failure = the known Peptide dose test** (pre-existing, unrelated).
- UI journeys on a clean private simulator (rest-menu default Stopwatch/Off/Countdown, Save & Leave, Workout Review, backgrounded workout) green at `734741af`.
- NOT re-run on the final head `c299fa29`: full unit suite and UI journeys (it only changes which client the unit-test host uses; it compiles: TEST BUILD SUCCEEDED). Release compile and archive have not been run.

## Blocker
- Free disk fell to **14.9 GiB** (floor 15) and is dropping while other work runs on this Mac. An archive needs roughly 1–2.5 GB. I stopped before any heavy build rather than go below the floor. I removed my own build folders and killed my own stray processes; nothing belonging to other sessions was touched.

## Founder action needed (any one)
1. Free roughly 6+ GiB on the Mac (target ≥ 20 GiB free), then tell me to resume; or
2. Explicitly waive the 15 GiB floor for this archive; or
3. Say to stop here (the candidate is pushed and complete).

## Remaining plan once unblocked
1. Re-run the full unit suite and the UI journeys on `c299fa29`.
2. Release archive from that exact SHA with Xcode automatic signing (first real test of distribution signing for the extension; if Xcode asks for Apple ID re-auth or 2FA I stop and report the exact action).
3. Release-tool dry run, then upload build 77, wait for VALID.
4. Publish the final report with the physical-device checklist. I will not claim any physical-device acceptance.

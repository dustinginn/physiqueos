# Workout Logger Live Activities Phase 1 — final report (Build 77 uploaded, processing VALID)

- Task id: `workout-live-activities-phase1-implementation-20261001`
- Prompt: `agent-handoffs/inbox/prompts/20261001T201500Z-workout-live-activities-phase1-implementation.md`
- Generated (UTC): 2026-10-01T22:09:47Z
- Status: **complete — Build 77 uploaded and VALID. Physical-device acceptance has NOT been done.**

## Exact authority
| Item | Value |
|---|---|
| Repository | `dustinginn/physiqueos` |
| Implementation branch | `claude/workout-live-activities-phase1-20261001` |
| **Final pushed SHA / archived source** | **`c299fa29`** (clean worktree, equal to origin; archive built from exactly this) |
| Build bump commit | `596e3731` (metadata-only: 76 → 77) |
| Base | `2b41dc48` (TrainingSessionAuthority integrated with shipped Build 76) |
| Version / build | 1.0 (**77**); previous upload was 76 |
| Delivery id | **`2d0daa39-a6c9-4bc7-a027-1ec9243bf7e3`** |
| Processing state | **VALID** (read-only status re-check: import-status VALID, is-on-app-store-connect True, uploaded 10/1/26 3:07:57 PM) |
| Archive | `~/Library/Developer/Xcode/Archives/2026-10-01/PhysiqueOS-Build77.xcarchive` (retained) |
| Upload log | `~/.physiqueos-release/logs/upload-b77-20261001-150515.log` |
| Production Server | untouched; no Server, HealthKit Sleep or Briefing change |
| Performance-record celebration fix `69cad804` | **not merged** (kept isolated, as instructed) |

## What shipped in Build 77
- **Live Activity**: Lock Screen card and Dynamic Island compact / minimal / expanded, following the Founder-approved prototype: large lower-left rest clock, trailing 44 pt **Complete Set**, never more than two context rows, privacy-redacted version.
- **Two-row rule**: Previous + Current normally; Current + Up Next on an exercise's final set; Completed + Up Next right after finishing an exercise (single-set exercises go straight to Completed + Up Next).
- **Supersets** are round/unit aware: A1 → B1 → A2 → B2; Completed + Up Next never appears mid-round, including with unequal set counts; A/B chips and "with <partner>".
- **Rest preference** in the Logger (compact menu): **Stopwatch is the default**, Countdown with a length, Off. A change applies from the next completed set; a running rest keeps its mode.
- **Complete Set** is a `LiveActivityIntent` that runs in the app and calls the existing `TrainingSessionAuthority.completeSet` with the rendered `expectedRevision` and a fresh `mutationId` per tap. It confirms the values currently shown. Stale, duplicate, wrong-phase, invalid-value and persistence-failure taps fail safely, and the intent returns only after the activity has re-rendered.
- **Tap to open** goes to the active Workout Logger through the existing Log navigation (`physiqueos-workout://open?session=…`, navigation only; ignored if the workout does not exist).
- **Local ActivityKit updates only**: no push, no App Group, no Server work. System timers are used for rest and elapsed (no per-second updates).
- **Coordinator**: one activity per workout; adopts after relaunch; ends orphans/duplicates/other-authority/old-schema activities; Save & Leave ends it, Resume restarts it; Cancel ends immediately; a durable commit shows "Workout saved" and dismisses after about 15 minutes; a swipe-away is remembered (a live activity dismissed directly); system endings (8 h limit, force quit, Live Activities off) are never treated as swipes.

## Extension, project and signing
- Target `PhysiqueOSLiveActivity`, bundle id `com.physiqueos.native.dev.WorkoutActivity`, added through the generator (new pinned ID block 0x1600+, additions-only project diff apart from my own earlier test IDs), embedded in the app, version and build equal to the app, device family 1,2, iOS 18.0, extension-API-only, **no entitlements**. App Info.plist adds `NSSupportsLiveActivities` and the `physiqueos-workout` scheme only. The release verifier is now extension-aware and passes.
- **Signing outcome**: Release archive signed with the Apple Development identity through Xcode automatic signing, no Apple re-authentication or 2FA needed. A local `xcodebuild -exportArchive` with the Xcode account fails with "No Accounts" because no Apple Account is signed into Xcode on this Mac (known; the release tool does not use it). The guarded release tool exported and uploaded using the App Store Connect API key (cloud signing), which created/used the distribution signing for the new extension App ID automatically, so **no Founder action was required**. The tool's dry run passed all checks including "embedded extensions share version/build" and codesign validation before upload.
- No browser sign-in to Apple Developer or App Store Connect was used.

## Tests actually run on exact `c299fa29`
- **Full Native unit suite: 1832 tests, 1 skipped, 1 failure** = the known pre-existing Peptide dose test (`PeptideSupportEditorViewModelTests.testSandboxChangeDose…`), unrelated. The run exited cleanly.
- **UI journeys on a clean private simulator, all passing**: rest-preference menu (Stopwatch default, Off, Countdown); Save & Leave and reopen/Resume; Workout Review confirmation; backgrounded workout; Founder shoulders cancel-alert journey; Training history journey. (Two groups, fresh install each, because the pre-existing test-ordering leak documented earlier still exists at base.)
- **Release archive** (`xcodebuild archive`, Release, generic iOS device) with the extension: ARCHIVE SUCCEEDED; the archive contains the embedded extension at 1.0 (77), min OS 18.0, with dSYMs for the app and the extension.
- Earlier on this branch (same code, before the final two small fixes): Live Activity + authority + projection suites, coordinator suite (27), two independent read-only reviews plus a delta re-review (no blockers; all substantive findings fixed, including a flaw my first suppression fix had).
- Real ActivityKit request/update succeeded in the iOS 27 simulator (os_log); the unit-test host uses an inert client so it never starts real activities.

## Visual comparison with the approved prototype
Shipping SwiftUI views were rendered in the same states as the prototype `revision-1` set (`docs/workout-live-activity-phase1/screenshots/`, 22 images). Layout, two-row rule, rest hierarchy, trailing action, superset chips and colors match. These are the real shared views with a test-only Lock Screen/Island backdrop; the simulator does not render Live Activity UI in headless screenshots, so **system-rendered appearance has not been seen**.

## Known limits / for the device pass
- **Not verified**: system-rendered Lock Screen and Dynamic Island, Complete Set while locked (whether iOS asks to unlock), locked-device privacy redaction, force-quit/relaunch behavior and swipe-away behavior on real hardware, StandBy/Always-On.
- A Complete Set tap within about 1 s of typing a value can be refused as stale (the card then refreshes; tap again). A refused tap shows no message.
- Fixed point sizes (as in the prototype) do not scale with Dynamic Type.
- Pre-existing, unrelated: the Peptide test failure; a UI test-ordering leak when the shoulders journey runs before Save & Leave in one invocation.

## Minimal physical-device acceptance checklist (Founder; none of this has been run)
Install Build 77 from TestFlight. Settings → PhysiqueOS → Live Activities ON.
1. **Start**: start a live workout, add exercises, Start logging. A Live Activity appears on the Lock Screen and in the Dynamic Island.
2. **Rest Stopwatch**: complete a set in the Logger; the rest clock counts up from 0:00. Complete the next set; it resets.
3. **Locked Complete Set**: lock the phone and tap **Complete Set**. Note whether it asks to unlock. The set completes, rest resets, the card advances. Tap twice quickly: only one set completes.
4. **Two-row rule**: final set shows Current + Up Next; the next completion shows Completed + Up Next (also for a single-set exercise).
5. **Superset**: pair two exercises (try unequal set counts): the card alternates A/B and shows Completed + Up Next only after the whole pair.
6. **Rest modes**: use the Logger rest menu: Countdown (holds at 0:00, nothing advances) and Off (no rest block).
7. **Tap to open**: tap the card or the Island; the app opens into the active workout. Background the app, force-quit and reopen: one activity, Complete Set still works.
8. **Finish / leave**: Finish shows Saving then Workout saved; Cancel and Save & Leave remove it; Resume brings it back. Swiping the activity away keeps it away.
9. **Privacy / disabled**: with locked-screen content hidden the card shows "Set details hidden" with no Complete Set; with Live Activities OFF the Logger behaves exactly as before.
Report anything that differs from `docs/workout-live-activity-phase1/screenshots/`.

## Housekeeping
- Disk stayed at or above 19.7 GiB throughout (floor 15). I removed my own build folders and the private simulator; the Build 77 archive is retained alongside Builds 75 and 76.
- Founder decisions from the earlier foundation report are locked in this build (Stopwatch default; Complete Set confirms displayed values; single-set direct transition; round-aware supersets).

## Recommended next
Founder runs the device checklist. If locked-screen Complete Set is redacted or requires unlock, or anything renders differently, report it; the fix lands on `claude/workout-live-activities-phase1-20261001` as Build 78.

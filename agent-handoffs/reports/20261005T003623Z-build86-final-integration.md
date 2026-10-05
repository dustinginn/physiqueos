# Build 86 final integration — Server workout presentation + global appearance + combined gates

- Generated (UTC): `2026-10-05T00:36:23Z`
- Agent: Claude (existing Remote Control session `c60b384d`; no duplicate conversation)
- Status: **SERVER FIX DEPLOYED / COMBINED BUILD 86 CANDIDATE READY — NOT UPLOADED — ONE FOUNDER DECISION BEFORE CONFIRMING TODAY'S MATCH**
- Governing prompt: `agent-handoffs/inbox/prompts/20261004T233500Z-build86-final-integration-server-presentation-appearance.md` at `f836f373`
- Rescue prompt: `agent-handoffs/inbox/prompts/20261005T000800Z-rescue-existing-claude-build86-session.md` at `64f92371`

No TestFlight upload. No production data mutation. Today's pending Workout Match was not touched.

## Answer first: can today's 55% match be confirmed now?

**Not yet. A product decision is needed first (the prompt's STOP condition applies).**

The deployed correction fixes unconfirmed and No-match presentation. However, the existing **confirmed-link contract** (`applyHealthKitStrengthPresentationToTrainingRecord`, `ProgressReportingService.js:3042-3075`) presents the confirmed Apple workout's own window as the session telemetry:

- start and end become the Apple workout's;
- the detail line becomes the Apple window;
- duration becomes the Apple duration;
- active calories and average heart rate come from Apple.

The new test `a confirmed link is exactly the confirmed-only projection, with confirmed telemetry intact` pins this. Confirming today's item would therefore display **1:28–1:48 PM (20 min)** instead of the Logger's **12:31–1:47 PM**. Sets and exercises stay the Logger's, and no duplicate session is created.

Founder decision. Recommended: **A**.

- **A. Logger window stays canonical (recommended).** For a confirmed Strength link, keep the Logger's start/end/duration and take only Apple energy and heart rate. Optionally note "Apple Health recorded 20 of 76 min". This is a small, bounded Server presentation change plus tests, then deploy. After that, **Use Logger session 1** is safe and correct.
- **B. Accept the current contract.** Confirm now; the session displays 1:28–1:48 / 20 min.
- **C. No match.** Apple calories stay inside the daily move total but are not attributed. The Logger presentation stays its own.

Until A, B or C is chosen, leave the review pending. Nothing is lost by waiting.

## Authorities

| Surface | Exact authority |
|---|---|
| Server deployed | `51c459c410b268f35e6388eeb17f0b6ed7eb548c` (branch `claude/server-workout-presentation-20261004`; `combined-app-platform-cutover` fast-forwarded from `3c0f4aef`) |
| Production deployment | `07714249-04c8-4d7b-9f36-09e5ead1cdee`, ACTIVE 9/9, web and worker `source_commit_hash` = `51c459c4`, fresh log envelopes `gitSha` = `51c459c4` on web and worker |
| Health | `/live` `physiqueos-51c459c4-20261004`; `/ready` `ready`, 9/9 checks |
| Native combined head | **`cec8af20a6121bb66ecca3ba9f667d91774a891c`** on `claude/build86-final-integration-20261004` |
| Native integrated commits | Build 86 `4f78fce6` (`a5646c8b`, `d43ad7cd`, `4f78fce6` on Foam pilot `b65deb00`) + appearance `3ceb9a80` → `5d727b37`, `d5359e33` → `cec8af20` |
| Build number | `1.0 (86)`; last uploaded is still `85` |

## Server correction (Part A)

- **Fix (narrowest authoritative layer).** `projectHealthKitStrengthWorkoutPresentationBySession` now resolves **confirmed attachments only**.
  - Every display consumer reads it: Workout Detail (`TrainingNavigationReadService`), Training Day / Activity linked-training context (`ProgressReportingService`) and Logged Today (`LoggedTodayService`).
  - Accounting already used confirmed-only and is unchanged, as is `CoreNavigationReadService`.
- **Behavior now:**
  - A pending candidate row, a matcher-only possible or confident match, a Founder No match (`unlinked`), or no Apple workout: the Logger keeps its own start/end/duration/energy, with no Apple source label.
  - A confirmed link: unchanged.
  - No record, link, claim, review, set or exercise is written or changed. Matching and trust policy are unchanged; reviews are still created exactly as before.
- **Trade-off.** Older sessions whose Logger timing was frozen or synthetic (for example Sep 24: 94 min Logger vs 28 min Apple) now show the Logger value until a link is confirmed. The superseded 01d1900b candidate-presentation tests were rewritten to the new rule.
- **Tests.**
  - `HealthKitWorkoutPresentationService.test.js` 39/39 passes. It covers possible_match without a link row, a pending candidate row, Founder No match/unlinked, no Apple workout, non-Strength, confirmed telemetry intact, and no mutation via deep snapshots, across Workout Detail and Activity.
  - Related suites (118 files): 34 failures, identical by test name to production base `3c0f4aef`; zero introduced.
  - Full Server unit suite: 9,999 tests, 302 failures, identical to base; zero introduced.
- **Deploy.** The established guarded sequence was used: quoted fast-forward push, a 4-value spec stamp of web/worker `PHYSIQUEOS_GIT_SHA`/`PHYSIQUEOS_BUILD_ID`, then `create-deployment --force-rebuild`. The temporary spec copies are deleted.
  - Process note: the first scripted run stopped after the push because of a `pipefail` on a display-only `diff`. Production was unchanged (no deploy-on-push, spec untouched, no deployment). The resumed run completed normally.
- **Production read-only database check: not run.** It needs the console-bundle path. Today's review was never written to, and no endpoint that resolves reviews was called.

## Global appearance integration (Part D)

- Both commits cherry-picked cleanly onto `4f78fce6` with no conflicts and no overlapping files.
- They add no new files. The canonical generator regenerates **byte-identically** (twice) and build number 86 is unchanged.
- Preserved: Watch/HealthKit Build 86 fixes, the Foam Rolling pilot, System/Dark/Mineral Light architecture, You → Settings → Appearance, WidgetKit-owned widget appearance, and Live Activity semantics. The Watch remains independent of the iPhone appearance preference (no Watch file is touched).

## Combined gates (Part E) at `cec8af20`

| Gate | Result |
|---|---|
| Watch unit | **47/47** |
| Watch UI | **6/7** — `testFinalSetFinishShowsConfirmationOnThePrimarySurfaceAndNotYetReturns` (line 89) is **pre-existing**: it failed identically at untouched base `b65deb00` earlier in this session (DEBUG fixture never activates WCSession, so Not Yet shows Retry iPhone) |
| iOS unit, full target (Watch/Training/HealthKit/Priority/Foam/appearance) | **2,003 executed, 1 failed, 1 skipped**. The only failure is `PeptideSupportEditorViewModelTests…` line 616 (clock-sensitive "Paused"), which is **pre-existing**: identical at base `b65deb00`, and also reported by Codex A on the isolated appearance lane. The 5 appearance unit tests pass. |
| Foam Rolling + appearance UI (6 tests: Dark/Mineral parity, appearance control, representative Dark and Mineral surfaces, System resolution) | **6/6** (simulator Light) |
| System resolution, simulator forced Dark | **1/1** |
| Release `generic/platform=iOS`, unsigned | **BUILD SUCCEEDED**. The product contains the app, `PhysiqueOSWatch.app` and `PhysiqueOSLiveActivity.appex` (Live Activity + Home widget), all `CFBundleVersion 86`. Watch `workout-processing`, Health usage strings and `ITSAppUsesNonExemptEncryption=false` are present. |

No failure was introduced by integration. Test side effects on tracked widget artifact PNGs were reverted; the candidate is clean at `cec8af20`.

## Carried forward from the Build 86 candidate report

- Watch HealthKit, Health status and latency behavior are unchanged from `agent-handoffs/reports/20261004T232105Z-build86-watch-healthkit-candidate.md`.
- **HealthKit:** automatic exactly-once start for phone-started workouts, reported to the phone; the trust boundary is unchanged.
- **Health status:** truthful, with HEALTH ON only while recording.
- **Complete Set:** refresh is non-blocking, and a stale Complete Set is re-sent once for the same set.
- **Logging:** a latency trace was added.
- **Deferred:** the immediate phone→Watch push.

## TestFlight workflow (later, only with explicit Founder authorization)

1. **Archive** the exact head `cec8af20` from a clean checkout, with Xcode signing as on Build 85:
   `xcodebuild archive -project ios/PhysiqueOS.xcodeproj -scheme PhysiqueOS -configuration Release -destination generic/platform=iOS -archivePath <Archives>/2026-10-0x/PhysiqueOS-Build86-cec8af20.xcarchive -allowProvisioningUpdates`
   The archive must be **copied** (not symlinked) into `~/Library/Developer/Xcode/Archives/<date>/`.
2. **Dry run:** `~/.physiqueos-release/bin/physiqueos-asc-upload upload --archive <xcarchive> --bundle-id com.physiqueos.native.dev --version 1.0 --build 86`. It must exit 0 with "WOULD UPLOAD".
3. **Upload, after the Founder authorizes:** the same command plus `--execute --confirm "UPLOAD com.physiqueos.native.dev 1.0 (86)"`.
4. **Status:** `physiqueos-asc-upload status --delivery-id <id>` until `VALID`.

No browser App Store Connect login is needed. If Xcode account authentication is required, the Founder will be asked.

## Physical-device acceptance (Part G)

1. Start a normal strength workout on iPhone (no Ready for Watch). Open the Watch app: it starts HealthKit exactly once.
2. HR, Active and Total Calories populate on Workout Metrics.
3. Health status is truthful in every state.
4. Complete Set works at arm's length and at 10–15 ft, with wrist down/up (capture `WatchLatency`/`WatchBridge` logs).
5. Phone-originated set changes appear on the Watch.
6. Pause/resume from both devices.
7. Finish produces exactly one Apple Health strength workout and no duplicate.
8. Relaunching the Watch app mid-workout creates no duplicate.
9. Foam Rolling detail, actions and setup → Recovery Support route.
10. System/Dark/Mineral Light switching and persistence across relaunch.
11. Representative light-mode forms and sheets.
12. Small and large Home widgets in both system appearances.
13. Live Activity on the Lock Screen and in the Dynamic Island.
14. The Watch remains independent of the iPhone appearance preference.
15. Server: a pending or No-match Apple workout leaves the Logger session's timing alone in Workout Detail, Training Day, Activity and Logged Today.

## Ledger (Part H)

- **Workout presentation (unconfirmed candidate replaces the Logger window):** RESOLVED — deployed and verified `51c459c4` (deployment `07714249`).
- **New FOUNDER DECISION:** confirmed-link window for a late or partial Apple workout (A/B/C above).
- **Watch HealthKit/status and Complete Set latency:** remain release-gated on the combined head `cec8af20` until physical acceptance.
- **Appearance:** integrated into `cec8af20`; release-gated until physical acceptance.
- No unrelated redesign delta was closed.

## Rescue note

The session stalled on a second `EnterWorktree` call. Per the rescue prompt, the session resumed in its current authorized worktree (`server-workout-presentation-20261004`). All Native integration used normal git (`switch -c`, `cherry-pick`) inside it. No further worktree was entered or created for the task, and the earlier throwaway comparison worktree was removed. Standing rule recorded: one RC worktree, no EnterWorktree.

## Stop

Stopped for Founder approval of:

1. the confirmed-link window decision (A/B/C) before today's match is confirmed;
2. the Build 86 archive and guarded TestFlight upload of `cec8af20`.

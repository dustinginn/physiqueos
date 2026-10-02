# Native Build 78 — completion feedback and actionable notification polish (final)

- Task id: `native-build78-completion-notification-polish-20261001`
- Prompt: `agent-handoffs/inbox/prompts/20261001T233000Z-native-build78-completion-notification-polish.md`
- Generated (UTC): 2026-10-02T01:05:00Z
- Status: **complete — Build 78 uploaded and VALID. Founder physical-device acceptance NOT done.**

## Exact authority
| Item | Value |
|---|---|
| Repository | `dustinginn/physiqueos` |
| Implementation branch | `claude/native-build78-completion-notification-polish-20261001` (pushed) |
| Base | `c299fa29a14e04a4a22ac782d4610a4562e4f6e0` (Build 77 shipping source) |
| **Final pushed SHA / archived source** | **`5911dd2a6f968c5a355ec68d3313f0e5e644d529`** (clean worktree, equal to origin) |
| Commits | `b09e6819` feature + integration · `130925ab` review fixes · `295d78f6` build bump 77→78 (metadata only) · `5911dd2a` delta-review fix |
| Integrated fix | `69cad804e2ac7d74ed98914e1601f2e7863dadc3` (reconciled, not merged; see below) |
| Version / build | 1.0 (**78**); last uploaded before this was 77 (release-tool state reverified) |
| Delivery id | **`32447de5-04be-459b-a795-2b8469cbeffd`** |
| Processing | **VALID** (build-status VALID, import VALID, on App Store Connect, uploaded 2026-10-01 17:59 PT) |
| Archive | `~/Library/Developer/Xcode/Archives/2026-10-01/PhysiqueOS-Build78.xcarchive` (retained; dSYM UUID 4811A0F5-7F4E-3FC2-8A8B-8A3AE2198E57) |
| Server | untouched; no Server change was needed (Priority contracts read-only inspected in repo source) |

## A. PR celebration lifecycle integration (69cad804 against Build 77)
69cad804 was written on Build 75 (before `TrainingSessionAuthority`), so it conflicted in 3 files and was integrated by semantics:
- A durable commit still ends the session through the authority with exactly one `.ended(.committed)` change, so the Build 77 Live Activity ("Workout saved", dismissal) is unchanged. The authority now also keeps a **read-only pending Workout Complete presentation** in the same draft store (`endCommittedSession(retainingPresentation:)`), held in `pendingCompletions`, separate from editable `drafts`: never a Live Activity subject, never resumable or listed as a saved workout, refused by `replace` (also after relaunch), unreachable by Complete Set intents.
- Only the exact just-completed session is owed; a newer completion supersedes an older owed one. Legacy durable residue without the submitted lifecycle keeps the old discard contract (no historical replay).
- Records are always re-read from the Server after view/process recreation (`load()`, and `resume(draftId:)` when the Log tab routes to the pending id).
- **Return to Log** (`acknowledgeCompletion`) is the only acknowledgement/cleanup boundary; it is idempotent and publishes no session change.
- accepted_processing / result-unknown recovery and two-screen recovery stay idempotent (only the caller whose end succeeds owns cleanup; a second end is refused).
- Log tab routing: a live workout in progress always wins (Build 77 behavior); otherwise an owed completion is routed back to. Presentations older than 12 h expire and are pruned at launch.
- The one-shot celebration cannot be claimed while hidden behind another tab **or while the app is not active** (locked / switched away).

## B/F. Haptics (one `PhysiqueOSFeedbackClient` seam; UIKit generators only in `SharedUI/PhysiqueOSFeedback.swift`)
| Event | Haptic | Fires when |
|---|---|---|
| PR celebration | `UINotificationFeedbackGenerator .success` | once per visible celebration claim (same one-shot key as confetti); never hidden, never on re-render, never for replayed/historical records. Reduce Motion suppresses confetti only; the haptic follows system haptic settings. |
| In-app Priority completion | soft impact (subtle success) | after canonical acknowledgement on Home inline check and Priority Detail Mark Complete (sandbox + production) |
| In-app Priority Skip | light impact (lighter) | after canonical acknowledgement of Mark Skipped |
| Notification Complete/Skip | same events | only if the action ran while the app was active (a banner acted on in-app); background actions produce no haptic |
- Not added: Workout set completion (deferred until Founder real-workout feedback), navigation, charts, read-only screens, HealthKit refresh. A source-scan test enforces the call-site set.

## C/D/E. Notification capability model
`PriorityOccurrenceCapabilities.resolve(PriorityNotificationAction)` — one Native resolver derived only from the Server-owned notification contract (no Priority names): `plainCompleteAllowed`, `skipAllowed`, `requiresDetail`, `specializedCompletion`.
| Server contract | Capabilities | Category / actions |
|---|---|---|
| `direct_completion_allowed`, `priority_detail`, valid `priority.complete.v1`, no dose/protocol | plain + skip | **`priority.simpleCompletion`: Complete (check-circle, first) · Skip · Snooze 1 hour** |
| `specialized_workflow_required` + completion command (peptide/supplement/recovery Support) | planned-context completion, no skip | `priority.specializedActionable`: Complete (Server-planned dose/protocol) · Snooze — unchanged |
| any payload carrying dose/protocol | planned-context (never plain) | `specializedActionable` |
| Morning Check-In / weight, Photos, DEXA, specialized without command, open-only, unknown command | none (opens proper flow) | `specializedWorkflow` / `openOnly`: no actions |
- **Home-vs-Detail risk resolved:** current Home inline completion already sends the occurrence's Server `completionContext` (planned dose), identical to Detail's default Mark Complete and the peptide notification Complete. Only Detail offers "Took a different amount". No plain completion reaches a dose-aware Priority from any surface.
- **Skip from notifications** submits the same `priority.skip.v1` as Mark Skipped with the identity/version the Server's `prioritySkipCommand` uses (same as the completion command). Background action, `.authenticationRequired`, Apple's completion handler retained until the write + Home/notification reconciliation finish. Duplicate callbacks are consumed once; a stale version re-reads Home and retries once only if the exact occurrence is unchanged; already-completed is a no-op that withdraws the reminder; past/future/unsupported/network failures change nothing and remain retryable; refused for any category other than `simpleCompletion` or any payload with dose/protocol or no command contract. Success withdraws the occurrence's pending/delivered/snoozed reminders and re-reads Home so Home and Priority Detail show the canonical skipped state.
- **Migration:** `priority.directCompletion` (Complete + Snooze) stays registered so already-delivered Build 77 notifications keep working; pending requests are re-added with the new category on the next Home sync (same identifiers); snoozed copies keep their category and command.
- **Skip eligibility is a Native mapping, not a Server capability.** The Server still arbitrates at write time. Known approximations: Recovery Support (e.g. Foam Rolling) is skippable in Priority Detail but not from the notification (contract cannot distinguish it from supplements); an orphaned Support-type reminder or a past-day action would show Skip and be refused (no change). Future Server-owned migration: publish a `skipCommand` in `notificationAction`. No Server change was made.

## G. iOS notification UX (platform facts, implemented accordingly)
- Third-party apps cannot place a checkbox or any control on the collapsed banner/Lock Screen row; Apple's own Reminders UI is not available to apps. **No fake checkbox UI was built.**
- Custom actions appear only when the notification is expanded: long-press / pull down on a banner, or swipe left → View (or long-press) on the Lock Screen / Notification Center. On Apple Watch they appear in the scrolled notification.
- Closest legitimate Reminders-style affordance, implemented: **Complete is the first action with a `checkmark.circle` SF Symbol** (iOS 15+ action icons), then Skip (`forward.end`), then Snooze (`clock`).
- Complete/Skip are background actions (the app does not open). `.authenticationRequired`: on a locked phone iOS asks for Face ID/passcode first (the canonical write needs the when-unlocked refresh credential). Tapping the body still opens the exact destination (Morning Check-In, Priority Detail, ...).
- iOS dismisses the delivered notification when an action is tapped; on a refused/failed write the occurrence stays open in the app (no fake state). Foreground: banners still show while in-app; acting on one runs the same handler and may play the in-app haptic.

## Tests / review (all on exact candidate code)
- **Full Native unit suite on the final code (= 5911dd2a, build 78): 1862 tests, 1 skipped, 1 failure** = the known pre-existing `PeptideSupportEditorViewModelTests.testSandboxChangeDoseKeepsHistoryAndPauseResumeWorkAgainstTheFixture` (also fails at Build 77), unrelated. (Earlier full runs on b09e6819 and 295d78f6: same single known failure.)
- New/changed coverage (+30 tests): relaunch from persisted store with multiple PRs; no-PR; accepted_processing→durable (existing, updated); view recreation; routed resume; legacy residue no replay; acknowledge-only cleanup; hidden/backgrounded cannot consume; haptic exactly once; Reduce Motion; unknown PR type fail-soft (existing lossy-decoder tests); committed end emits one `.ended(.committed)`; no resurrection; supersede; prune at launch; routing precedence. Notifications: resolver matrix; registered categories/options/order; simple request category + snooze copy; Skip once/duplicate; refused categories/old payload/dose payload; already-completed; stale-version retry; network failure retryable; Complete feedback once after success; background-execution retention for Skip; Detail complete/skip haptics; refused/failed → no haptic; haptic call-site scan.
- **Build 77 Live Activity regression:** TrainingSessionAuthority, Live projection, contract, coordinator, Complete Set intent, view, rest preference (Stopwatch/Countdown/Off) suites — all passing (564/564 in the combined focused run including Training Logger / notification / FounderServerAPI suites). Live Activity visuals untouched; extension built and embedded at 1.0 (78).
- **UI journeys (fresh private simulator, final build):** Save & Leave/Resume, rest-preference menu, backgrounded workout, Workout Review → confirmation → Workout logged → Return to Log, and new **Workout Complete survives Back + tab switch until Return to Log** — 5/5 passed. Not run: the Founder shoulders cancel-alert and history journeys (unchanged areas; note the pre-existing ordering leak: run that journey separately). No notification UI test exists (iOS notification actions are not drivable from XCUITest); covered by delegate-boundary unit tests.
- **Release:** `verify_release_configuration.py` passed (1.0 (78), extension parity); Release archive succeeded; guarded tool dry run passed every check (codesign, dSYM, extension version parity, build > 77).
- **Independent reviews:** fresh read-only review of c299fa29..b09e6819 — no P0; P1 (owed completion could out-route a live workout) and P2s (background claim, prune only on Logger open, Skip doc overstated) all fixed in `130925ab`. Delta re-review — fixes verified, no P0/P1; P2 (older owed completion could resurface) fixed in `5911dd2a`; P3 doc fixed; P3 UI ordering noted above.

## Archive / signing / upload
Archived with Xcode (Release, generic iOS, automatic signing, Apple Development identity); exported/uploaded by the guarded release tool with the App Store Connect API key (cloud distribution signing). No Apple re-authentication or 2FA was needed; no browser login to Apple Developer or App Store Connect.

## Founder acceptance checklist (none run yet)
PR
1. Do a natural future workout that produces a PR. Finish: Workout Complete shows the record details, confetti and a success haptic — once.
2. Finish a workout and immediately switch to Home (or lock the phone) before records appear; come back to Log: Workout Complete is there with records; the celebration plays once when visible.
3. Return to Log; Log behaves normally afterwards and the old celebration never replays.
Priority
4. Long-press a simple Priority notification (e.g. a plain reminder): Complete (check-circle) first, then Skip, Snooze. Complete it from the Lock Screen (Face ID prompt expected); Home and Priority Detail show it complete.
5. Skip another simple Priority from its notification; Home/Detail show Skipped.
6. Morning Check-In / weight notification: no actions; tapping opens Morning Check-In.
7. Peptide notification: Complete + Snooze only (no Skip); completion records the planned dose; Detail still offers "Took a different amount".
8. In-app: completing a Priority feels like a subtle success tap; skipping is lighter.
Also usable for the outstanding Build 77 Live Activity checklist (unchanged in Build 78).

## Backlog
`agent-handoffs/backlog/PHYSIQUEOS_PRODUCT_BACKLOG.md` updated on main (commit `0d96e432`): PR celebration, notification Skip/Complete and haptics marked **shipped in Build 78, pending physical acceptance**; set-completion haptic deferred; Recovery Support notification Skip noted as Server-contract follow-up.

## Known limitations
- Leaving Workout Complete by system Back keeps it owed (shown when the Logger next opens, up to 12 h) until Return to Log — the reviewed acknowledgement boundary.
- Notification Skip eligibility is Native-mapped (see above); Foam Rolling-type Support Skip stays in Priority Detail.
- A refused background action shows no message (iOS gives no surface); the occurrence stays open in-app.
- Pre-existing: Peptide sandbox test failure; UI test-ordering leak after the shoulders journey.

## Housekeeping
Disk: 25 GiB free at start; never below 17 GiB (floor 15; preferred 20 not met during the archive because of other sessions; nothing removed except this lane's own DerivedData/result bundles/private simulator data). Build 78 archive retained beside Builds 75–77. No local-only work remains; no private Founder data was created.

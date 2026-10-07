# Build 91: Operating Plan + Watch implementation candidate

**Status: the Build 91 Operating Plan + Watch implementation is ready for tomorrow's feedback and later integration.**

The Founder's physical workout feedback is still pending. This candidate is isolated: it is not integrated, not bumped, not archived, not uploaded, and makes no Server or production change.

## Task and authority

| Item | Value |
|---|---|
| Task id | `claude-build91-op-watch-implementation-20261007` |
| Prompt | `agent-handoffs/inbox/prompts/20261007T053100Z-claude-build91-op-watch-implementation.md` @ `ea2b7f23` |
| Base | Build 90 Native `32baf1d5` |
| Design authority | `edd0f62f` (boards); report main `dee282f9` |
| **Candidate** | **`b944ad1e5503ffa6d924e733abb2f3ba68e90ce2`** on `claude/native-build91-op-watch-implementation-20261007` (pushed) |
| Production Server | `1b6687ff` / deployment `cbe6be96` ACTIVE (read-only check). Unchanged |

Commits are separable, so tomorrow's Watch/Logger feedback can land without reopening the Operating Plan:

| Commit | Contents |
|---|---|
| `0bc2af7c` | **Watch only**: Mineral footer + ready cue, plus the additive `preparedAt` contract field |
| `76bd0097` | **Operating Plan only**: OP-A..D, Next DEXA Scan, Scheduled Evidence |
| `9861b0a2` | Operating Plan: authority guard follows the Next DEXA Scan contract |
| `bc34d790` | Watch test: orphan reachability is size-aware (42 mm overflows, as in Build 90) |
| `4eb1b07a` | Operating Plan test: You → Operating Plan asserts the new title |
| `b944ad1e` | Proof package (`agent-handoffs/artifacts/build91-op-watch-implementation-20261007/` on the branch) |

## Founder decisions applied (D1–D8)

| # | Decision | Applied |
|---|---|---|
| D1 | OP-A..D boards approved | Implemented as designed |
| D2 | Native-only Next DEXA Scan + direct DEXA editor anchor | Implemented |
| D3 | Scheduled Evidence card on Coaching Updates | Implemented |
| D4 | Keep the Priority canvas tokens for OP; no app-wide token pass | `OperatingPlanColor` maps to `priority*` only |
| D5 | Watch footer candidate, isolated and adjustable | Implemented in `WatchPanelPage` only |
| D6 | `.notification` once per new prepared lifecycle, 10-minute freshness | Implemented |
| D7 | Energy phase-history Server projection deferred | Not implemented; no fabricated history |
| D8 | Widget + P2/P3 tail deferred to Build 92+ | Not touched |

## Operating Plan implementation

**Kit (`OperatingPlanComponents.swift`):** the locked family grammar, on top of the legacy primitives. The legacy primitives stay for their non-OP callers (Sandbox Goals editors, Founder device connection).

- **Chrome:** a flat "‹ Back title" crumb and a hairline; the in-page header is the only title.
- **Building blocks:** header, identity hero field, group titles, line fields, paper/field/amber surfaces, metric tiles.
- **Buttons:** 50 pt, or 44 pt for text buttons.
- **States:** notes, and a failure view with **Try Again**.
- **Choice pills:** a 44 pt minimum.

**Crumbs:** the pushing page records its title for the next page (`OperatingPlanNavigationContext`, Native-only). This means no `AppDestination` or Server contract change. Priority Detail names itself in the crumb, so DEXA shows "‹ DEXA tomorrow".

**OP-A**
- **Root:** one title, the "‹ You" crumb, domain cards in Server order with Energy as the field, and Add Supplement kept.
- **Root load failure:** shows "Nothing was changed" plus Try Again.
- **Coaching Updates detail:**
  - The hero field and the Strategy Detail lines.
  - The **Scheduled Evidence** card (Next DEXA scan → Next DEXA Scan; Progress Photos cadence + next date), read from the same Coaching Updates record.
  - The navy Edit Coaching Updates button.

**OP-B**
- **Energy:** read-only. There is no editor, and phase history comes from the read model only (D7).
- **Nutrition / Training:** the hero, two metric tiles and line fields.
- **Editors** (Nutrition, Training, Coaching Updates):
  - "‹ Cancel" crumb and one Save.
  - Unchanged option sets.
  - `expectedCurrentVersionId` is still sent.
  - Stale saves fail closed with "This strategy was not saved. Refresh before retrying."
- **Training builder production state:** product copy replaces "legacy builder".

**OP-C**
- **Peptides domain:** paused/active pills, two-column dose/schedule facts, and full-size **Manage / Resume** (the old controls were 12 pt text).
- **Execution page** (Build 70 model unchanged):
  - The tappable Dose/Days/Time/Notes card rows open the same sheets.
  - The inline Reminder switch.
  - Pause (destructive outline, same confirmation and Today/Tomorrow start) and Resume (navy).
  - Advanced · dose plan, the dose-plan editor and dose history.
- **Recovery support:** detail + edit.
- **Supplement support/edit:** Supplement Pause/Restore sits on its own row.

**OP-D**
- **Tracking:** the routine card, Next due, and evidence-owned Completion (no manual check-off).
- **Tracking support editor.**

## DEXA dead-end resolution

**Before:** Priority "View DEXA Appointment" → `.operatingPlanDexaAppointment` → in Founder Production, a static "Manage … in Coaching Updates" text with no action.

**Now (`OperatingPlanDexaAppointmentView`), for both authorities:**
1. Read the existing `operating-plan` landing.
2. `NextDexaScanResolver` takes the single Coaching Updates strategy id the Server names there. Zero ids → "Coaching Updates isn't active". More than one distinct id → refused, never guessed.
3. Read the existing Coaching Updates detail.
4. Render read-only from `editor.dexa` + `dexaEventBriefingEnabled`.

**States:**
- **Scheduled:** the appointment field (date, time, Pacific Time, relative day), reminders, upload reminder, preparation note and DEXA Event briefing.
- **Not scheduled:** a note, plus a best-effort Last scan row linking to Evidence → DEXA.
- **No active Coaching Updates.**
- **Load failed:** with Try Again.

**Actions:**
- **Edit DEXA Schedule / Schedule DEXA Scan** opens the existing atomic Coaching Updates editor, scrolled to and marking the DEXA section ("From Next DEXA Scan").
- Save, `expectedCurrentVersionId` / stale handling, and the reminder, upload, preparation-note and DEXA Event briefing semantics are all unchanged.
- **Open Coaching Updates** is the secondary action.

**What did not change:** no Server change, no new command, no second write boundary. The Sandbox standalone DEXA editor is retired in favour of the same Coaching Updates path.

## Watch footer implementation (D5)

- **Change:** `WatchPanelPage` lays out **without a ScrollView when the page fits** (`ViewThatFits` over the unchanged `WatchPanelActionLayout`).
- It paints its own background full-bleed.
- Only an overflowing page (accessibility text) scrolls, and that ScrollView hides only its own bottom scroll edge effect (`scrollEdgeEffectHidden`, watchOS 26+). No other watchOS affordance is touched.
- Geometry, the 18 pt gap, true-centered actions and Dark are unchanged.
- **Affected screens:** Start Workout, Idle/Refresh, Phone unavailable and the Apple Health orphan prompt.
- **42 mm orphan prompt:** at 42 mm the orphan prompt is genuinely taller than the screen (as in Build 90, where Discard ran to the bottom edge). It therefore uses the scrolling fallback, with the bottom edge effect hidden; both actions stay reachable.
- **Still to verify on device:** the simulator (watchOS 27.0) never reproduced the bar, so the root cause is inferred, not proven.

## Ready-haptic contract (D6)

**When it plays:** `WKInterfaceDevice.play(.notification)` once, when a **new** preparation lifecycle (`sessionId + preparedAt`) first reaches all of:
- phase `.prepared`;
- the exact Start-enabled predicate (`isStartWorkoutEnabled` = no pending mutation, phone reachable). The button now uses the same predicate.
- app active.

**How it is evaluated:** event-driven only, from `apply`, acknowledgement, refresh, display activation and reachability changes. It is never called from a view body.

**Safeguards:**
- The last-cued key is persisted, so replays, reconnects, cold launches, redraws and reachability churn never repeat the cue.
- A 10-minute freshness window applies, with 60 s of phone-ahead clock skew tolerated.
- No cue without `preparedAt` (an older phone), for Use without Watch, in fixtures, or on reachability alone.

**Contract:** `WatchWorkoutProjection.preparedAt` is optional and additive. It is set from `draft.readyForWatchAt` on prepared projections only, decodes as nil when absent, and leaves `schemaVersion` unchanged.

**Start authority:** `watchStartedAt` stays the start authority, and Start keeps its own `.success`.

**Build 90 handoff fixes preserved:**
- the Ready/start-clearing guard;
- appearance-slot forwarding;
- fractional `startedAt` parsing;
- Use without Watch persistence.

## Files changed

**Watch commit (`0bc2af7c`)**
- `Contracts/WatchWorkoutContracts.swift` (+`preparedAt`)
- `Networking/WatchWorkoutProjectionMapper.swift`
- `PhysiqueOSWatch/WatchWorkoutStore.swift`
- `PhysiqueOSWatch/WatchWorkoutViews.swift`
- Tests: `PhysiqueOSWatchTests/WatchWorkoutFinishStateTests.swift`, `PhysiqueOSWatchUITests/WatchWorkoutNavigationUITests.swift`, `PhysiqueOSTests/TrainingSessionAuthorityTests.swift`

**Operating Plan commit (`76bd0097`)**
- 15 files in `Presentation/OperatingPlan/` (every page, sheet and editor, plus the kit; `PeptideSupportEditorViewModel` and `ProtocolBuilderShell` unchanged)
- `Presentation/Home/PriorityDetailView.swift` (crumb title only)
- `Presentation/Root/AppDestinationRouterView.swift` (OP crumb titles + editor anchor)
- `Presentation/Root/RootTabView.swift` (DEBUG-only `op:` review route)
- Tests: `PhysiqueOSTests/OperatingPlanReadModelTests.swift`, `PhysiqueOSTests/PeptideScreenPresentationTests.swift`, `PhysiqueOSTests/FounderServerAPITests.swift`, `PhysiqueOSUITests/TrainingAcceptanceUITests.swift`, `PhysiqueOSUITests/FoamRollingPriorityDetailUITests.swift`

No `project.pbxproj` change: new tests are appended to existing files.

## Tests and gates

| Gate | Result |
|---|---|
| **Full PhysiqueOSTests** | **2176 executed, 0 failures, 1 designed skip.** Build 90 was 2159. |
| Focused Operating Plan / Peptides / Priority / Strategy APIs / Session authority | 279 / 0 |
| `Build91OperatingPlanTests` (new) | 15 / 0. Covers the resolver (found / none / ambiguous / Sandbox), Next DEXA presentation in all states, no writes from Next DEXA Scan, editor anchor read once, crumbs, one-title chrome on every page, Try Again, 44 pt pills / 50 pt buttons, save parity, Energy read-only, copy |
| Phone `preparedAt` (new, `TrainingSessionAuthorityTests`) | 2 / 0 |
| **OperatingPlanRedesignUITests (new)** | **5 / 5.** Covers the root (one title + "You" crumb), Landing → Peptides → Execution crumbs with 44 pt Manage/Resume, Next DEXA Scan → editor at DEXA → Cancel back, Coaching Updates Scheduled Evidence → Next DEXA Scan, and Tracking (no manual completion) |
| **Full iPhone UI suite** | Every class ran; details below |
| **Watch unit** | **70 / 0 at 49 mm and at 42 mm** (59 existing + 11 new ready-cue / `preparedAt` tests) |
| **Watch UI, full** | **9 / 10 at 49 mm and at 42 mm.** The only failure is the pre-existing `testFinalSetFinish…` (line 89), identical on Builds 89 and 90 (fixture has no WCSession) |
| Watch panel footer UI (new) | 3 / 3 at 49 mm and 42 mm. Covers fits-without-ScrollView in Mineral/Dark, orphan actions reachable, and accessibility-text overflow still scrolling |
| Watch panel geometry | Build 90 vs candidate: **0 differing pixels** below the clock across 16 states (49/42 mm × Mineral/Dark × Start / Idle / Phone unavailable / Orphan) |
| **Release compile** | Generic iOS Release of app + Watch + Live Activity: **BUILD SUCCEEDED** |
| **Seam scan** (Release binaries) | **0** in app, Watch and Live Activity. The scan detects `-watchFixture` in the Debug binary, so it is known to work |
| `git diff --check` | Clean |
| Generator | `generate_project.py` reproduces `project.pbxproj` byte-for-byte; no project change |

**Full iPhone UI suite, failure detail:**

1. **`FoamRollingPriorityDetailUITests.testYouAndSettingsNavigationRowsActivateAcrossTheWholeRow`.** A **real test update**: it looked for the legacy literal "OPERATING PLAN" eyebrow. It now asserts "Your Operating Plan" (commit `4eb1b07a`) and passes.
2. **Two load flakes**, both passing on rerun:
   - `EvidenceTrainingNutritionWeightUITests.testWeightScope…`;
   - `TrainingAcceptanceUITests.testBuild89TrainingDetailReviewDark`.
   Machine load peaked near 640 during the run.
3. **`EnergyRecoveryRedesignUITests.testRecoveryBackLabelsFollowTheRealParentAndAllNightsPages`** fails at line 1251 (the Sleep Trends wait).
   - It **reproduced identically on the Build 90 base** `32baf1d5` (same line, same simulator).
   - It is pre-existing and depends on scroll position: XCUI auto-scrolls "See trends ›" under the Evidence top inset, so the tap lands on the bar.
   - No Evidence code changed in this candidate. Recorded for the Evidence owner (Claude A).

## Physical-device items for tomorrow

1. **Watch Mineral bottom bar:**
   - Does it still show on Start, Idle or the orphan prompt with this candidate?
   - What is the Watch's watchOS version?
   - Did the bar appear on the swipe-right Controls page in Build 90? If it did not, that supports the ScrollView edge-effect cause.
2. **Ready haptic:**
   - Exactly one tap when Start Workout appears after Ready on Watch.
   - None on reopening, reconnecting or Use without Watch.
   - Start still plays its `.success`, and the phone modal dismisses only on Watch Start.
3. **Operating Plan on device:**
   - Priority "View DEXA Appointment" → Next DEXA Scan with your real Coaching Updates DEXA schedule → Edit DEXA Schedule opens at DEXA → Save.
   - Peptides Manage/Resume.
   - Crumbs.
4. Any further Watch/Logger feedback goes on top of `0bc2af7c` without touching `76bd0097`.

## Expected overlap with Claude A (Evidence Option A)

**This candidate does not touch:**
- Evidence files or EvidenceKit;
- `PhysiqueOSTheme` tokens;
- Evidence tests.

**Likely textual overlaps at integration** (all mechanical):
- `RootTabView.swift`: the DEBUG `op:` route sits beside `evidenceReviewPath`.
- `AppDestinationRouterView.swift`: OP cases only.
- `TrainingAcceptanceUITests.swift`: a class appended at the end of the file.

There is no semantic overlap. If Claude A later moves the Priority/OP canvas tokens, D4 keeps the Operating Plan on `priority*`.

## Confirmation

- No final Build 91 integration, no build bump, no archive, no TestFlight upload.
- No Server change and no production mutation.
- `latest.json` is unchanged (it still points to Build 90).

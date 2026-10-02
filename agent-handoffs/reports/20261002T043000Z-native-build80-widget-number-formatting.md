# Native Build 80 — Home Screen widget number formatting polish (final)

- Task id: `native-build80-widget-number-formatting-20261002`
- Prompt: `agent-handoffs/inbox/prompts/20261002T043000Z-native-build80-widget-number-formatting.md`
- Generated (UTC): 2026-10-02T04:30:00Z
- Agent: Claude
- Status: **complete — Build 80 uploaded and VALID. Founder acceptance of the formatting is pending.**

## Exact authority
| Item | Value |
|---|---|
| Repository | `dustinginn/physiqueos` |
| Base (Build 79 shipping, VALID) | `a75f93df1a84c33bbe6e9cec6d648a11ec53031d` |
| Branch | `claude/native-build80-widget-number-formatting-20261002` (pushed) |
| Commits | `745fb22d` formatting patch + regenerated renders · `1783691d` bump 79→80 (metadata only) |
| **Archived source / final SHA** | **`1783691debeea46d3e4e6b2f6e470abe032c4c74`**, archived from a clean detached checkout of exactly this SHA |
| Version / build | **1.0 (80)** for the app and the extension; Build 79 was reverified as the latest upload (release state 79, no later receipt or report) |
| **Delivery id** | **`39ae9ddd-271e-438c-80c2-f24137637e2f`** |
| **Processing** | **VALID**: build-status VALID, import VALID, on App Store Connect, uploaded 2026-10-01 21:23:47 PT. Re-confirmed with a separate read-only `status` call. |
| Archive | `~/Library/Developer/Xcode/Archives/2026-10-01/PhysiqueOS-Build80.xcarchive` (retained). dSYM UUIDs: app `42C8A09C-C461-3055-8C07-23ABE32F9DD7`, extension `507C798C-A18E-372C-A0A6-02F84471E977` |
| Server / production data | untouched (Native-only display change) |
| Backlog | updated on main `a8ef512a5f5f467750273921167613fb46fd69ab` |

## Trigger
This was a Build 79 physical acceptance finding. The Home Screen widget works on the Founder's device, but it showed decimal fractions: Nutrition 2463.3 cal, P 182.2 C 166.7 F 110.1, Active 890.1 cal.

## Change (display only)
**Audit:** every numeric value in the Home widget went through one private `number(_:)` helper in `HomeLoggedTodayWidgetView`. That helper printed whole values as integers and everything else with one decimal (`%.1f`). Weight was the snapshot's `displayValue` string, rendered unchanged.

**Central formatter:** `HomeWidgetValueFormatter` lives in the shared widget view file, which compiles into the app, the extension and the tests, so there are no generator or project changes. It is now the only path for:
- the small square's Nutrition calories, P/C/F, Active, and Weight;
- the large Logged Today alternate's Nutrition calories/P/C/F, Activity "… active cal (so far)", and Weight.

All states (full, no-weight, active-workout/Resume, stale/offline, waiting-for-today, privacy-redacted) render through these same two family views. No other family exists; the widget supports `systemSmall` and `systemLarge` only.

**Formatting rules:**

| Value | Rule | Example |
|---|---|---|
| Calories eaten | nearest whole, half away from zero, locale grouping | 2463.3 → **2,463** cal |
| Protein / carbs / fat | nearest whole gram | 182.2 → **182**, 166.7 → **167**, 110.1 → **110** |
| Active calories | nearest whole, locale grouping | 890.1 → **890** cal |
| Weight | canonical display string unchanged (one decimal) | 176.1 lb → **176.1 lb** |
| Missing / non-finite | stays "—" or the existing missing copy; never 0 | — |
| Values that round to zero | "0", never "-0" | -0.4 → 0 |

**What did not change:**
- canonical precision: the snapshot still stores 2463.3 and so on, with no Server or HealthKit change;
- Nutrition, Activity, Evidence, History and coaching calculations;
- the Live Activity's load/reps formatting;
- all other Native UI.

The old helper was removed. A source test asserts the widget view has no ad-hoc `String(format:)` and no direct Weight `displayValue` rendering, so formatting cannot drift.

## Tests
- **New formatter tests** (HomeWidgetTests, which is now 22 tests): rounding of x.0, x.1, x.49, x.5, x.9, 0.5 and 999.5; the Founder example; thousands grouping in en_US and de_DE; zero; signed zero; nil; NaN; Weight one-decimal strings preserved; the snapshot and shared file keep full precision.
- **Focused regression:** HomeWidgetTests, TrainingSessionAuthority, TrainingSessionLiveProjection, WorkoutLiveActivity (Contract, Coordinator, Intent, View) and TrainingRestPreference: **171/171 passed**. This compiled the app and the shared widget/Live Activity extension.
- **Full Native unit suite on exact `1783691d`: 1895 tests, 1 skipped, 1 failure.** The failure is the known pre-existing `PeptideSupportEditorViewModelTests.testSandboxChangeDoseKeepsHistoryAndPauseResumeWorkAgainstTheFixture`. **No new failures.**
- **Generator:** deterministic, the same `project.pbxproj` sha256 `4dd23cd9ab4eb90c89dd4699f705f63ec25e7fbc45dc93665031d0b63a07bc4d` on two runs.
- **Release verifier:** `release configuration verified: version 1.0 (80), AppIcon, HealthKit app-only capability, matching App Group, Workout Live Activity + Home widget extension`.

## Shipping renders
All 14 shipping PNGs were regenerated from the patched code: 7 `systemSmall` plus 7 `systemLarge` under `large/`, at `agent-handoffs/artifacts/home-screen-widget-v1/` (commit `745fb22d`).
- The sample data now mirrors the Founder's physical example: 2463.3, P 182.2, C 166.7, F 110.1, 890.1 active, 176.1 lb.
- The renders show **2,463 cal · P 182 C 167 F 110 · 890 cal · 176.1 lb**.
- Visually confirmed:
  - no Nutrition, macro or Activity decimal;
  - Weight keeps its decimal;
  - grouped values fit without truncation or overflow in both families;
  - Start Logger, Resume Workout, refresh, the offline badge and the privacy redaction are unchanged;
  - layouts are otherwise identical.
- "Waiting for today" renders are unchanged, because that state hides values.

## Archive / signing
- `xcodebuild archive`: Release, `generic/platform=iOS`, automatic signing with the established Xcode account. ARCHIVE SUCCEEDED, no Founder action needed, and the source tree was clean afterwards.
- **App** `com.physiqueos.native.dev` 1.0 (80):
  - entitlements: App Group `group.com.physiqueos.native.dev.shared`, `healthkit` true, `healthkit.background-delivery` true;
  - the embedded profile carries the App Group;
  - Info.plist keeps both Health usage descriptions, `NSSupportsLiveActivities` and `ITSAppUsesNonExemptEncryption`.
- **Extension** `com.physiqueos.native.dev.WorkoutActivity` 1.0 (80):
  - entitlements: the same App Group only, **no HealthKit**;
  - the embedded profile carries the App Group.
- **Coexistence:** a single `com.apple.widgetkit-extension` contains both `WorkoutLiveActivityWidget` (`WorkoutActivityAttributes`) and the Home widget (`com.physiqueos.home.logged-today`).
- `codesign --verify --deep --strict` is valid for both, and dSYMs are present for both.
- **Guarded tool:**
  - the dry run passed every check (identity, 1.0 (80), extension parity, codesign, dSYM UUID match, 80 > 79);
  - the upload ran with `--execute --confirm "UPLOAD com.physiqueos.native.dev 1.0 (80)"`, and the export succeeded;
  - result: **VALID**;
  - release state is now 80, so the next build is 81.
- No browser login and no credential change.

## Founder acceptance (minimal)
After installing Build 80 from TestFlight, check the small square and the large Logged Today widget. Both should show:
- whole Nutrition calories with grouping (e.g. 2,463 cal);
- whole P/C/F grams;
- whole active calories;
- Weight with one decimal (e.g. 176.1 lb).

Everything else is unchanged from Build 79.

## Backlog
`agent-handoffs/backlog/PHYSIQUEOS_PRODUCT_BACKLOG.md` on main (`a8ef512a`):
- a new BUILD 80 section: the trigger, what shipped, and that acceptance is pending;
- the Build 79 physical finding (widget verified working on device; formatting request) is recorded;
- the Home widget roadmap status now reads "Build 79 verified working; formatting polished in Build 80; remaining acceptance pending";
- no other Build 79 items were reopened or changed.

## Disk / housekeeping
Disk stayed at 25 GiB or more free (floor 15). Only this lane's DerivedData, result bundles, private simulator and temporary worktrees are removed after publication. The Build 75–80 archives are retained.

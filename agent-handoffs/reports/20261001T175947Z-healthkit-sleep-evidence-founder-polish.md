# HealthKit Sleep Evidence — Founder polish (Build 76)

Task id: healthkit-sleep-evidence-founder-polish-20261001

## Authority
- Base: 77681cd7 (Build 75). Candidate / Build 76 source: fcd26309 on branch `claude/sleep-evidence-polish-20261001`.
- Native-only change. Server b81c784e contract unchanged. No Server, Goals logic, Briefings, V3, Live Activities, strategic Sleep or Oct 2 canary code touched or triggered.
- TestFlight: Build 76 uploaded through Xcode archive + the guarded release tool (API key; no browser login). Delivery c282454b-ac34-4ebc-acd9-daebd0ae9dc9, processing state VALID. Last uploaded before this was 75, so 76 was used.

## A. Goal time blocking
- Goal selector (the existing Evidence `TrainingScopeSelectorView`) sits at the top of Recovery landing and Sleep Trends: Build Lean Mass / Visible Abs / All Sleep. One selection (`RecoverySleepScopeStore`) applies to landing, Trends, averages, charts and the night-history sheet.
- Goal dates are not hard-coded. Production reads the canonical Goal window from the Server photos context (`context`/`limit=1`, start/end dates); Sandbox uses the canonical chronology fixture. Range = Goal window intersected with Sleep Evidence start (2026-07-06) and today. Empty intersections make no request and show a calm "no Sleep Evidence in this Goal's dates" state.
- Every request is bounded to the scope range (trend selectors count back from the scope end and clamp to its start; a Goal landing is derived from one bounded trends read, so no night outside the range is requested or shown). All Sleep keeps the existing behavior.
- Fresh review found stale-scope races and a lost-dates case; fixed: superseded or cancelled reads cannot overwrite a newer scope, the shared Goal-dates load is awaited by every caller, display is keyed to the scope range (no one-frame leak). A real bug was also fixed before review: the first Goal-dates load reset the selection to All.

## B. Horizontal movement — root cause
- No content overflow exists (contentSize.width equals viewport at 375/390/402/430/440 pt, default and large Dynamic Type; now a unit test).
- Root cause: iOS 26 adds `interactiveContentPopGestureRecognizer`, a full-content-area back gesture enabled by default. A rightward drag on a card or chart starts an interactive pop and slides the whole page under the finger.
- Fix: scoped, ref-counted suppression of only that recognizer while a Recovery/Sleep page is visible (restored on leave). The leading-edge swipe-back recognizer and the back button are untouched; charts keep tap/selection. No blanket navigation-gesture disabling.
- Honest caveat: synthetic XCUI input could not visually reproduce the slide; the cause is established from live recognizer state plus the OS behavior, and verified at the recognizer level (unit test with real UINavigationController) and by an edge-swipe-back UI journey. Device confirmation is in the Founder checklist.

## C. Shared date-axis policy
- One `SleepAxisPolicy` plan per screen drives Total Sleep, Awake/Continuity, Longest Continuous Sleep, Stage Mix and Sleep Window rows. Explicit ticks, no automatic labels, no rotation: 2W every 3 days, 1M weekly, 3M every 2 weeks, 6M monthly, All monthly with the year on the first label and on January when crossing years. Edge margin keeps end labels from clipping. All data points are kept and tap selection is exact; weekly Server aggregation is unchanged.

## D. Time-zone presentation
- Historical Sleep Window bars are drawn at normal prominence; per-row circles and zone labels removed; approximate times carry a subtle ≈. One note: "Historical clock times are approximate. Sleep duration is exact. Historical time zones were not preserved, so sleep and wake times may shift during travel." Technical wording removed from primary surfaces; Source & Data provenance kept (reworded). Server-marked uncertain nights are still excluded from formal consistency. No time zone or travel inference added.

## Tests / review / build
- New RecoverySleepPolishTests (25) + existing RecoverySleepReadModelTests (23): green. Covers Goal ranges incl. boundary intersections, empty, completed Visible Abs, active Build Lean Mass, All; request bounds via stub transport; no out-of-range nights; stale-scope races; axis policy for 2W/1M/3M/6M/All including 87-night density and year crossing; timezone presentation and uncertain-night exclusion; prospective certain nights; real-UIKit pop-gesture suppression and overflow at five widths.
- RecoverySleepAcceptanceUITests (3, including a new Goal-scope + edge-swipe-back journey): green on iPhone 17 Pro.
- Full unit suite 1685: green except one known unrelated Peptide test (PeptideSupportEditorViewModelTests sandbox dose); a stale build-number expectation (74) in TrainingLoggerTests was updated to 76.
- Release compile (simulator) and Release archive: succeeded. Generator diff for the bump is two lines.
- Not rerun this pass (resources, unchanged code): Founder Production cleanup UI, Evidence navigation UI, coordinator/historical import/pairing suites ran within the full unit suite only. Not run on other simulator sizes beyond unit overflow widths.
- Fresh independent read-only review: 4 findings (3 medium, 1 low), all fixed and covered by tests.

## Oct 2 canary / strategic
- Not touched. Not naturally observable yet (today is Oct 1). Strategic Sleep remains OFF.

## Founder checklist (physical device, Build 76)
1. Recovery → Sleep: tap Build Lean Mass, Visible Abs, All Sleep. Dates under the selector change; nights, averages and charts stay inside them; Trends and All Nights follow the same choice.
2. Scroll and drag over cards and charts: the page stays put vertically and never slides sideways; swipe from the very left edge still goes back; tapping a chart point still selects it.
3. Trends 2W, 1M, 3M, 6M, All: chart dates are readable, evenly spaced, none cut off; All shows months (with year if it crosses a year).
4. Sleep Window / a travel night: bars are not faded, times show ≈, and one short note explains approximate historical times.

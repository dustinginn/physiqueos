# PhysiqueOS utility-surface design translation

Status: **complete for Founder review; not locked; implementation not started**

## Authority and scope

- Prompt authority: `960f83f4900ae6b12d5192f010054547eae36d9e`
- Exact shipping Native authority audited: `b8ee8690b194cb90086b62816b9a2c8c400dc026` — Build 85
- Families: Apple Watch workout, Live Activity / Dynamic Island, Training Logger entry through confirmation plus later ambiguous workout reconciliation
- Output type: disposable HTML/CSS/JS review harness, documentation, and rendered PNGs
- Shipping Native source changed: **no**
- Server behavior changed: **no**
- Build/TestFlight changed: **no**

## Outcome

All three utility families are fully covered in a source-faithful visual translation of the selected PhysiqueOS language. The package includes:

- 17 representative Apple Watch screens
- 9 representative Live Activity / Dynamic Island screens
- 19 representative Training Logger screens
- all 45 screens rendered individually in dark and mineral-light
- six complete full-board renders, dark and mineral-light for every family
- source audit, exhaustive state matrix, token proposal, accessibility and implementation notes
- automated validation of identifiers, geometry, overflow, product presence, dark/light completeness, and prohibited-invention guardrails

The mineral-light Watch and Live Activity variants were added at Founder request. They are direct token translations for review and do not imply that a shipping Watch or system-owned Dynamic Island should disregard Apple platform appearance constraints.

## Review artifacts

Root:

`agent-handoffs/artifacts/utility-surfaces-design-20261004/`

Primary:

- `README.md`
- `comparison-board.html`
- `watch-board.html`
- `live-activity-board.html`
- `logger-board.html`
- `screens/watch-coverage-board.png`
- `screens/watch-coverage-board-light.png`
- `screens/live-coverage-board.png`
- `screens/live-coverage-board-light.png`
- `screens/logger-coverage-board.png`
- `screens/logger-coverage-board-light.png`
- `SOURCE-AUDIT.md`
- `COVERAGE-MATRIX.md`
- `UTILITY-TOKENS.md`
- `IMPLEMENTATION-NOTES.md`
- `validation.json`

Every screen in `screens/` has a dark PNG and a corresponding `-light.png` file. Board HTML accepts `?theme=light` for live inspection.

## Source audit

### Apple Watch

Build 85 centralizes the visual state machine in `ios/PhysiqueOSWatch/WatchWorkoutViews.swift`, driven by the Watch store, Health controller, shared contracts, projection mapper, command router, connectivity bridge, and finish coordinator.

The current product supports idle/prepared/orphan handoff, fixed execution, weighted/bodyweight/linked labels, rest, three Crown pages, swipe-right controls, pause/resume, distinct Finish and Cancel confirmation, recoverable two-leg save, Health start/save recovery, saved summary, Always-On, and authority/revision error handling.

Two source boundaries are important:

1. Timed duration reaches the shared projection but the Watch execution mapper/view renders only load/reps; the source-faithful result is `— / —`. W10B labels this gap and does not invent a duration tile.
2. Watch shows no PR celebration. Saved summary may include only a PR count metric.

Gesture, authority, HealthKit, final-set, Finish/Cancel, idempotency, and recovery semantics are unchanged.

### Live Activity / Dynamic Island

Build 85 uses `WorkoutActivityAttributes.swift`, `WorkoutLiveActivityViews.swift`, the widget extension, Complete Set App Intent, and coordinator/client/bridge plumbing.

ActivityKit is a pure, revisioned, max-two-row projection. It owns no HealthKit, evidence, PR, Finish, Cancel, Pause, Resume, connectivity, or authorization behavior. Complete Set retains its target revision and mutation identifier.

Explicit pause and stale non-countdown safety currently share one “needs an update / Open Logger to refresh” presentation. LA5 preserves and labels that limitation rather than inventing a pause-specific contract. Mutation failure has no separate surface and remains on the current active template.

### Training Logger

The exact current flow is:

`Entry → Training Areas → Exercise Picker → Active Set Entry → Workout Review → Final Confirmation → Workout Complete`

Finish from Active opens Review. Review continues to Final Confirmation. The second Finish is the semantic commit boundary. Add/Edit Set stays inline; exercise relationship actions stay in the current menu hierarchy.

Ambiguous Apple Health workout matching is a later Log → Pending Evidence Review → Evidence Review Detail → Workout Match flow, not inline Logger. Trusted exact Watch correlation bypasses that generic review and uses the ordinary completion screen.

No phone workout timer, pause/resume, active-rest screen, Watch-active/paused banner, notes, favorites, workout-type picker, unchecked-set warning, duplicate modal, or unsaved-changes alert was invented.

The detailed audit is in `SOURCE-AUDIT.md`.

## Complete coverage matrix

The canonical, state-by-state matrix is `COVERAGE-MATRIX.md`. It includes every audited state with:

`Surface/state | Current source component | Proposed visual template | Mocked? | Covered by template?`

Coverage summary:

| Family | Source template families | Representative screens | Dark | Mineral-light | Uncovered |
|---|---:|---:|---:|---:|---:|
| Apple Watch | W-A through W-S | 17 | Complete | Complete | 0 |
| Live Activity / Dynamic Island | LA-Ø, LA-L/E/C/M | 9 | Complete | Complete | 0 |
| Training Logger | LG-System through LG-Match | 19 | Complete | Complete | 0 |

Material Watch mapping:

- handoff/bootstrap → W0
- Ready for Watch → W0B
- orphaned Apple Health workout → W0C
- active execution → W1
- Metrics → W2
- Daily Totals → W3
- active/paused controls → W4/W5
- Finish/Cancel confirmations → W6/W11
- two-leg save/recovery → W7/W13
- summary/Done → W8
- authority/revision warning → W9
- bodyweight/superset → W10
- timed source gap → W10B
- Always-On → W12
- Apple Health authorization → Apple system sheet

Material Live Activity mapping:

- active Lock Screen → LA1
- expanded Island → LA2
- compact/minimal → LA3
- countdown rest → LA4
- pause/stale safe state → LA5
- all sets complete → LA6
- finishing → LA7
- saved/end → LA8
- privacy redaction → LA9
- no requested/eligible/end surface → LA-Ø

Material Logger mapping:

- entry/draft → L1
- Training Areas → L2
- picker/search → L3
- creation/collision candidate → L4
- active workout → L5
- pre-first-set Ready on Watch → L5B
- inline numeric keyboard → L6
- variant/substitute/reorder menu → L7
- superset → L8
- Watch-coordinated current-source state → L9
- Cancel safety → L10
- Review/evidence → L11
- Final Confirmation → L12
- later ambiguous Workout Match → L13
- trusted exact correlation / normal completion → L14
- completion + records/confetti → L15
- long-save/retry/idempotency → L16
- dark/mineral parity → L17D/L17L

Every non-rendered near-variant maps to one of those proofs in the canonical matrix. No current state is left uncovered.

## Visual token mapping

The proposed utility language uses:

- dark page `#061019`, surface `#0F1C2A`, soft surface `#132735`
- mineral page `#E8ECE5`, paper `#FBFAF4`, soft surface `#EEF2ED`
- dark/light primary text `#F3F8FA` / `#102431`
- functional teal `#3BD2CA` / `#087E78`
- restrained purple `#AA98FF` / `#5C3FD2`
- success `#55E39A` / `#16875F`
- caution/execution `#EFB84F` / `#C88228`
- destructive `#FF697A` / `#B83D4B`
- border-driven depth and Plus Jakarta Sans for product-owned typography

Watch maps these semantics to OLED-first execution, full-width actions, high-contrast numeric values, and explicit lane warnings. ActivityKit uses teal current/action, green rest/success, amber needs-update, while the Dynamic Island remains system black. Logger uses dense paper/navy containment, teal focus, amber Finish, purple relationship/selection, and explicit destructive red.

The complete proposal is `UTILITY-TOKENS.md`.

## Accessibility

Apple Watch:

- implementation target of 44 × 44 pt actions
- combined VoiceOver metric summaries and stable reading order
- reflow at accessibility sizes, not clipping
- state labels/icons in addition to color
- Always-On and Reduce Motion validation

Live Activity:

- short region-specific accessibility summaries
- privacy-safe generic labels
- system-compatible timer behavior
- contrast in both appearances
- no animation-dependent state

Logger:

- 44 pt set/delete/menu/evidence targets
- accessible fallback for fixed set grids at large Dynamic Type
- numeric field labels include exercise, set, unit, value, completion
- keyboard Previous/Next/Done order and avoidance
- sticky Finish never covers focus
- explicit destructive consequence copy
- confetti hidden from accessibility and removed under Reduce Motion

## Implementation feasibility

| Family | Complexity | Regression risk | Primary implementation area |
|---|---|---|---|
| Watch | Medium | Medium-high | `WatchWorkoutViews.swift`, scoped tokens/primitives, previews/tests |
| Live Activity | Low-medium | Medium | shared Live Activity views/widget, preview/view tests |
| Logger | High | High | `TrainingLoggerView.swift`, scoped Logger primitives/theme, evidence/match presentation |

Hard-coded styling is the primary consistency blocker. Pure visual implementation should not require changes to Watch store/router/Health controller/finish coordinator, ActivityKit attributes/coordinator/App Intent, or Logger view model/API/draft/evidence contracts.

Detailed file and regression notes are in `IMPLEMENTATION-NOTES.md`.

## UX changes proposed

Proposed now, presentation-only:

- clearer Watch current/next and finish-leg hierarchy
- authority warnings that name the affected lane
- consistent primary/secondary/destructive action treatment
- Logger field focus, set completion, relationship, evidence, and long-save treatments
- direct dark/mineral token parity with identical geometry

Documented for separate future decision, not proposed as current behavior:

- Watch timed duration rendering
- separate paused vs stale Live Activity semantics
- Logger Watch status/rejection explanation
- Watch summary Health-retry action

## Validation

Automated render validation passed on 2026-10-04 UTC:

- six boards passed (three families × two appearances)
- expected IDs equal actual IDs for all boards
- no missing or extra representative states
- no horizontal page overflow
- no stage overflow
- every card contains a product surface
- every stage remains contained by its card
- no shipping-code-change flag
- no invented Logger timer, pause control, Watch-active banner, or Live Activity mutation-error UI

Individual key screens and full boards were also visually inspected after rendering.

## Backlog update

`agent-handoffs/backlog/20261003-app-wide-ui-design-polish-home-exploration.md` now marks:

- Watch utility-surface translation in review
- Live Activity translation in review
- Logger full-flow translation in review
- implementation not started
- all three directions not locked pending Founder review

## Shipping isolation confirmation

Only documentation, disposable harness source, fonts, and generated PNGs were created, plus the requested design-polish backlog status update. No file under shipping Native UI, Watch target, shared contracts, ActivityKit extension, Server, build configuration, or TestFlight state was modified.

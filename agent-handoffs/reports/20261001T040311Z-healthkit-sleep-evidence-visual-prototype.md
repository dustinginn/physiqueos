# HealthKit Sleep Evidence: visual prototype and screenshots (NON-SHIPPING)

Task: healthkit-sleep-evidence-visual-prototype-20261001 (prompt 20261001T034500Z)

Status: complete. A fixture-backed prototype was built and run in the iOS Simulator, and the full screenshot set was captured. It is NOT a shipping candidate. Nothing was deployed, uploaded, activated or changed in production. No Founder data was used.

## Branch and authority
- **Prototype branch:** `claude/sleep-evidence-prototype-20261001`, commit **3a2697da** (pushed).
- **Base:** a5041eb0 (`claude/healthkit-sleep-next-native-20260930`, the Founder Production page cleanup). The cleanup is preserved, and its UI test passes on this branch.
- **Production is untouched:** Server 08aeecde (deployment 1e7d28e6) and Native Build 73 (05912674).

## Locked-session result
- The macOS console was locked during the whole task (`IOConsoleLocked = true`). Nothing attempted to unlock it or touch the lock screen.
- Headless simulator tooling worked anyway: `simctl boot`, `simctl io screenshot`, `simctl status_bar`, and `xcodebuild` UI tests on the iPhone 17 Pro simulator all ran under the lock.
- **No Founder action is needed for the screenshots.**

## Screenshot inventory
All are real Simulator captures (iPhone 17 Pro, dark appearance, status bar fixed at 9:41), downscaled to 1600 px high. They are on the branch under `ios/Prototypes/SleepEvidence/screenshots/`:

| # | File | Shows |
|---|---|---|
| A | `A-evidence-hub-recovery.png` | Evidence Hub; Recovery row reads "Last night · 7h 30m" (Recently Used + All Evidence) |
| B | `B-recovery-landing-top.png` | Header, Last Night card ("Still updating from Apple Health"), 14-night Sleep chart + dashed 7-night average, Last 7 / Prior 7 tiles |
| C1 | `C1-recovery-landing-window.png` | Sleep Window card: floating clock bars, median band, inferred-zone nights faded with ◌, typical window, ± spreads |
| C2 | `C2-recovery-landing-lower.png` | Recent Nights (Updating tag; ◌ CDT inferred-zone rows) and Data Sources (Oura Preferred / Apple Watch Not recorded / Entered in Health None) |
| D1 | `D1-sleep-trends-top.png` | Trends: 2W/1M/3M/All selector, 30-night Total Sleep + 7-night average, Selected Night tiles |
| D2 | `D2-sleep-trends-window-continuity.png` | 30-night Sleep Window, Continuity (awake in window bars; longest continuous sleep dots; pending night shown as a gap) |
| D3 | `D3-sleep-trends-stage-mix-collapsed.png` | Stage Mix collapsed by default ("Show stage mix"), All Nights preview |
| E | `E-night-detail-top.png` | Night of Wed Sep 30: 7h 22m, 11:12 PM–7:04 AM · CDT, "Time zone inferred" chip, 4-lane hypnogram with in-bed band and transition connectors |
| F1 | `F1-night-detail-stages-continuity.png` | Stage bar + Deep/Core/REM minutes, Awake in sleep window, Continuity tiles, Time in Bed |
| F2 | `F2-night-detail-source-provenance.png` | Source & Data expanded: preference applied, also recorded, time zone "CDT · inferred at sync", stage detail, last updated, calculation sleep-canon-v2, travel note |
| G | `G-state-pending-correction.png` | State example: a pending-correction night. The asleep window is shown; timeline/stages/continuity read "Stage detail is being recalculated" (no numbers) |

## Fixture
`SleepPrototypeFixture` is a deterministic seeded generator with only synthetic values.
- 30 nights (wake dates Sep 2 – Oct 1, 2026), all Oura primary, staged.
- One main episode per night, built from ~90-minute cycles: more Deep early, more REM late, brief awakenings.
- 40–90 segments per night, with in-bed wider than the asleep span.
- Sep 28–30 use an inferred CDT zone, Oct 1 is still updating, Sep 21 is pending correction (labelled sleep-canon-v1), and Sep 20 carries one additional-sleep episode.

Values are not modeled on Founder bed/wake times. Stage values are "corrected-looking" synthetic values used only to show the layout.

## Implementation notes
- **New files:**
  - `Presentation/Evidence/SleepEvidencePrototype.swift`: gate, fixture, formatting, prototype-local stage color tokens.
  - `SleepEvidencePrototypeCharts.swift` (Swift Charts): total sleep plus average, sleep window, hypnogram, pending timeline, stage bar, continuity, stage mix.
  - `SleepEvidencePrototypeViews.swift`: Recovery landing, Sleep Trends, Night detail, row, All Nights sheet.
  - Unit and UI tests.
  - `ios/Prototypes/SleepEvidence/README.md`.
- **Existing files touched (minimal):**
  - `EvidenceView`: the hub passes through `SleepEvidencePrototype.decorate`, which is a no-op unless the gate is open.
  - `AppDestinationRouterView`: three gated `progressStream` cases (`recovery`, `recovery/sleep/trends`, `recovery/sleep/night/<day>`). With the gate closed they fall through to the existing placeholder.
  - `generate_project.py` and the regenerated pbxproj.
- **Gate (fixture data can never reach production):** all three must hold.
  1. A DEBUG build. In Release, `isEnabled` is a constant `false`; a Release compile succeeds.
  2. The volatile launch argument `-physiqueos.sleep-evidence-prototype.v1 YES`. It is read from the argument domain only and never persisted.
  3. The Sandbox authority. Founder Production is never decorated or routed, even with DEBUG and the argument set.
- Visual language reused: `CardContainer`, `TrainingSectionHeaderView`, `TrainingCompactActionLabel`, PhysiqueOS typography and theme, the same back-chrome and ScrollView pattern as Activity, and the Recovery teal from `EvidenceStreamPresentation`.

## Tests and build
- **Unit:** `SleepEvidencePrototypeTests` passes 7/7:
  - the gate matrix
  - the gate closed without the argument
  - Production never decorated
  - Sandbox decoration touches only Recovery
  - fixture shape (30 nights, 40–95 segments, stage sums, contiguity, in-bed envelope)
  - average needs 3 nights
  - formatting
- **UI:** `SleepEvidencePrototypeScreenshotUITests` passes 2/2:
  - Recovery stays "Coming soon" and doesn't route without the argument.
  - The full navigation journey plus captures.
- **Regression:**
  - `EvidenceReadModelTests` and `EvidenceHubUsageTests`: 15/15.
  - `TrainingAcceptanceUITests/testCorrectedEvidenceJourneys` (Weight/DEXA/Photos Evidence destinations) passes.
  - `testFounderProductionPageCarriesNoObsoleteDiagnostics` (a5041eb0 cleanup) passes.
- **Build:** Debug build-for-testing succeeded, and a Release compile (`generic/platform=iOS Simulator`, no signing) succeeded.
- I did not run the full Native suite (risk-scaled, as the prompt allowed).
- **Resources:** free disk 26 GiB, above the 15 GiB floor. DerivedData lives in the job temp folder (not committed). No Codex worktrees or state were touched.

## Visual questions for the Founder
1. **Hub row:** "Last night · 7h 30m" vs a date-first form ("Oct 1 · 7h 30m")?
2. **Last Night:** is the big duration plus the window line the right emphasis, or should the 7-night average be equally prominent?
3. **Sleep Window:** horizontal per-night bars (shown) vs a compact single "typical window" band on the landing, with the per-night bars only in Trends?
4. **Hypnogram:** the 4-lane step style with in-bed shading — keep, or prefer a simpler single-lane colored strip?
5. **Inferred time zone:** is a faded bar plus a dashed-circle glyph enough, or should inferred nights carry a text badge in the list?
6. **Stage colors:** Deep indigo / Core blue / REM violet / Awake neutral slate (deliberately not warning-amber). OK?
7. **Pending-correction copy:** "Stage detail is being recalculated." Acceptable wording?

## Explicit non-shipping status
- This branch is a review prototype, not a Build 74 candidate.
- The Sleep Evidence implementation (design Slice 1) would replace the fixture with a Server read model and drop the gate.
- Nothing here activates Sleep, reads Founder Sleep, or implements Briefings, V3, Confidence, strategic Recovery or a Sleep Score.

## Exact minimum next action
- **Founder:** review the 11 screenshots on the branch at `ios/Prototypes/SleepEvidence/screenshots/` and answer the 7 visual questions, or approve as-is.
- Production implementation (Slice 1) still waits on: sleep-canon-v2 deployed, the runner D0-anchor relaxation, and prospective activation, each separately authorized.

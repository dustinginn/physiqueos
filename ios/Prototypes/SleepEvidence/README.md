# Sleep Evidence visual prototype (NON-SHIPPING)

Founder visual-review prototype of the Sleep Evidence design (agent-handoffs report 20261001T032718Z).

**Data:** everything is synthetic. `SleepPrototypeFixture` is a deterministic seeded generator: 30 nights, Oura primary, staged, 40–90 segments per night. Specific nights are flagged for review:
- Sep 28–30: inferred time zone (CDT)
- Oct 1: still updating
- Sep 21: stage detail pending correction
- Sep 20: one additional-sleep episode

No Founder data was read or used.

**Gate:** the prototype is reachable only when all three hold:
- a DEBUG build;
- the launch argument `-physiqueos.sleep-evidence-prototype.v1 YES`;
- the Sandbox authority.

Release builds compile the code, but `SleepEvidencePrototype.isEnabled` is a constant `false` there. Founder Production never decorates the hub or routes to these screens.

## Screenshots

Captured on the iPhone 17 Pro simulator in dark appearance, downscaled to 1600 px high:

| File | Screen |
|---|---|
| `A-evidence-hub-recovery.png` | Evidence Hub with the Recovery row populated |
| `B-recovery-landing-top.png` | Recovery landing top: Last Night card and 14-night Sleep chart |
| `C1-recovery-landing-window.png` | Sleep Window card |
| `C2-recovery-landing-lower.png` | Recent Nights and Data Sources (inferred-zone marker) |
| `D1`–`D3` | Sleep Trends: range selector, Total Sleep, Sleep Window, Continuity, Stage Mix collapsed |
| `E-night-detail-top.png` | Night detail with hypnogram (inferred-zone night) |
| `F1`, `F2` | Night detail stages, continuity, time in bed, and Source & Data provenance |
| `G-state-pending-correction.png` | Pending-correction state (sleep-canon-v2 gating) |

## Regenerate the screenshots

Run from `ios/`. Boot the simulator, then pass the screenshot directory with the `TEST_RUNNER_` prefix:

```
TEST_RUNNER_SLEEP_PROTOTYPE_SCREENSHOT_DIR=<dir> xcodebuild test \
  -scheme PhysiqueOS \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:PhysiqueOSUITests/SleepEvidencePrototypeScreenshotUITests
```

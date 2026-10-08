# Build 93 Recovery card — Native code-acceptance captures

Real iPhone 17 Pro Simulator (iOS 27.0) screenshots of the **shipping SwiftUI**
Recovery card on the Weekly and Monthly Briefing screens, in **Dark** and
**Mineral Light**. They are code-acceptance captures of the already-approved
design, not a new design round.

- Source: Native candidate `claude/native-build93-recovery-weekly-monthly-20261008`
  (code commit `5de2f37b`, based on Build 92 `beaf5eff`). Build 1.0 (92) unchanged.
- Data: **SYNTHETIC** production-shaped `recovery_card_v1` payloads from the
  DEBUG-only review overlay (`-physiqueos.recovery-review.scenario`), run through
  the real decoder into the non-shipping Sandbox Briefing store. No Founder Sleep.
  The overlay is compiled out of Release.
- Captured by `BriefingRecoveryAcceptanceUITests.testCaptureWeeklyAndMonthlyCardsInDarkAndMineralLight`.

| Card | Dark | Mineral Light |
|---|---|---|
| Weekly · Green | `recovery-weekly-green-dark.png` | `recovery-weekly-green-mineral-light.png` |
| Weekly · Yellow | `recovery-weekly-yellow-dark.png` | `recovery-weekly-yellow-mineral-light.png` |
| Weekly · Red | `recovery-weekly-red-dark.png` | `recovery-weekly-red-mineral-light.png` |
| Weekly · Not enough data | `recovery-weekly-not-enough-data-dark.png` | `recovery-weekly-not-enough-data-mineral-light.png` |
| Monthly · Green | `recovery-monthly-green-dark.png` | `recovery-monthly-green-mineral-light.png` |
| Monthly · Yellow | `recovery-monthly-yellow-dark.png` | `recovery-monthly-yellow-mineral-light.png` |

Design authority implemented: Recovery section of
`weekly-midweek-light-translation-final-20261004` (Weekly), Monthly Recovery of
`monthly-correction-dexa-photo-briefing-ui-20261004`, the accepted Mineral Light
rich `.recovery` field, and the Recovery Briefing V1 one-card status semantics
(`recovery-briefing-v1`, 1bfa92ef). Midweek, DEXA, Photo and Daily never render it.

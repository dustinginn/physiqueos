# Build 93 — Recovery Founder-approved correction: lock comparison

Native candidate `claude/native-build93-recovery-founder-correction-20261008` (code commit `5cdc9106`; Server companion `208edfc7`), built on Recovery Native `e0a4706d` (Build 92 base `beaf5eff`, version 1.0 (92) unchanged). Synthetic data only; no Founder Sleep, no device capture.

- `locked/`: crops of the four Founder-locked 2026-10-04 boards on main:
  - Weekly Dark: from folder `weekly-midweek-light-translation-final-20261004`, file `screens/weekly-recovery-dark.png`.
  - Weekly Mineral Light: from folder `briefing-light-log-density-final-polish-20261004`, file `screens/weekly-light-rich-fields-full.png`.
  - Monthly Dark: from folder `monthly-correction-dexa-photo-briefing-ui-20261004`, file `screens/monthly-corrected-dark-full.png`.
  - Monthly Mineral Light: from the same Monthly folder, file `screens/monthly-corrected-light-full.png`.
- `candidate/`: the shipping SwiftUI Weekly/Monthly Briefing screens on the iOS 27 Simulator (iPhone 17 Pro). Content comes from the DEBUG review fixture (`-physiqueos.recovery-review.scenario`), which builds a production-shaped `recovery_card_v1` payload and runs it through the real decoder.
  - `*-lower.png` shows the commentary, foam row and caveat clear of the tab bar.
  - Other scenarios (Weekly Yellow/Red/Not enough data, Monthly Green) are included for regression review.
- `comparison.html`: a side-by-side board of the locked crops and the candidate captures.

The fixture flag ("FUTURE CONTRACT · FIXTURE ONLY") and the caveat's "Confidence coupling: none." appear **only** in DEBUG review-fixture mode, as on the locked boards. A Release card never shows them.

Period-dependent differences:
- The sandbox Monthly artifact is August 2026, so the summary reads "28 of 31 nights" and "6 hr 30 min". The locked board used a synthetic 30-night month with "27 of 30" and "6 hr 25 min".
- The baseline (6h 44m), the week values and the foam counts follow the locked fixture.

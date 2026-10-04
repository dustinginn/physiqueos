# PhysiqueOS utility surfaces — Founder review

Status: **in review; not locked; implementation not started**

This disposable design harness translates the selected PhysiqueOS visual language across the complete Build 85 Apple Watch workout experience, Live Activity / Dynamic Island, and Training Logger flow. It changes presentation only. Every board and individual screen is available in dark and mineral-light.

## Start here

- [Review index](comparison-board.html)
- [Apple Watch board — dark](screens/watch-coverage-board.png)
- [Apple Watch board — mineral-light](screens/watch-coverage-board-light.png)
- [Live Activity board — dark](screens/live-coverage-board.png)
- [Live Activity board — mineral-light](screens/live-coverage-board-light.png)
- [Training Logger board — dark](screens/logger-coverage-board.png)
- [Training Logger board — mineral-light](screens/logger-coverage-board-light.png)

Open the HTML boards for full-resolution inspection and dark/light switching:

- `watch-board.html` and `watch-board.html?theme=light`
- `live-activity-board.html` and `live-activity-board.html?theme=light`
- `logger-board.html` and `logger-board.html?theme=light`

## Review documents

- [Source audit](SOURCE-AUDIT.md)
- [Complete coverage matrix](COVERAGE-MATRIX.md)
- [Utility token proposal](UTILITY-TOKENS.md)
- [Implementation and accessibility notes](IMPLEMENTATION-NOTES.md)
- [Automated visual validation](validation.json)

## Key full-resolution screens

Dark and light files use the same identifier; light files add `-light` before `.png`.

- Watch: `screens/watch-w1.png`, `watch-w4.png`, `watch-w5.png`, `watch-w6.png`, `watch-w7.png`, `watch-w8.png`, `watch-w9.png`, `watch-w10b.png`
- Live Activity: `screens/live-la1.png`, `live-la2.png`, `live-la3.png`, `live-la5.png`, `live-la6.png`, `live-la8.png`, `live-la9.png`
- Logger: `screens/logger-l1.png`, `logger-l3.png`, `logger-l5.png`, `logger-l5b.png`, `logger-l6.png`, `logger-l7.png`, `logger-l8.png`, `logger-l10.png`, `logger-l11.png`, `logger-l12.png`, `logger-l13.png`, `logger-l15.png`, `logger-l16.png`

## Authority and isolation

- Prompt authority: `960f83f4900ae6b12d5192f010054547eae36d9e`
- Shipping Native source authority: `b8ee8690b194cb90086b62816b9a2c8c400dc026` — Build 85
- Harness: static HTML/CSS/JS plus rendered PNGs only
- Shipping Native, Server, Watch behavior, ActivityKit lifecycle, HealthKit behavior, Logger data and evidence semantics: unchanged

The mineral-light Watch and Live Activity renderings are review translations requested after the original brief. They do not propose forcing a light Watch or Dynamic Island appearance where the platform owns the presentation.

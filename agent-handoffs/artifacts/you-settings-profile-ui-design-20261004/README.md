# PhysiqueOS You / Settings Founder review

Status: design review ready. No shipping code changed.

Primary review:

- `review-board.html`
- `screens/you-settings-primary-mobile-review-board.png`
- `screens/beta-readiness-architecture-summary.png`

The package closes the one remaining Evidence visual correction, then covers the new You / Settings family in dark and locked Mineral Light.

## Direct visual templates

| ID | Surface | Direct render | State ownership |
|---|---|---:|---|
| D1 | DEXA Since Prior Scan | dark + light | production visual structure; accepted values preserved |
| Y1 | You root | dark + light | existing Goals and Operating Plan retained; Settings becomes the utility doorway |
| S1 | Settings root | dark + light | Profile, Data Sources, Appearance, one-device account state, version |
| P1 | Profile populated/edit | dark + light | preferred name, height, time zone, weight unit |
| DS1 | Data Sources root | dark + light | external connection inventory, not Evidence |
| DS2 | Apple Health connected | dark + light | receive/send directions and active domains |
| DS3 | Apple Health limited visibility | dark + light | truthful no-visible-data semantics; never claims read denial |
| A1 | Appearance | dark + light | System selected; Dark and Light map to the same selection template |

`validation.json` proves 16 product renders, zero runtime errors, zero broken board images, and no horizontal overflow at the 390 px mobile review width.

## Package documents

- `SOURCE-AUDIT.md`
- `ROUTE-STATE-COVERAGE-MATRIX.md`
- `PROFILE-FIELD-MATRIX.md`
- `DATA-SOURCES-SEMANTICS.md`
- `BETA-READINESS-MATRIX.md`
- `IMPLEMENTATION-DELTA-REVIEW.md`
- `EVIDENCE-LOCK-RECORD.md`

Authority:

- prompt: `ce0141a53e140fe9b0854d6a4df01d6a5dbae434`
- Native Build 85: `b8ee8690b194cb90086b62816b9a2c8c400dc026`
- Server Build 85 authority: `3c0f4aefddbb9a6886f6ad012443978303d47024`


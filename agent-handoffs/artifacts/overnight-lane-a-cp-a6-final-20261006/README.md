# Overnight Lane A — Checkpoint A6: integrated regression and final package

**Status: ready for Founder review (not accepted).**

- **Lane branch:** `claude/overnight-lane-a-watch-live-priorities-capture-20261006`.
- **Base:** Build 88 `7fce3b97`.
- **Final code commit:** `3d112478`. The final lane SHA is this package's commit (see the report on main).

## Checkpoint index

| Checkpoint | Package |
|---|---|
| A1 + A2: Watch (Dark + Mineral), functional fixes, independent Watch appearance | `../overnight-lane-a-cp-a1-a2-watch-20261006/` |
| A3: Live Activity and Dynamic Island | `../overnight-lane-a-cp-a3-live-activity-20261006/` |
| A4: Priority Detail family | `../overnight-lane-a-cp-a4-priority-detail-20261006/` |
| A5: Morning Check-In, manual weight, Confidence | `../overnight-lane-a-cp-a5-daily-capture-20261006/` |

## Integrated gates on `3d112478`

| Gate | Result |
|---|---|
| Full Native unit suite | **2085 / 0 failures** (1 skipped). Build 88 had 2066. |
| Full iPhone UI suite (65 tests, freshly erased simulator) | **65 / 65.** 64 passed in the full run. `testCorrectedEvidenceJourneys` (DEXA Evidence scroll, untouched by this lane) failed only while machine load was 110–150, and passed when re-run at normal load. It also passed in the earlier full run. |
| Watch unit suite | **56 / 56.** Build 88 had 49. |
| Watch UI suite | **6 / 7.** `testFinalSetFinishShowsConfirmationOnThePrimarySurfaceAndNotYetReturns` fails **identically on untouched Build 88**: the fixture has no WCSession, so `requestFinish` fails closed. Pre-existing. |
| Generic Release build (app, Watch, Widget/Live Activity extension) | BUILD SUCCEEDED. `verify_release_configuration.py` OK (1.0 (88)). |
| Generator stability | Re-running produces no diff. Block `0x1EFF` holds 4 Watch-only `PBXBuildFile` lines. |
| Release seam scan | 0 Lane A DEBUG seams in the app, Watch and extension binaries. Plus Jakarta Sans is bundled in the Release Watch app. |

## Regressions this gate caught and fixed (`3d112478`)

1. **Live Activity extension crash (A3).**
   - ActivityKit could not archive the Jakarta `UIFont` / `UIColor`-backed styling (`CodableAttributedString` encoder trap).
   - This killed Finish → Complete, and the stranded draft then broke 8 Logger journeys.
   - **Fixed:** SF system faces, sRGB colors, and the Mineral page drawn by the view.
   - Verified by `LoggerParity` CP4 and the 8 journeys on an erased simulator, with no new crash reports.
2. **Manual weight "Today" shortcut lost (A5).**
   - The compact-picker overlay dropped the shared `DateField` sheet.
   - **Fixed:** an additive `.capture` style keeps the sheet (graphical picker, Today, Done).

## Not done (by design)

- No build bump.
- No TestFlight upload.
- No Server deploy.
- No merge to release authority.
- latest.json still points at Build 88.

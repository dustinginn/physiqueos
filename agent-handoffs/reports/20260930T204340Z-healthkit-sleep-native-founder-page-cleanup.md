# HealthKit Sleep Phase C — Native Founder page cleanup committed (not built)

Task: healthkit-sleep-phase-c-historical-validation-and-rollout-20260930

Status: partial. Waiting on the Founder device run of the historical Sleep validation (Build 73).

## State unchanged since the prior checkpoint
- Production Server 08aeecde (deployment 1e7d28e6). Oura source preference is set. Historical validation window hv-2026-10-01-30d is open (sleep days 2026-09-01..2026-09-30, America/Los_Angeles).
- Prospective Sleep activation policy is absent and OFF. Ordinary Sleep samples and days are 0, validation samples are 0, strategic leakage is 0.
- Build 73 (05912674) is VALID on TestFlight. Tap sequence: see report 20260930T203147Z-healthkit-sleep-phase-c-historical-window-open.md.

## New: Native cleanup for the next Sleep candidate (non-blocking)
- Branch `claude/healthkit-sleep-next-native-20260930`, commit a5041eb0 (parent 05912674). Not built or uploaded; it becomes Build 74 only when authorized.
- The Founder Production page now shows only:
  - connection status
  - "Disconnect this production session"
  - the Sandbox/Founder Production selector
  - a new temporary "SLEEP CANARY (TEMPORARY)" card: Enable Sleep canary, Request Apple Health authorization, and the Sleep historical validation section
- Removed UI:
  - Notification diagnostics
  - Workout reconciliation diagnostics
  - Production read cards and "Refresh production reads"
  - The whole old HEALTHKIT FOUNDER CANARY view: Activity, Nutrition and Workout canary controls, automatic sync diagnostics, the Sep 23 Activity repair, the controlled canonical test day, and Activity bounded historical validation
- Preserved: all automatic Activity, Nutrition, Workout, Strength reconciliation, notification, HealthKit and persistent-pairing behavior. The underlying diagnostics models that production code uses are kept.
- Follow-up (optional, low priority): the coordinator and engine canary methods left without any UI caller can be pruned later. After Sleep graduates, the Sleep canary card can be removed.

## Validation
- PhysiqueOSTests: 1633 executed, 1 failure. The failure is the known Peptide test (PeptideSupportEditorViewModelTests testSandboxChangeDose…), which predates this change and is unrelated.
- UI test `testFounderProductionPageCarriesNoObsoleteDiagnostics`: passed.

## Next
1. Founder runs the Build 73 historical validation on the iPhone and reports Samples read/sent/not representable and the outcome.
2. Agent runs the zero-write historical-shape audit, then writes the sanitized validation report and the Evidence-design handoff.
3. Prospective activation needs separate authorization. The D0 2026-10-01 floor (Sep 30 18:00 PDT) has passed, so a new D0 will be proposed.

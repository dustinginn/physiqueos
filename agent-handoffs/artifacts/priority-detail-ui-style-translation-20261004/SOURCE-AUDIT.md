# Source audit

## Authorities

- Prompt/main authority: `46ca8600e4659518ea3bc21dbbfc43256d6d78a2`
- Build 85 Native: `b8ee8690b194cb90086f6f62816b9a2c8c400dc026`
- Current production Server source: `3c0f4aefddbb9a6886f6ad012443978303d47024`

## Native presentation authority

`PriorityDetailView.swift` renders:

1. Priority eyebrow, title, subtitle/status.
2. occurrence-bound related Weight when the completed Morning Weigh-In has one.
3. Server `sections[]`, in order.
4. an action state: Mark Complete, optional Mark Skipped, evidence/continue action, Paused route, Completed confirmation, Skipped confirmation, or no action.

`PriorityDetailPresentation.visibleSections` removes only `Related Goals`, `Completion`, and `Appointment completion`. This is the intentional simplified structure. The proposal retains all execution-relevant fields and does not recreate the removed cards.

Build 85 still contains `whatCard` only for Sandbox/no-section data. Founder Production supplies `detailSections`; the design harness does not treat the Sandbox fallback as a product template.

## Server-owned templates

`PriorityDetailService.js` has materially distinct composers for:

- ordinary reminder;
- Morning Weigh-In;
- recovery Support (Foam Rolling);
- execution-backed peptide;
- supplement Support;
- Progress Photos;
- DEXA appointment stages;
- unresolved fallback.

The unresolved fallback is fail-safe contract behavior, not a valid design template. Native instead presents unavailable/failed states. Peptides additionally have Completed, Skipped, Paused, setup-required and dose-adjustable branches. DEXA has week-before, day-before, morning-of, appointment and upload-results stages; these share one evidence/appointment template and differ only in canonical copy/action.

## Current content sources

- Tesamorelin `0.5 mg`, Sunday–Thursday, fasted-before-bed and accepted `10:29 PM` presentation come from the current Founder seed plus the locked Home source-shaped fixture.
- Retatrutide paused `1.5 mg`, `9:45 PM`, Sep 12 pause and Oct 8 `2.5 mg` change come from Build 85 Native contract fixtures.
- Fadogia Agrestis is a current Server supplement Support protocol with every-other-day semantics and no configured quantity. It is not present in the older Native Sandbox catalog, so Server authority wins.
- DEXA confirmation uses the exact `DexaPriorityDetailService.test.js` source-shaped appointment: Aug 15 at 7:30 AM with “Use the saved clinic instructions.”
- Progress Photos uses the canonical evidence-driven shape and expected pose labels. Evidence confirmation—not a manual check—completes it.

## State inventory

- Loading.
- Not found: `This priority could not be found.`
- Failed: `This priority could not be loaded. Pull to refresh and try again.`
- Open ordinary/manual.
- Upcoming DEXA.
- Evidence-driven open.
- Dose-aware open.
- Completed.
- Skipped.
- Paused.
- Setup required/inactive from Server projection.

The review set renders the materially distinct geometry. Skipped and setup-required are documented in the matrix because their geometry is the same terminal/continue shell as Completed/Paused.

## Newly proven implementation delta

The Server sends actions for Progress Photos (`/evidence/photos`) and DEXA (`/profile/operating-plan/execution/dexa`, `/evidence/dexa`). Build 85 Native's `ProductionPriorityAPI.destination(forActionHref:)` maps only `/check-in/morning`. The paused peptide route has a separate execution-projection fallback. Therefore a non-completable Progress Photo or DEXA Priority Detail can decode its label but has no `continueActionDestination`, so `PriorityDetailView.actionSection` renders no action.

This is recorded in `DESIGN_IMPLEMENTATION_DELTA_LEDGER.md` as required for faithful Priority Detail implementation. No code was changed.

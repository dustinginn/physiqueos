# Home Active App Reconciliation

## Build Lean Mass opening chapter

After atomic activation, Home selected the correct primary goal but continued
feeding it through the finite Visible Abs presentation contract. That contract
interpreted absent projection and confidence values as unavailable dates, zero
progress, and generic execution copy. Home also mapped all evaluated goals into
the active summary, selected icons from the old generic primary mapping, and
presented the latest immutable Daily Briefing without comparing it with the new
goal's activation time.

`HomeActiveChapterPresentationService` is the pure read-only reconciliation
boundary for the committed `build_lean_mass` type. It derives:

- Build Lean Mass as the only Home primary goal.
- Maintenance Calibration as the opening phase.
- Calibration in progress as a qualitative status.
- A dumbbell icon from stable goal type.
- A non-numeric Calibrating confidence state.
- Wednesday and Sunday review rhythm from committed cadence.
- The accepted approximately 8–9% body-fat condition as a guardrail.
- Pending schedule setup from the committed `pending_after_commit` scheduler
  intent.

The trajectory omits projected finish, days remaining, and percentage progress
because those concepts are not committed for this opening phase. Confidence is
not replaced with a fabricated number; Home explains that it will build from
post-transition evidence.

The Home goal summary contains only Build Lean Mass. Completed Visible Abs and
the cut-era Maintenance and Preserve Lean Mass records remain unchanged and
historically available, but are not presented as active Home goals. No empty
supporting-objective section is rendered.

Briefing artifacts remain immutable. When the selected briefing predates the
new goal's `activatedAt`, Home labels it `Previous Chapter Briefing`, retains its
original title, and explains that the next briefing will evaluate Build Lean
Mass. A future artifact generated after activation passes through normally.

Home reminder candidates are filtered by goal ownership. A reminder explicitly
owned only by Visible Abs, including the existing Foam Roll reminder, cannot
occupy the active Build Lean Mass next-action slot. Global reminders and items
owned by the new goal remain eligible. No commitment or reminder is modified.

Development Turbopack verification returned HTTP 200 for Home, Goals, Build
Lean Mass detail, and Visible Abs detail. The returned Home HTML contains the
dumbbell, calibration phase, qualitative confidence, body-fat guardrail,
historical briefing context, and pending schedule copy, with none of the old
zero or unavailable projection placeholders.

Interactive browser viewport verification was unavailable. The existing
centered `max-w-[393px]` Home composition, bottom navigation, card ordering,
focus behavior, and responsive width rules were preserved. Component-rendering
and route-DOM assertions provide the fallback mobile and desktop checks.

This patch performs no lifecycle, protocol, commitment, reminder, scheduler,
evidence, briefing, or founder-store write. Broader Goals content, Protocols,
Evidence, and completed-goal reconciliation remain separate work.

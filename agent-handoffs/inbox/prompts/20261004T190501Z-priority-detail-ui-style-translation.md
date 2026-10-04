PhysiqueOS UI design — lock Goals + translate Priority Detail surfaces

TASK TYPE

Continue in Codex A / existing primary-app design chat.
Use High reasoning.

Founder is comfortable moving faster.

Goals visual direction is accepted based on current review, with one explicit product decision:
Completed-Goal ProgressPhotoTile does NOT need tap-to-expand. Static photo presentation on Goals is acceptable and should NOT be added to the implementation-delta ledger as a required gap.

Do not modify shipping UI yet.

PART A — GOALS LOCK

Record Goals hierarchy as LOCKED design direction, preserving:
- Goals root;
- active Build Lean Mass;
- current/completed phases;
- completed Visible Abs;
- Your Journey;
- progress bars;
- first/final completed-goal photo roles;
- persistent Guardrail distinct from phases;
- dark + mineral light;
- current read-only production authority.

Explicit decision:
ProgressPhotoTile on Goals may remain non-tappable/non-expandable.

Do not confuse this with Photo Briefing:
Photo Briefing still requires the dedicated paired Previous/Current comparison viewer tracked in the implementation-delta ledger.

PART B — NEXT FAMILY: PRIORITY DETAIL

Translate the COMPLETE Priority Detail family into the locked PhysiqueOS design system.

This is a functional/execution surface.

Do not dramatically redesign workflows.

Preserve exact completion semantics, timing, protocol/dose behavior, evidence actions and server authority.

SOURCE AUDIT FIRST

Audit exact Build 85 Native source and current Server Priority/occurrence contracts.

Inventory every Priority Detail surface/state.

At minimum audit:

GENERIC PRIORITY DETAIL
- title;
- status;
- schedule/timing;
- preparation;
- execution notes;
- Mark Complete;
- completed state;
- evidence actions;
- history/context if current.

MORNING WEIGH-IN
- current detail route;
- before food/fluids instruction;
- completion/logging behavior;
- any evidence/log shortcut;
- completed state.

FOAM ROLLING
- schedule;
- execution instruction;
- completion;
- completed state.

PEPTIDE / DOSE-AWARE PRIORITY
- Tesamorelin;
- Retatrutide if current;
- dose;
- preparation;
- timing;
- protocol changes;
- completion context;
- dose-aware completion semantics;
- completed state.

SUPPLEMENT / FADOGIA
- QOD semantics if current;
- timing;
- completion.

DEXA / PROGRESS PHOTOS / OTHER EVIDENCE-DRIVEN PRIORITIES
- current routes/actions where present;
- completion;
- evidence upload/logging behavior;
- detail copy.

OTHER CURRENT PRIORITY TYPES
Audit source and include every materially distinct template.

KNOWN PRODUCT HISTORY

Priority Detail was intentionally simplified:
removed Related Goals;
removed informational Completion cards;
removed sandbox fallback.

Retain:
- Mark Complete;
- completion contexts;
- dose;
- preparation;
- execution notes;
- timing;
- protocol changes;
- evidence actions.

Do NOT reintroduce removed sections.

MORNING CHECK-IN ROUTING

There was a prior defect where a completed Morning Check-In priority opened the wrong screen.

Audit current Build 85 route behavior.

If resolved:
document as resolved.

If still present:
add to DESIGN_IMPLEMENTATION_DELTA_LEDGER.md as likely shipping defect.

Do not silently design around it.

HOME VS PRIORITY COMPLETION SEMANTICS

Historical audit item:
Home inline completion may use plain completion while Priority Detail can use dose-aware peptide completion.

Audit exact Build 85 current behavior.

Determine whether inconsistency still exists and whether it is intentional product semantics or a technical discrepancy.

Do not change behavior in design harness.

If unresolved and implementation-relevant:
append to delta ledger with source proof and required Founder/implementation decision.

DESIGN INTENT

Priority Detail should feel like the execution counterpart to the new Home.

Use locked Home visual language:
- deep navy / mineral;
- semantic priority colors;
- strong hierarchy;
- restrained purple;
- compact cards/fields;
- clear primary action.

These are utility/action pages.

Optimize:
- fast comprehension;
- obvious next action;
- legibility;
- one-handed interaction;
- minimal unnecessary vertical space.

Do not bury Mark Complete.

Do not make informational copy visually compete with the primary action.

PRIORITY COLOR IDENTITY

Preserve semantic color identities already established on Home where meaningful:
Morning Weigh-In / Foam Rolling / Tesamorelin etc.

Do not rely on color alone.

COMPLETION STATES

Show representative:
- open;
- due/upcoming if distinct;
- completed;
- unavailable/error if materially distinct;
- dose-aware completion if distinct;
- evidence-required/action state if distinct.

Completed state should be clear but not celebratory overkill.

Do not invent undo/reopen if current product lacks it.

DARK + MINERAL LIGHT

Required for every materially distinct Priority Detail template.

Same content/behavior/geometry.
Appearance tokens only differ.

CONTENT

Use exact current canonical copy/data from source-shaped fixtures.

Do not fabricate doses/times/protocols.

If real Founder values appear in current safe fixtures, preserve exact projection but do not expose private credentials or irrelevant personal data.

NAVIGATION / ACTION PARITY

Create matrix:

Priority type | entry route | primary action | secondary action | completion semantics | completed destination/state | evidence action | template

Zero uncovered types.

Audit:
- Home entry;
- Log/Evidence entry where relevant;
- notification/deep-link route if current;
- completed occurrence routing.

ACCESSIBILITY

44pt actions.
Dynamic Type.
VoiceOver dose/time/completion.
Non-color status.
Destructive actions distinct.
Long preparation/execution notes reflow.

REVIEW OUTPUT

Founder wants concise review.

Produce representative dark/light:
1. generic priority detail;
2. Morning Weigh-In;
3. Foam Rolling;
4. Tesamorelin/dose-aware peptide;
5. Retatrutide only if materially different;
6. Supplement/Fadogia if materially different;
7. evidence-driven priority such as DEXA/Photos if current and distinct;
8. completed state;
9. error/unavailable only if distinct;
10. concise family board.

Do not render redundant copies.

IMPLEMENTATION FEASIBILITY

Document:
- reusable Home components/tokens;
- Priority-specific primitives;
- action/button treatment;
- routing differences;
- completion API differences;
- regression risks;
- tests needed.

IMPLEMENTATION DELTA LEDGER

Review:
agent-handoffs/DESIGN_IMPLEMENTATION_DELTA_LEDGER.md

Append every newly discovered behavior/data/navigation/accessibility delta.

Specifically reverify:
- Morning Check-In completed routing;
- Home vs Priority Detail dose-aware completion semantics.

Do not bury findings only in report.

SHIPPING ISOLATION

No Native shipping changes.
No Server changes.
No completion mutations.
No notification changes.
No build/TestFlight.

Design harness/docs only.

REPORTING

Follow agent-handoffs/README_REPORTING_STANDARD.md.

Publish main checkpoint + latest pointers + exact branch/artifact commits and verify main visibility.

REPORT

agent-handoffs/reports/<timestamp>-priority-detail-ui-style-translation.md

LOCK STATUS

Goals = LOCKED.
Priority Detail = exploration pending Founder review.

STOP when complete Priority Detail family is source-audited, covered in dark/light, delta ledger updated, and concise artifacts are ready.

END TASK.
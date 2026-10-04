PhysiqueOS final design Batch 1 — Evidence Intake + Review

TASK TYPE

Continue in Codex A / existing UI design program chat.
Use High reasoning.
Same chat.

Founder accepted the app-wide redesign coverage audit and authorized the recommended final design sequence.

This is FINAL DESIGN BATCH 1 of 3.

Design only. No shipping implementation.

SCOPE

Design the four remaining Evidence intake/review surface groups identified by the exhaustive coverage audit:

1. Generic Evidence Intake
2. Progress Photos Intake
3. DEXA Intake
4. Generic Evidence Review

Use the app-wide audit at:
agent-handoffs/reports/20261004T204247Z-app-wide-redesign-coverage-audit.md

and its coverage artifacts as the exact scope authority.

Do not expand into already locked Evidence presentation pages.

SOURCE AUDIT FIRST

Reverify the current Native authority and audit the complete current production hierarchy/behavior for these four groups before rendering.

For each group identify:
- all entry points;
- route/sheet/full-screen presentation;
- materially distinct intake types/states;
- file/photo/document selection behavior;
- metadata/details fields;
- source/provenance presentation;
- pending/uploading/processing states;
- validation/error/retry states;
- review/confirm/correct/dismiss actions;
- duplicate/conflict states where current;
- navigation after acceptance/processing;
- any special DEXA detection/correction behavior;
- any Progress Photos pose/session behavior;
- any current generic intake type chooser and add-details-without-asset behavior.

Do not invent capabilities or states.

PARITY STANDARD

Production Native + Server contracts remain content/behavior authority.
Locked PhysiqueOS design system is visual authority.

Preserve exact:
- content;
- field ordering;
- hierarchy;
- units;
- source/provenance;
- state semantics;
- mutation behavior;
- confirmation behavior;
- error/retry behavior;
- navigation;
- accepted-to-processing semantics.

Do not turn Evidence Intake into Evidence Hub.
Do not redesign the already locked downstream Evidence pages.

VISUAL DIRECTION

Translate these workflow surfaces into the locked dark/Mineral-Light system.

They should feel task-focused:
- clear intake purpose;
- obvious current step;
- compact source/asset context;
- strong primary action;
- restrained secondary actions;
- validation/errors adjacent to the relevant field/action;
- no decorative dashboard treatment;
- no Coming Soon;
- no engineering diagnostics.

Preserve real media/document previews where the current workflow requires them.

DARK + MINERAL LIGHT

Render every materially distinct Founder-review surface in both appearances with identical content, geometry and behavior.

ACCESSIBILITY

Maintain practical Dynamic Type behavior, non-color-only states, clear labels, native-feasible controls and >=44 pt interactive targets.

IMPLEMENTATION DELTA LEDGER

Review agent-handoffs/DESIGN_IMPLEMENTATION_DELTA_LEDGER.md before stopping.

Do not confuse missing implementation with missing design.
Append only newly discovered genuine behavior/data/navigation/accessibility deltas.

REVIEW OUTPUT

Founder wants fast review.

Produce:
1. one mobile-friendly primary composite for the complete batch;
2. focused board for generic intake/review if needed;
3. focused board for Progress Photos intake if needed;
4. focused board for DEXA intake if needed;
5. dark/light pairs for every materially distinct surface;
6. coverage/action matrix proving all current workflow states are represented.

No multiple design directions.

REPORT

agent-handoffs/reports/<timestamp>-final-design-batch1-evidence-intake-review.md

Follow agent-handoffs/README_REPORTING_STANDARD.md.
Publish a main-visible artifact commit and identify the exact primary PNG.

SHIPPING ISOLATION

No Native shipping changes.
No Server changes.
No production mutations.
No schema changes.
No HealthKit permission changes.
No build/TestFlight.

LOCK STATUS

All previously Founder-accepted families remain LOCKED.
These four Evidence intake/review groups are pending Founder review.

STOP when all four groups are source-audited, every material state is covered in dark/Mineral Light, parity is validated, and mobile review artifacts are published.

END TASK.
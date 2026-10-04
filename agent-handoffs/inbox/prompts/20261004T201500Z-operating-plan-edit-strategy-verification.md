PhysiqueOS UI design — Operating Plan edit-strategy verification

TASK TYPE

Continue in Codex A / existing Operating Plan design chat.
Use High reasoning.

Founder accepts the Operating Plan root plus Energy Strategy, Nutrition Strategy and Training Strategy detail designs.

Do not reopen those surfaces.

This is a narrow verification pass for the Edit Strategy flows before Founder authorizes faster coverage of the remaining Operating Plan hierarchy.

No shipping implementation yet.

AUTHORITY

Accepted Operating Plan artifact commit:
89d05249f90cb65da5941d08d987eba50bfb18ce

Current Native authority remains Build 85 unless repository authority has advanced; verify before audit.

SOURCE AUDIT FIRST

Audit the exact current edit/mutation flows reachable from:

1. Energy Strategy detail → Edit Strategy
2. Nutrition Strategy detail → Edit Strategy
3. Training Strategy detail → Edit Strategy

Do not assume all three use the same form.

If any accepted detail page does NOT actually expose an Edit Strategy action in current production, do not invent one. Document the exact current behavior instead.

PRESERVE MUTATION SEMANTICS

For every actual edit flow preserve exact:
- editable fields;
- field labels;
- units;
- defaults/current values;
- validation;
- required/optional fields;
- effective date behavior;
- Goal/Phase ownership;
- review cadence;
- rationale/notes;
- save/confirm semantics;
- cancel/back semantics;
- unsaved-change handling;
- success state;
- error state;
- historical strategy preservation;
- protocol/version history behavior;
- server-owned constraints.

Do not rewrite or simplify canonical mutation semantics for aesthetics.

ENERGY STRATEGY SPECIAL RULE

Historical product rule:
Phase 1 Maintenance Calibration history must remain preserved when Phase 2 Energy Strategy is established or later changed.

Audit how the current edit flow represents:
- intake target;
- activity/expenditure target;
- review cadence;
- effective date;
- current phase;
- prior strategy/history.

If the underlying contract supports history but Native does not expose it, document that as implementation context/delta as appropriate.

Do not fabricate historical UI merely to satisfy the design.

NUTRITION / TRAINING

Preserve exact strategy-edit fields from source.

Do not turn these into Evidence logging forms.

Do not introduce fields merely because they seem useful.

DESIGN

Apply the accepted Operating Plan visual language.

These are utility forms:
- compact;
- obvious labels/units;
- clear current values;
- strong primary Save/Confirm;
- restrained secondary Cancel;
- clear validation;
- comfortable keyboard/input behavior;
- no decorative card overload.

Dark + mineral light.

REVIEW OUTPUT

Founder only needs focused proof:

1. Energy Edit Strategy dark/light.
2. Nutrition Edit Strategy dark/light.
3. Training Edit Strategy dark/light.
4. representative validation/error state if materially distinct.
5. representative save/confirmation state if materially distinct.
6. one mobile-friendly composite PNG as PRIMARY FOUNDER REVIEW ARTIFACT.

No need to rerender accepted root/detail screens except small contextual inset if necessary.

PARITY STANDARD

Locked design implementation philosophy now applies during design verification too:

Parity is not "all fields exist."

Verify:
- ordering;
- grouping;
- visual prominence;
- field relationships;
- navigation;
- validation;
- mutation behavior;
- history preservation.

Create mutation parity matrix:
Surface | production action | editable fields | validation | save semantics | history/effective-date semantics | target design

IMPLEMENTATION DELTA LEDGER

Review:
agent-handoffs/DESIGN_IMPLEMENTATION_DELTA_LEDGER.md

Append genuine implementation gaps only.

Do not treat deliberate current behavior as a gap.

SHIPPING ISOLATION

No Native shipping changes.
No Server changes.
No mutations.
No build/TestFlight.

REPORTING

Follow agent-handoffs/README_REPORTING_STANDARD.md.
Publish main checkpoint/latest pointers and mobile-friendly primary PNG.

REPORT:
agent-handoffs/reports/<timestamp>-operating-plan-edit-strategy-verification.md

STOP when all actual edit flows are source-audited, rendered dark/light, mutation parity proven and ready for Founder review.

END TASK.
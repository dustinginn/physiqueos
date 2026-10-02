Native Build 80 — Home Screen widget numeric formatting polish

TASK TYPE

Tiny Native-only release patch.

No new product scope.
No Server data mutation.
No canonical precision change.

READ FIRST

Build 79 final:
agent-handoffs/reports/20261002T040500Z-native-build79-widget-priority-skip-integration.md

Home widget implementation:
agent-handoffs/reports/20261002T023151Z-home-screen-widget-v1-implementation.md

Backlog:
agent-handoffs/backlog/PHYSIQUEOS_PRODUCT_BACKLOG.md

GH protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

BASE

Exact Build 79 shipping source:
a75f93df1a84c33bbe6e9cec6d648a11ec53031d

Build 79 is VALID.

FOUNDER PHYSICAL FEEDBACK

Build 79 Home Screen widget is working on the physical device.

Founder wants one presentation change:

Nutrition and Activity should NOT display decimal fractions in Home Screen widgets.

Weight SHOULD retain one decimal.

Current physical example:
Nutrition 2463.3 cal
P 182.2 C 166.7 F 110.1
Active 890.1 cal
Weight 176.1 lb

Desired display:
Nutrition 2,463 cal
P 182 C 167 F 110
Active 890 cal
Weight 176.1 lb

This is DISPLAY-ONLY rounding/formatting.

A. CANONICAL DATA MUST REMAIN PRECISE

Do not change:
- Server values;
- HealthKit values;
- snapshot stored numeric precision unless technically unavoidable;
- Nutrition canonical totals;
- Activity canonical totals;
- Evidence;
- History;
- coaching/V3;
- calculations.

Prefer keeping snapshot numeric values at existing precision and formatting only at the widget presentation layer.

B. CENTRAL WIDGET FORMATTER

Audit every Home Screen widget rendering path and centralize numeric formatting so rules cannot drift between families/states.

Required rules:

Calories eaten:
- display whole number;
- locale-aware grouping where appropriate;
- e.g. 2463.3 -> 2,463 cal.

Protein:
- whole grams;
- normal nearest-whole display rounding;
- 182.2 -> 182.

Carbs:
- whole grams;
- 166.7 -> 167.

Fat:
- whole grams;
- 110.1 -> 110.

Active calories:
- whole number;
- locale-aware grouping;
- 890.1 -> 890 cal.

Weight:
- preserve one decimal;
- 176.1 -> 176.1 lb.
- Do not change current Weight semantics.

Missing:
- remain — / existing missing-state copy;
- never become 0.

C. APPLY TO ALL HOME SCREEN WIDGETS

Apply consistently to every Home Screen widget family/configuration/state that displays these values:

- systemSmall primary square;
- systemLarge Logged Today alternate;
- full current-day;
- no-weight;
- active-workout/Resume;
- stale/offline;
- waiting-for-today;
- privacy/redacted where actual values are represented before redaction;
- any shared preview/shipping render helper.

If a medium/future family already exists in code but is not currently supported, ensure it consumes the shared formatter rather than duplicating formatting.

Do NOT change Live Activity load/reps formatting. This task is Home Screen widgets only.

D. ROUNDING

Use standard display rounding appropriate to the existing platform formatter (nearest whole), not truncation.

Tests should explicitly cover:
- x.0;
- x.1;
- x.49;
- x.5;
- x.9;
- thousands grouping;
- zero where zero is genuinely canonical;
- nil/missing;
- Weight one-decimal preservation.

Use locale-stable assertions where necessary.

E. VISUAL REGRESSION

Regenerate all shipping Home widget renders from exact patched code.

Confirm:
- no Nutrition decimal;
- no macro decimal;
- no Activity decimal;
- Weight still one decimal;
- no truncation/overflow introduced by grouped values;
- Start/Resume/refresh unchanged;
- small and large layouts otherwise identical.

F. REGRESSION

Run:
- HomeWidgetTests;
- snapshot tests;
- shipping render tests;
- release verifier;
- Widget extension compile;
- focused Live Activity extension regression to ensure the shared extension still builds/works.

No need to rerun unrelated heavy Server suites.

Run full Native suite if inexpensive and disk remains healthy; otherwise the focused changed-surface suite plus Release archive is sufficient for this tiny formatting patch, with exact documentation.

G. BUILD

Reverify Build 79 is latest uploaded.

If so:
- bump once to Build 80;
- archive Release;
- verify app/extension version parity;
- verify App Group remains on app + extension;
- extension remains HealthKit-free;
- app retains HealthKit;
- Live Activity + Home widget coexist;
- guarded release dry-run;
- upload Build 80;
- wait for VALID.

No browser login.
Use established signing state.
Stop if Apple authentication unexpectedly requires Founder action.

H. BACKLOG

After VALID:
- update Home Widget V1 status to Build 80 formatting-polished / physical acceptance pending for remaining behavior;
- record Build 79 physical acceptance finding that triggered this patch;
- do not reopen unrelated Build 79 items.

I. REPORT

Publish:
agent-handoffs/reports/<timestamp>-native-build80-widget-number-formatting.md

Include:
- exact base/candidate;
- formatter rules;
- tests;
- shipping render confirmation;
- archive/signing;
- delivery id;
- VALID;
- minimal Founder acceptance: verify small + large show whole Nutrition/Activity/macros and one-decimal Weight.

Follow mandatory GH-main protocol before every stop.

END TASK.

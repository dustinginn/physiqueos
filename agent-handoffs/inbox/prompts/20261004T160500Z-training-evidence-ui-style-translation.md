PhysiqueOS utility design track — lock Watch/Live Activity/Logger + Training Evidence hierarchy styling translation

TASK TYPE

Continue in Codex B / the EXISTING utility-surface Codex chat.
Use High reasoning.

This is a design-system translation task.

Do not modify shipping Native UI.
Do not create TestFlight.
Do not change Server behavior.
Do not change evidence contracts, Training canonical data, HealthKit semantics, exercise identity, records semantics, navigation destinations or historical data.

PART A — FOUNDER LOCK DECISIONS

The Founder reviewed the focused acceptance corrections.

WATCH
LOCKED design direction.

Accepted:
- utility visual translation;
- current production metric icons and intentional per-metric colors retained on Workout Metrics and Daily Totals;
- all other accepted Watch styling;
- dark/mineral-light review direction where applicable.

LIVE ACTIVITY / DYNAMIC ISLAND
LOCKED design direction as previously presented.

No changes requested.

LOGGER
LOCKED design direction.

Accepted:
- utility visual translation;
- larger existing Done checkbox/checkmark completion control restored;
- all other accepted Logger styling;
- dark + mineral light.

Record:
Watch = locked.
Live Activity = locked.
Logger = locked.
Implementation has NOT started merely because design direction is locked.

Do not reopen these surfaces.

PART B — NEXT SURFACE FAMILY

Now style:

TRAINING EVIDENCE
and ALL Training Evidence subpages/drill-down surfaces.

Founder direction:

"The evidence pages are mostly just data driven, they don’t need to be redesigned but simply styled in the new style."

Interpret literally.

This is NOT an information-architecture redesign.

Preserve the existing Training Evidence hierarchy and behavior.

Apply the new PhysiqueOS visual system cleanly and consistently.

SOURCE AUDIT FIRST — REQUIRED

Inspect exact current Build 85 Native authority and inventory the complete Training Evidence navigation tree.

Start from:
Evidence tab / Evidence Hub
→ Training
→ Training history
→ Training day
→ session
→ exercise detail / performance/history
→ any additional Training-specific drill-down.

Audit current source rather than relying on this prose.

Inventory ALL Training Evidence screens/states, including where present:

TRAINING ROOT / HISTORY
- Training Evidence landing/root;
- chronological history;
- date grouping;
- workout/session summaries;
- strength/cardio distinctions;
- Apple Health cardio;
- Logger sessions;
- empty/loading/error states.

TRAINING DAY
- day summary;
- multiple sessions in one day;
- Strength;
- Cardio;
- Cooldown if shown historically;
- activity/workout metadata;
- session navigation;
- provenance/source labels.

SESSION DETAIL
- structured strength session;
- Apple Health workout/cardio session;
- workout duration;
- exercise list;
- supersets;
- variants;
- timed/bodyweight/weighted-bodyweight;
- set summaries;
- source/provenance;
- evidence/reconciliation state if surfaced.

EXERCISE DETAIL
- exercise identity;
- category;
- history;
- current performance records;
- Session Volume record;
- Reps at Load records;
- historical events;
- recent session performance;
- set history;
- variants/aliases if currently visible;
- charts/trends if present;
- empty states.

PERFORMANCE RECORDS
- current record per type/exercise identity;
- Session Volume;
- Reps at Load;
- record comparison/delta;
- historical record events if surfaced.

CARDIO
- HealthKit cardio workout detail;
- workout type;
- duration;
- calories/heart rate/distance/elevation/etc only where current contract actually exposes them;
- source;
- strategic/evidence labels only if current product already shows them.

OTHER TRAINING SUBPAGES
Audit and include any current Training Evidence page not listed above.

Do not omit a page because it seems redundant.

COVERAGE MATRIX — REQUIRED

Before designing, create:

Screen/state | Current source component | Data shown | Navigation in/out | Proposed styling template | Mocked? | Covered?

Every Training Evidence screen/state must be covered.

Near-identical states may share a template, but nothing may be uncovered.

DESIGN INTENT

These pages are DATA-DRIVEN UTILITY/REFERENCE surfaces.

Do not dramatically redesign.

Target:
- 80% visual-system translation;
- 15% spacing/typography cleanup;
- 5% conservative usability cleanup.

Preserve:
- information architecture;
- ordering;
- data density;
- navigation;
- drill-down depth;
- charts;
- tables/lists;
- record semantics;
- source semantics.

Do not:
- invent new summaries;
- rewrite canonical labels;
- collapse useful history;
- remove data;
- add coaching interpretation;
- change strategic meaning;
- add new interactions merely for aesthetics.

NEW VISUAL SYSTEM

Use locked PhysiqueOS direction.

DARK
- deep navy page base;
- navy/teal surfaces;
- restrained purple;
- semantic green/amber/teal;
- high-contrast text;
- border/divider-driven hierarchy;
- selective contained surfaces;
- minimal shadow.

MINERAL LIGHT
- warm/mineral base;
- ink/navy text;
- pale teal/mineral surfaces;
- selective stronger fields to prevent wall-of-white;
- restrained purple;
- semantic colors;
- border-driven depth;
- minimal shadow.

Do not make every data row a card.

Use:
- open lists;
- section fields;
- compact analytical rows;
- thin dividers;
- grouped metrics;
- selective cards only when containment adds meaning.

STANDING DARK/LIGHT RULE

Render BOTH dark and mineral-light for all iPhone/iOS product-owned surfaces.

Do not omit light.

Dark/light must have identical:
- content;
- navigation;
- geometry;
- data;
- chart semantics;
- conditional states.

Only appearance tokens differ.

TRAINING ROOT / HISTORY STYLING

Preserve current chronological organization.

Improve:
- date hierarchy;
- session identity;
- Strength vs Cardio distinction;
- duration/metadata scanability;
- source/provenance treatment;
- compactness.

Use semantic icon/color differences where current product already has meaningful distinctions.

Do not over-card each history row.

TRAINING DAY

This is an analytical drill-down.

Preserve all sessions and exact order.

Use:
- strong date/day header;
- compact session blocks;
- clear Strength/Cardio identities;
- source/provenance visually quiet but available;
- consistent metric typography.

If multiple workouts exist, make them easy to distinguish without huge vertical gaps.

SESSION DETAIL

Preserve exact exercise/set structure.

Use accepted Logger visual language where it helps continuity:
- exercise identity;
- set table;
- reps/load;
- timed/bodyweight variants;
- superset relationship.

BUT:
Training Evidence session detail is READ-ONLY history.

Do not make read-only rows look editable.

Do not carry Logger input controls into Evidence.

Use analytical/read-only styling.

EXERCISE DETAIL

This is especially data-heavy.

Preserve all current records/history.

Improve:
- current record hierarchy;
- recent performance;
- historical context;
- chart/trend styling;
- set-history readability.

Performance Records should feel important without becoming celebratory UI.

Use semantic green for improvement where canonical data supports it.

Do not imply a new record where none exists.

PERFORMANCE RECORDS

Respect normalized current-record semantics already implemented:
- one current record per type and canonical exercise identity;
- Session Volume;
- Reps at Load;
- historical events untouched.

Do not regress identity matching.

This task is styling only.

If current source still exposes any known correctness discrepancy:
document it;
do not "fix" data in the design harness.

CHARTS / GRAPHS

Preserve every existing Training Evidence graph and underlying data.

Restyle to new dark/mineral-light tokens.

Allowed:
- line/bar colors;
- grid;
- axis typography;
- container surface;
- legend;
- marker styling.

Not allowed:
- changing chart type if it changes meaning;
- changing values;
- dropping points;
- inventing trends.

If a page has data that is currently text-only, do NOT invent a graph merely because it could look nice.

SOURCE / PROVENANCE

Keep provenance available but visually quiet.

Use the recently accepted Log principle where appropriate:
avoid repeating "Apple Health" excessively if a scoped source treatment can accurately communicate provenance without changing behavior.

However:
do NOT alter actual production source contract.

If provenance is per-session and differs across rows, keep it close enough to avoid ambiguity.

Do not centralize source labels if doing so would make attribution unclear.

COOLDOWN

Preserve current product semantics:
Cooldown may appear in Training/Activity history as "Cooldown" if canonical history contains it.

Cooldown is NOT Cardio.

Do not:
- count it as Cardio;
- color/style it as Cardio;
- include it in Cardio totals;
- imply strategic Cardio meaning.

STAIR STEPPER / CARDIO

Canonical Cardio such as Stair Stepper should retain Cardio identity.

Use the new semantic styling consistently.

ACCESSIBILITY

Audit:
- Dynamic Type;
- VoiceOver order;
- read-only vs interactive distinction;
- chart summaries;
- contrast;
- non-color cues;
- touch targets for drill-down rows;
- long exercise names;
- large values;
- landscape not required unless current product supports it.

No tiny type to preserve density.

REPRESENTATIVE MOCKUP SET

Founder does not need every near-identical historical row.

Render enough screens to prove every materially distinct template.

At minimum:

T1. Training Evidence root/history
T2. Training history with mixed Strength + Cardio days
T3. Training Day with multiple sessions
T4. Structured Strength session detail
T5. Strength session showing superset/variant/timed/BW if materially distinct
T6. Cardio/Apple Health workout detail
T7. Exercise Detail
T8. Exercise Detail with current Performance Records
T9. Session Volume record presentation
T10. Reps-at-Load record presentation
T11. historical set/session history
T12. empty/loading/error representative states if materially different

If source audit finds additional unique pages/templates, add them.

Render ALL key screens in:
- dark;
- mineral light.

OUTPUT

Produce:

1. Training Evidence coverage board — dark
2. Training Evidence coverage board — mineral light
3. full-resolution key screens dark/light
4. navigation-tree diagram/documentation
5. coverage matrix
6. token/component mapping
7. implementation feasibility notes
8. parity/validation result

Founder review should be easy:
group artifacts by navigation depth:
Root
→ Day
→ Session
→ Exercise
→ Records.

Do not overwhelm with redundant variants.

PARITY VALIDATION

Require:
- exact current data fields;
- exact navigation tree;
- zero invented values;
- zero removed data;
- Strength/Cardio semantics exact;
- Cooldown non-Cardio exact;
- Performance Record semantics exact;
- charts/data exact;
- dark/light content parity exact;
- read-only Evidence surfaces remain visually read-only.

IMPLEMENTATION FEASIBILITY

Document:
- current files/components;
- reusable new utility tokens/primitives from locked Logger;
- Training Evidence-specific primitives;
- hard-coded styling blockers;
- complexity;
- regression risk;
- tests/snapshots needed.

Do not implement.

SHIPPING ISOLATION

No shipping source changes.
No Server changes.
No evidence contract changes.
No HealthKit changes.
No record/data mutations.
No build number.
No TestFlight.
No global theme implementation.

Disposable design harness only.

LOCK STATUS

Watch:
LOCKED.

Live Activity:
LOCKED.

Logger:
LOCKED.

Training Evidence:
EXPLORATION pending Founder review.

BACKLOG

Update App-wide UI/design polish:
- Watch locked;
- Live Activity locked;
- Logger locked;
- Training Evidence styling translation ready for Founder review when complete;
- implementation not started.

REPORT

Publish:
agent-handoffs/reports/<timestamp>-training-evidence-ui-style-translation.md

Include:
- exact Native authority;
- complete navigation/source audit;
- coverage matrix;
- artifact paths;
- dark/light parity;
- semantic checks;
- accessibility;
- implementation complexity;
- confirmation no shipping source changed.

STOP after the complete Training Evidence hierarchy is covered and review artifacts are ready.

END TASK.

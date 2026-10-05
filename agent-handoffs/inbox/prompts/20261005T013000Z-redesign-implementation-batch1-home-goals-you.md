PhysiqueOS locked redesign implementation Batch 1 — Home + Goals + You/Settings shell

TASK TYPE

Continue in Codex A / existing PhysiqueOS implementation chat.
Use High reasoning.
Same chat.

The app-wide redesign is Founder-locked and DESIGN COMPLETE.

Build 86 is now Apple VALID and establishes the current Native integration authority:
cec8af20a6121bb66ecca3ba9f667d91774a891c
Version 1.0 (86)

Build 86 includes:
- global System / Dark / Mineral Light appearance infrastructure;
- narrow You -> Settings -> Appearance;
- accepted Foam Rolling Priority Detail pilot;
- Watch/HealthKit fixes;
- current extensions.

This task begins broad implementation of the locked redesign.

IMPLEMENTATION BATCH 1

Implement the complete locked redesign families for:

1. Home
2. Goals
3. You / Settings shell

Do not implement Log, Training Logger, Evidence, remaining Priority Detail, Operating Plan, Briefings or widgets in this batch except where a shared component must be made reusable without changing those surfaces.

SOURCE AUTHORITY FIRST

Reverify current Native authority before coding.

Use Build 86 combined head as the integration base. If a newer authorized Native head exists, stop and reconcile rather than silently choosing one.

Audit the exact current routes/data contracts for Home, Goals and You/Settings before implementation.

DESIGN AUTHORITY

Use the Founder-accepted locked design artifacts/reports for:
- Home;
- Goals / Your Journey / completed Goal detail;
- You;
- Settings shell;
- Appearance;
- any Profile/Data Sources rows shown in the accepted design.

Do not reinterpret the designs.
Do not create a new visual direction.
Do not use the temporary old-geometry global-appearance screenshots as redesign authority; those were infrastructure validation only.

Where design artifacts and canonical behavior differ, canonical behavior/data contract wins and the discrepancy must be surfaced.

HOME

Implement the complete locked Home family and its materially distinct current states.

Preserve:
- canonical phase/Goal content;
- two phase cards + guardrail behavior where current authority requires it;
- confidence projection and current server-owned explanation;
- Training Today semantics including cardio + strength;
- briefing visibility/persistence rules;
- priorities;
- current navigation/deep links;
- loading/error/empty behavior;
- any current Morning Check-In entry behavior.

Do not implement unrelated Briefing content redesign inside Home.

GOALS

Implement the complete locked Goals family:
- Goals root;
- Your Journey;
- active Goal;
- completed Goal;
- progress bars/treatments;
- completed Visible Abs first/last real progress photos where current canonical data provides them;
- locked Goal detail hierarchy and navigation;
- current phase/goal history semantics.

Do not fabricate photos or progress values.

YOU / SETTINGS SHELL

Implement the locked You redesign and the accepted Settings shell.

Build 86 already has the narrow Appearance route. Preserve and integrate it into the final locked shell.

Implement only destinations whose product contracts are ready.

Important deferred beta architecture remains deferred unless already safely read-only:
- Profile write contract;
- Data Sources projection;
- Sign Out coordinator.

Do not add dead tappable rows.

If the locked design visually contains a row whose destination is not yet implemented, use the accepted non-dead presentation treatment from design authority or surface the dependency. Do not invent placeholder navigation or Coming Soon.

Appearance remains exactly:
System / Dark / Light
where Light = Mineral Light.

GLOBAL THEME

Use the Build 86 global semantic theme infrastructure.

Every implemented surface must match the locked designs in:
- Dark;
- Mineral Light;
- System resolved dark/light.

Do not create local competing theme systems.

SHARED COMPONENTS

Extract/reuse components only when it materially improves parity and future rollout:
- section headers;
- cards;
- progress treatments;
- status chips;
- navigation chrome;
- row treatments;
- empty/loading/error states.

Avoid premature abstraction that changes locked geometry.

VISUAL PARITY GATE

For every materially distinct implemented surface:
- capture real iPhone simulator Dark and Mineral Light screenshots;
- compare against the exact locked design at equivalent geometry;
- correct mismatches before stopping.

Do not accept “all fields present” as parity.

Validate:
- hierarchy;
- spacing;
- typography;
- card geometry;
- section order;
- progress visuals;
- image treatment;
- navigation;
- controls;
- semantic colors;
- scroll behavior.

CONTENT / DATA PARITY

Use real fixture/canonical content representative of production contracts.

Preserve exact:
- labels;
- values;
- units;
- ordering;
- provenance;
- status semantics;
- Goal/phase state;
- confidence ownership;
- dates;
- photo mapping.

Do not hard-code Founder production values into shipping views.

BEHAVIOR PARITY

Validate:
- all navigation;
- Home -> Goal/Briefing/Priority/Training destinations;
- Goals root/detail/completed navigation;
- You -> Settings -> Appearance;
- back navigation;
- conditional sections;
- loading/error/empty;
- dynamic appearance switching;
- persistence.

ACCESSIBILITY

Maintain Dynamic Type feasibility, VoiceOver labels/selected states, non-color-only status, and >=44 pt interactive targets.

TESTS

Add/update deterministic tests for changed workflows and appearance behavior.

Run:
- focused Home tests;
- focused Goals tests;
- focused You/Settings/Appearance tests;
- relevant shared component tests;
- UI parity tests/captures;
- full relevant Native unit suite;
- Release generic iOS compile including Watch/Live Activity/widget dependency graph.

Known pre-existing failures from Build 86 must be classified, not silently expanded.

WATCH / WORKOUT SAFETY

Do not modify the Build 86 Watch/HealthKit workout behavior unless compilation requires a mechanical integration change.

Build 86 Watch physical acceptance remains separate.

Do not touch Server.

IMPLEMENTATION DELTA LEDGER

Review agent-handoffs/DESIGN_IMPLEMENTATION_DELTA_LEDGER.md.

Resolve only implementation deltas genuinely completed by this batch.
Do not close Profile/Data Sources/Sign Out if their underlying contracts remain deferred.
Do not close unrelated design families.

REVIEW ARTIFACTS

Founder wants fast mobile review.

Publish:
1. one primary mobile board covering Home + Goals + You/Settings;
2. focused Home board;
3. focused Goals board;
4. focused You/Settings board;
5. real simulator Dark/Mineral pairs beside locked references;
6. concise parity matrix;
7. exact implementation commit.

Artifacts must be main-visible before reporting links.

TESTFLIGHT

Do not upload a new TestFlight build in this task.

This family will be batched with subsequent accepted implementation families unless physical validation reveals a reason for an earlier build.

OUTPUT

Publish a concise implementation report using the normal reporting standard.

State:
- exact base authority;
- implementation head;
- surfaces implemented;
- design authorities used;
- parity status;
- tests;
- Release compile;
- unresolved dependencies;
- recommended next implementation family.

STOP when Home + Goals + You/Settings are implemented to locked visual/content/behavior parity, artifacts are published, and the family is ready for Founder review.

END TASK.
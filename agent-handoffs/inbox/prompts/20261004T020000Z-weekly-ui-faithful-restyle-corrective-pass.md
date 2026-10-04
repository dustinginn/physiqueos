PhysiqueOS Weekly Briefing UI — corrective pass with ZERO content/structure changes

TASK TYPE

Codex visual-restyling exploration only.

This supersedes the prior Weekly UI exploration as design authority.

The prior Weekly mockups are REJECTED as design candidates.

Do not iterate those mockups.

The prior source audit is useful and may be reused, but the visual designs themselves must be discarded.

FOUNDER HARD REQUIREMENT

"I literally don’t want any change in content. I’ve worked hard to tune that."

Interpret this literally.

Codex has ZERO authority in this task to redesign, reorganize, summarize, rewrite, condense, expand, regroup, rename, reorder, reinterpret or replace Weekly Briefing content or information architecture.

The existing production Weekly Briefing is the immutable content AND structural template.

This is a VISUAL SKIN / PRESENTATION RESTYLE only.

LOCKED APP DESIGN REFERENCES

Home:
design direction locked, dark + mineral-light selected pair.

Log:
design direction locked, Compact Command Center middle option, dark + mineral-light.

Use those only as visual-system references for:
- palette;
- typography styling;
- surfaces;
- borders;
- spacing polish;
- semantic accents;
- light/dark appearance.

Do NOT import Home/Log information architecture into Weekly.

WHY THE PREVIOUS PASS FAILED

The prior exploration technically preserved semantic fields but changed the briefing product.

It:
- reorganized content around Result/Meaning/Action/Watch;
- introduced new presentation constructs such as command/executive/chapter framing;
- changed the existing reading flow;
- removed or failed to preserve graphs/charts;
- altered section grouping;
- produced a wall-of-text presentation;
- visually obscured the tuned domain structure.

That is not acceptable.

"All semantic fields are present" is NOT sufficient content parity.

We require:
CONTENT PARITY
+
STRUCTURAL PARITY
+
ORDER PARITY
+
VISUALIZATION PARITY
+
CONDITIONAL-SECTION PARITY.

SOURCE AUTHORITY

Reinspect current shipping Native Weekly implementation at Build 85 authority:
b8ee8690b194cb90086b62816b9a2c8c400dc026

Relevant source identified in prior audit includes:
- ios/PhysiqueOS/Presentation/Briefings/BriefingDetailView.swift
- ios/PhysiqueOS/Presentation/Briefings/WeeklyBriefingSections.swift
- ios/PhysiqueOS/Presentation/Briefings/BriefingPresentation.swift
- ios/PhysiqueOS/Contracts/BriefingReadModel.swift
- ios/PhysiqueOS/Networking/ProductionBriefingMapper.swift
- current fixtures/tests.

Server/current canonical projection remains authoritative for content.

The prior source audit correctly established current Weekly ordering as:

1. Integrated lead: headline, body, exact server-owned Confidence and strategy strip.
2. Energy.
3. Weight.
4. Photos when present.
5. Training.
6. Body Composition when present.
7. Material uncertainty when Server marks it for surfacing.
8. Coach's Take and Into Next Week.

VERIFY THIS AGAIN FROM CURRENT SOURCE before rendering.

If source has changed, use current source—not this prose list.

IMMUTABLE TEMPLATE RULE

Take the actual current production Weekly screen/components as the wireframe.

For every existing production element:

KEEP IT.

That includes, without limitation:
- exact section order;
- exact section names;
- exact copy;
- exact narrative blocks;
- exact cards;
- exact metrics;
- exact charts;
- exact graphs;
- exact chart series;
- exact chart ordering;
- exact data labels;
- exact evidence/domain grouping;
- exact Confidence content;
- exact Confidence explanation/detail;
- exact recommendation/current-strategy presentation content;
- exact Body Composition content;
- exact Energy content;
- exact Weight content;
- exact Training content;
- exact Photo content;
- exact uncertainty behavior;
- exact Coach's Take content;
- exact Into Next Week content;
- exact provenance/coverage content;
- exact conditional visibility rules;
- exact navigation destinations;
- exact loading/not-ready/unavailable/failure semantic states.

Do not replace a graph with text.
Do not replace text with a graph.
Do not merge cards.
Do not split one canonical section into new editorial chapters.
Do not move content between sections.
Do not promote supporting evidence into the hero.
Do not demote hero content into later sections.
Do not turn narrative into bullets unless production already does.
Do not turn bullets into prose unless production already does.
Do not add new explanatory headings.
Do not remove headings.
Do not rename headings.
Do not shorten copy.
Do not rewrite copy.
Do not invent copy.

NO NEW INFORMATION ARCHITECTURE

Forbidden examples:
- "Executive Brief";
- "Weekly command view";
- numbered chapters;
- newly invented "Evidence underneath";
- newly invented section hierarchy;
- combining domains;
- moving Confidence;
- moving Coach's Take;
- moving What To Watch/Into Next Week;
- converting current cards into a different content model.

The task is not to improve the briefing logic.

The briefing logic/content is already tuned and is OUT OF SCOPE.

GRAPHS / CHARTS — HARD GATE

The Founder specifically observed that graphs disappeared in the rejected mockups.

Before designing:
1. inventory EVERY graph/chart/visualization in the current production Weekly;
2. record its source component;
3. record its position in the page;
4. record its input/series/labels;
5. record conditional rendering behavior.

Every production graph/chart MUST appear in the redesigned mockup:
- same section;
- same semantic data;
- same series;
- same labels;
- same meaning.

Visual styling may change to fit dark/mineral-light tokens:
- line weight;
- grid color;
- surface color;
- typography styling;
- accessible series colors;
- container styling.

Data and chart semantics may NOT change.

If any existing graph is absent, the render FAILS.

RECOVERY — ONE AND ONLY STRUCTURAL EXCEPTION

Recovery is the ONLY authorized additive structural change.

Existing architecture already plans future Recovery after Training and before Body Composition/Coach interpretation.

Insert a Recovery section in that canonical future location.

Do not move any existing section to accommodate it beyond the natural insertion.

Recovery remains FUTURE CONTRACT / DESIGN FIXTURE unless production has legitimately graduated by the time this task runs.

Do not activate Recovery.
Do not change strategic eligibility.
Do not couple Recovery to Confidence.
Do not invent current Founder Recovery conclusions.

Use the planned Recovery Briefing V1 contract as the content authority for the Recovery mock section.

Clearly distinguish fixture-only data in design documentation.

The rendered design may show a realistic Recovery section to prove layout, but do not claim it is current production output.

VISUAL CHANGES THAT ARE ALLOWED

Codex MAY change only visual presentation properties such as:

- dark/mineral-light palette;
- background colors;
- surface colors;
- border colors;
- border widths;
- corner radii;
- shadows if any;
- internal padding;
- inter-section spacing;
- typography font size within legibility constraints;
- typography weight;
- typography color;
- line height;
- icon style/color;
- chart styling without semantic/data changes;
- divider styling;
- card chrome;
- semantic accent colors;
- visual emphasis within the SAME content hierarchy.

Even typography changes must not alter meaning or hierarchy.

If changing font size causes content truncation or changes information visibility, do not make that change.

VISUAL CHANGES THAT ARE NOT ALLOWED

Do NOT:
- reorder;
- regroup;
- summarize;
- rewrite;
- add new content;
- remove content;
- rename content;
- change graph type;
- remove graph;
- add graph not already present;
- change chart data;
- change conditional logic;
- change domain ordering;
- change navigation;
- change interaction behavior;
- change expansion/collapse semantics;
- change canonical Confidence presentation content;
- change V3 fail-closed behavior.

BASELINE CAPTURE — REQUIRED

Before creating new mockups, render/capture the ACTUAL current production Weekly briefing using the same realistic fixture and target dimensions.

This becomes BASELINE.

Produce an annotated structural inventory:

For each item in order:
- production component;
- canonical content;
- conditional rule;
- visualization if any;
- position/order index.

Assign stable IDs:
W01, W02, W03, etc.

The redesigned render must map 1:1:
W01 -> W01
W02 -> W02
...
with the sole inserted Recovery item clearly identified as R-FUTURE.

PARITY VALIDATOR — REQUIRED

Build a deterministic validation manifest.

For each redesigned appearance verify:

CONTENT:
- exact canonical strings;
- exact metric values;
- exact labels.

ORDER:
- all W IDs in identical sequence.

STRUCTURE:
- same parent section/domain assignment.

VISUALIZATIONS:
- every production chart present;
- same chart semantic type;
- same data/series/labels;
- same section.

CONDITIONALS:
- same present/absent behavior for Photos, Body Composition, uncertainty, etc.

NAVIGATION:
- same destinations.

RECOVERY:
- exactly one additive R-FUTURE section at approved location;
- clearly fixture-only;
- no Confidence coupling.

FAIL the design if any parity check fails.

Do not accept "89/89 fields present" as sufficient.

VISUAL DIRECTION

Do NOT produce three new briefing architectures.

Produce ONE faithful Weekly structure in TWO appearances:

1. Dark
2. Mineral Light

Both use the locked Home/Log visual language.

The question being answered is:

"What does the existing Weekly Briefing look like when restyled into the new PhysiqueOS visual system?"

NOT:

"How should Weekly Briefing be redesigned?"

DARK

Translate using:
- deep navy base;
- teal/navy surfaces where current cards/sections already exist;
- restrained purple;
- semantic green/amber/teal;
- high-contrast long-form typography;
- chart colors adapted for dark;
- subtle borders/dividers.

Do not over-card the page.

MINERAL LIGHT

Translate using:
- warm/mineral base;
- ink/navy typography;
- pale teal/mineral existing surfaces;
- restrained purple;
- semantic colors;
- chart colors adapted for light;
- border-driven hierarchy.

Do not turn every section into a white card.

LONG-FORM LEGIBILITY

Weekly is allowed to be long.

Do not shrink text to reduce page length.

Preserve comfortable body reading size and line height.

Render the entire page.

Provide:
- full long-page dark;
- full long-page light;
- top viewport pair;
- each graph/chart viewport pair;
- Recovery viewport pair;
- Confidence viewport pair if not already captured;
- Coach's Take / Into Next Week footer pair.

CURRENT REAL CONTENT

Prefer an actual existing current/most-recent production Weekly fixture already used by Native tests or a faithful snapshot of an actual published Weekly.

Do not invent a new Weekly narrative for this design exercise.

If production data cannot safely be loaded directly, use an existing repository fixture that mirrors the production Weekly.

Do not use the rejected Round-1 Weekly fixture if it reorganizes content.

The fixture must map directly onto the actual Native Weekly components in actual order.

RECOVERY FIXTURE

Recovery fixture may be synthetic only because it is the explicitly approved future additive section.

Everything else must be actual existing Weekly content/fixture.

LOCKED HOME / LOG

Do not revisit Home.
Do not revisit Log.

Record:
Home = design direction locked.
Log = Compact Command Center dark + mineral light design direction locked.

This task only addresses Weekly visual styling.

SHIPPING ISOLATION

No shipping code changes.
No Server changes.
No global theme implementation.
No build-number change.
No TestFlight.
No Recovery activation.
No policy changes.

Use disposable design harness only.

REPORT / ARTIFACTS

Store artifacts under a NEW corrective Weekly directory.

Do not overwrite the rejected mockups; retain them only as historical rejected artifacts.

Publish:
agent-handoffs/reports/<timestamp>-weekly-ui-faithful-restyle-corrective-pass.md

Report must include:
- exact Native authority;
- actual production Weekly structural inventory;
- graph/chart inventory;
- W-ID mapping;
- parity validator result;
- Recovery insertion location;
- fixture provenance;
- dark artifact paths;
- light artifact paths;
- confirmation that no content/order/structure/graph semantics changed;
- confirmation shipping code unchanged.

BACKLOG

Update:
- prior Weekly UI exploration = REJECTED by Founder because it changed content/structure and removed graphs;
- Weekly corrective faithful-restyle pass = ready for Founder review when complete;
- Home locked;
- Log locked;
- Recovery remains required future additive section.

STOP after the faithful dark/light restyle artifacts are ready.

END TASK.

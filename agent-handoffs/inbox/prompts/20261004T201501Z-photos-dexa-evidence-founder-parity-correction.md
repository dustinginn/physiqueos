PhysiqueOS Evidence — Founder correction pass for Progress Photos and DEXA

TASK TYPE

Continue in Codex B / existing Evidence design chat.
Use High reasoning.

Founder has reviewed the final Evidence package.

LOCKED / ACCEPTED — DO NOT REOPEN:
- Evidence Hub design and ordering;
- Timeline at absolute bottom;
- Health Metrics placeholder removed;
- Timeline page;
- Training Evidence;
- Nutrition Evidence;
- Activity Evidence;
- Energy Evidence;
- Weight Evidence;
- Recovery Evidence.

Only Progress Photos Evidence and DEXA Evidence require correction before lock.

No shipping implementation yet.

PART A — PROGRESS PHOTOS: PRODUCTION STRUCTURAL PARITY

Founder compared the mockups directly against the current production Native app and found substantive parity loss.

The accepted new visual language is good, but production Photos must be the STRUCTURAL / INTERACTION authority.

The previous design audit was too weak because it proved fields existed without preserving their prominence, grouping and workflow.

PARITY DEFINITION

Parity includes:
- content;
- ordering;
- visual prominence;
- grouping;
- media placement;
- navigation;
- disclosure behavior;
- actions;
- workflow;
- interaction;
- conditional states.

"All fields represented" is NOT sufficient.

PRODUCTION FLOW TO PRESERVE

Progress Photos root:
- Evidence Report / Progress Photos identity;
- Viewing Goal scope;
- Latest Photo Set as a prominent visual module;
- real/current photo thumbnail where safe and available;
- set date;
- view count;
- comparison availability;
- clear Open Gallery action;
- prominent full-width Read Photo Briefing action when published;
- Uploaded Photos history with actual thumbnails;
- Show All;
- rows preserve date/view count/comparison context and View action.

Do not reduce Photo Briefing to a minor list row.
Do not reduce Uploaded Photos to text-only rows.

PHOTO SET / GALLERY DETAIL

Production screenshots prove this is a rich visual comparison experience.

Preserve:
- selected canonical pose;
- Previous image and Current image shown simultaneously;
- Previous/Current labels;
- both dates;
- Interpretation;
- Capture Conditions;
- Source History disclosure;
- Previous / Next navigation through canonical poses;
- current set/session context;
- exact pose ordering;
- image expansion affordance where production provides it.

Do not describe Photos Evidence globally as a one-photo-at-a-time experience.

Distinguish:
1. the paired pose comparison/detail composition already present in Evidence;
2. the full-screen image inspection behavior when a specific image is expanded.

MEDIA INTERACTION AUDIT

Source-audit exact production behavior for:
- tapping Latest Photo Set;
- Open Gallery;
- tapping Uploaded Photos row/View;
- pose Previous/Next;
- tapping Previous image;
- tapping Current image;
- zoom/pan/full-screen;
- dismiss/reset;
- retry/failure;
- Source History.

Render the actual hierarchy.

PHOTO BRIEFING DISTINCTION

Photo Evidence remains distinct from Photo Briefing.

However, production Evidence may link prominently to the published Photo Briefing. Preserve that link/action.

The future Photo Briefing simultaneous comparison viewer requirement in the delta ledger remains separate unless source proves shared implementation.

MEDIA FOR MOCKUPS

Use safe existing app-rendered Founder media only if the current design harness can access it truthfully with correct dates/roles.

Otherwise use obvious placeholders, but preserve the exact image geometry and workflow.

Do not bind unrelated real images to synthetic dates.

PHOTOS REVIEW OUTPUT

Render dark + mineral light:
1. corrected Photos root;
2. Uploaded Photos expanded/Show All;
3. Gallery/pose comparison detail;
4. Source History expanded if materially distinct;
5. full-screen image inspection interaction representation if distinct;
6. media retry/failure only if materially distinct.

Create a Photos production-parity matrix:
Production section/action | order | prominence | interaction | target design | source proof

PART B — DEXA: ORDER + DISCLOSURE/GRAPH PARITY

Founder considers DEXA mostly there visually but is concerned about:
- exact card/section ordering;
- whether every graph/data family survives;
- whether every Show All expanded disclosure is represented faithfully.

Keep the current DEXA styling direction.

Do NOT redesign broadly.

ROOT ORDER

Audit exact current production Build 85 DEXA root and reproduce the exact section order.

Founder production screenshots establish at least:

1. Evidence Report / DEXA + Viewing
2. Latest Scan
3. DEXA → Apple Health reconciliation/status
4. headline composition metrics:
   - Body Fat
   - Fat Mass
   - Lean Mass
   - Weight
   - RMR
5. Since Prior Scan
6. Core Trends
7. Supplemental Metrics
8. Regional Tissue Lean Mass
9. Regional Tissue Fat Mass
10. Scan History

If source contains another current section within this sequence, include it in its exact source order.

Do not reorder sections for aesthetic convenience.

SHOW ALL / CLOSE

Audit EVERY independent DEXA disclosure.

For each:
- collapsed preview;
- Show All behavior;
- expanded content;
- Close behavior;
- graphs;
- metric rows;
- units;
- ordering.

Do not use one generic "expanded supplemental mapping" as proof if separate families have materially different expanded contents.

Founder specifically wants assurance that ALL graphs remain present when relevant drawers/disclosures are expanded.

Create a DEXA disclosure matrix:
Section | collapsed content | expanded content | graphs | metrics | units | production behavior | target behavior

CORE TRENDS

Prove all current trend graphs are retained in exact production order and units.

Do not omit graphs for compactness.

SUPPLEMENTAL METRICS

Preserve all actual metrics and exact units.

REGIONAL LEAN / FAT

Preserve all current regions and exact units.
If expanded state exposes additional regions, render/prove them.

SCAN HISTORY

Preserve exact preview count and inline Show All/Close behavior if that is production.
Preserve BodySpec PDF actions where current.
No fake scan-detail route.

AUDIT COMMENTARY

Remove product-facing copy such as:
"There is no scan-detail destination..."

That belongs in documentation only.

Do not expose source-audit commentary in the UI.

DEXA REVIEW OUTPUT

Dark + mineral light:
1. corrected DEXA root proving exact section order;
2. Core Trends complete graph state;
3. Supplemental Metrics collapsed + expanded;
4. Regional Lean collapsed + expanded;
5. Regional Fat collapsed + expanded;
6. Scan History collapsed + expanded;
7. concise DEXA disclosure coverage board.

Avoid redundant full-page renders where focused states prove parity better.

PART C — ACCEPTED EVIDENCE HUB / TIMELINE

Do not redesign.

Record:
Evidence Hub = LOCKED.
Timeline = LOCKED.
Health Metrics removal = LOCKED target requirement.

PART D — IMPLEMENTATION PARITY STANDARD

Add this lesson to design/implementation documentation if not already explicit:

A surface is not at parity merely because all fields/data are represented.

Parity requires preservation of:
- hierarchy;
- ordering;
- prominence;
- grouping;
- relationships;
- navigation;
- disclosures;
- media placement;
- workflow;
- interaction;
- content;
- state behavior.

This standard will be used later when locked designs are implemented in Native.

PART E — IMPLEMENTATION DELTA LEDGER

Review:
agent-handoffs/DESIGN_IMPLEMENTATION_DELTA_LEDGER.md

Update only genuine shipping deltas.

Do not classify previous harness parity mistakes as shipping defects.

Keep existing Photo Briefing paired-viewer requirement.

PART F — VALIDATION

Photos:
- exact production flow;
- visual media hierarchy;
- paired Evidence comparison preserved;
- Briefing action prominence;
- Uploaded Photos thumbnails;
- Show All;
- pose navigation;
- source history;
- inspection behavior.

DEXA:
- exact section order;
- every disclosure audited;
- every graph preserved;
- every metric/unit preserved;
- no audit commentary in product UI.

Dark/light semantic parity exact.
No horizontal overflow.

PART G — MOBILE REVIEW

Produce one consolidated mobile-friendly PRIMARY FOUNDER REVIEW PNG.

Also provide focused Photos and DEXA boards.

Report exact artifact paths.

PART H — SHIPPING ISOLATION

No Native shipping changes.
No Server changes.
No evidence/media mutations.
No build/TestFlight.

Design harness/docs only.

REPORTING

Follow agent-handoffs/README_REPORTING_STANDARD.md.

REPORT:
agent-handoffs/reports/<timestamp>-photos-dexa-evidence-founder-parity-correction.md

LOCK STATUS

Evidence Hub + Timeline + Training/Nutrition/Activity/Energy/Weight/Recovery = LOCKED.

Photos + DEXA = pending Founder review after this correction.

STOP when production structural parity is proven and focused dark/light artifacts are ready.

END TASK.
PhysiqueOS Evidence design — lock Energy/Weight/Recovery + finish DEXA, Photos and Timeline Evidence

TASK TYPE

Continue in Codex B / existing Evidence design chat.
Use High reasoning.

Founder approved the corrected Energy, Weight and Recovery designs.

No shipping implementation yet.

PART A — LOCK

Record:

Training Evidence = LOCKED.
Nutrition Evidence = LOCKED.
Activity Evidence = LOCKED.
Energy Evidence = LOCKED.
Weight Evidence = LOCKED.
Recovery Evidence = LOCKED.

Energy lock includes:
- Weekly History preview + separate Show All sheet;
- Recent Daily Energy preview + separate Show All sheet;
- contextual Nutrition Day / Activity links;
- no fake Energy Day Detail.

Weight lock includes:
- exact inline Weekly Averages Show All/Close;
- exact inline Weight History Show All/Close;
- Goal-dependent highest/lowest semantics;
- DEXA markers.

Recovery lock includes:
- accepted hierarchy;
- corrected contained Night Detail timeline;
- lighter thin analytical Continuity visualization;
- exact source/finality semantics.

PART B — FINAL EVIDENCE FAMILIES

Translate:

1. DEXA Evidence.
2. Progress Photos Evidence.
3. Timeline.

Also correct Evidence Hub information architecture:
- Timeline remains and moves to the BOTTOM of Evidence Hub.
- remove placeholder Health Metrics Evidence destination/page from target design.

Do all in one task.

SOURCE AUDIT FIRST

Audit exact Build 85 Native source and current Server evidence contracts.

Build complete navigation trees for DEXA and Photos.
Audit Timeline separately.
Audit Evidence Hub ordering and placeholder routes.

IMPORTANT:
DEXA EVIDENCE != DEXA BRIEFING.
PHOTO EVIDENCE != PHOTO BRIEFING.

Do not copy event-briefing information architecture into Evidence.

Use locked visual system but preserve actual Evidence workflows.

PART C — EVIDENCE HUB

Audit current Evidence Hub streams/order.

Founder decision:

TIMELINE
- keep Timeline;
- place it at the BOTTOM of the Evidence Hub, after the real evidence streams;
- preserve current Timeline destination/content;
- style it consistently.

HEALTH METRICS
- remove placeholder Health Metrics Evidence page/destination from TARGET DESIGN;
- do not show Coming Soon;
- do not show disabled placeholder;
- do not replace with another roadmap item.

Evidence should report what PhysiqueOS currently has.

Do not delete valid HealthKit-derived data from other real evidence families.
This decision is about the placeholder Health Metrics navigation destination/page.

Render corrected Evidence Hub dark/light proving:
- all current real streams;
- Timeline last;
- Health Metrics absent.

PART D — DEXA EVIDENCE

Audit all current DEXA Evidence surfaces/states.

Likely, source wins:
- DEXA Evidence root;
- latest scan;
- scan history;
- Show All/history behavior;
- scan detail;
- body composition metrics;
- regional values;
- comparison;
- PDF/source provenance;
- upload/intake status where Evidence exposes it;
- pending/review/confirmed/dismissed states only if part of Evidence hierarchy;
- loading/error/empty.

Preserve exact units.

Preserve distinction:
- DEXA total mass;
- lean tissue/lean mass;
- fat mass;
- body fat %;
- BMC;
- RMR;
- visceral fat;
- ratios;
- regional metrics.

Do not invent comparisons.

Do not interpolate.

If history has drill-down, preserve exact route.

DEXA upload/review:
Only include flows actually reached from DEXA Evidence.
Do not redesign global Add Evidence intake unnecessarily.

DEXA BRIEFING DESIGN
May inform tokens/visual language only.
Do not transplant briefing narrative sections.

PART E — PROGRESS PHOTOS EVIDENCE

Audit all current Progress Photos Evidence surfaces/states.

Preserve:
- sets/sessions;
- dates;
- Goal association;
- pose mapping;
- first/latest roles;
- history;
- thumbnails;
- media loading;
- retry/failure;
- detail;
- comparison if Evidence itself provides it;
- source/provenance;
- Photo Briefing relationship if linked;
- Show All/history behavior;
- upload/add flow only where Evidence exposes it.

Use actual Founder photos in design harness ONLY where current safe app-rendered assets are already available and dates/roles can remain truthful.

If not, use clearly non-authoritative placeholders and document it.

Do not bind unrelated real photos to synthetic dates.

MEDIA INTERACTION

Audit exact Build 85 Evidence behavior:
- thumbnail tap;
- full-screen viewer;
- zoom/pan;
- set navigation;
- retry;
- failed media.

Preserve production behavior.

Do not automatically apply the future Photo Briefing paired Previous/Current viewer to Progress Photos Evidence unless Evidence currently has a matched-comparison interaction requiring it.

If Evidence comparison would benefit from the same locked viewer requirement and target design depends on it:
document/ledger it explicitly.

KNOWN HISTORICAL PHOTO ISSUES

Reverify:
- "Retry photo" image failure/recovery;
- incorrect "Photo Briefing is being prepared" when already published;
- Photo Briefing Home persistence is separate and out of scope.

If Build 85/source proves issues resolved, mark resolved.
If still genuine, append/update delta ledger.

Do not silently hide them in design.

PART F — TIMELINE

Audit exact current Timeline page.

This page appeared later in product evolution and Founder accepts it.

Preserve actual:
- chronological ordering;
- event types;
- dates;
- evidence/briefing/Goal/phase events represented;
- filtering if current;
- navigation/deep links;
- pagination;
- loading/error/empty.

Do not turn Timeline into a new coaching feed.

Do not invent event categories.

DESIGN INTENT

Timeline is a cross-domain historical index.

Use compact chronological treatment.

Prefer:
- open timeline/list;
- semantic event markers;
- restrained grouping;
- readable date hierarchy;
- minimal cards.

It should feel useful as the final Evidence destination, not like another evidence domain.

PART G — RECENT HISTORY / SHOW ALL / ROUTE PARITY

Standing Evidence rule:

Audit and preserve:
- Recent History root previews;
- Show All;
- sheets/drawers;
- inline disclosure;
- detail routes;
- contextual cross-links;
- media viewers.

Data parity alone is insufficient.

Do not put source-audit explanations into product UI.

PART H — DARK + MINERAL LIGHT

Required for:
- Evidence Hub corrected;
- DEXA root;
- DEXA history/detail;
- Photos root/history/detail;
- Timeline;
- materially distinct media/error states.

Exact semantic parity.

PART I — NO ROADMAP UI

No:
- Coming Soon;
- placeholder Health Metrics;
- dead chevrons;
- nonfunctional future reporting.

Valid current data stays.

PART J — COVERAGE

Create matrices:
DEXA
Photos
Timeline
Evidence Hub

Zero materially distinct uncovered states.

PART K — ACCESSIBILITY

DEXA units spoken.
Photo pose/date labels.
Media viewer accessible.
Timeline event/date/category spoken.
44pt actions.
Dynamic Type.
Non-color event identity.

PART L — IMPLEMENTATION DELTA LEDGER

Review:
agent-handoffs/DESIGN_IMPLEMENTATION_DELTA_LEDGER.md

Append genuine gaps.

Reverify photo historical issues.
Do not add design-harness-only issues.

PART M — REVIEW OUTPUT

Concise, mobile-first:

1. Evidence Hub corrected dark/light.
2. DEXA root dark/light.
3. DEXA history/detail dark/light.
4. Progress Photos root dark/light.
5. Progress Photos history/detail/media state dark/light.
6. Timeline dark/light.
7. one concise full Evidence-finish board.
8. focused interaction board only if needed.

Produce one consolidated PNG as PRIMARY FOUNDER REVIEW ARTIFACT and identify it explicitly.

Do not flood Founder with redundant screens.

PART N — SHIPPING ISOLATION

No Native shipping changes.
No Server.
No evidence mutations.
No photo mutations.
No DEXA mutations.
No build/TestFlight.

Design harness/docs only.

PART O — REPORTING

Follow:
agent-handoffs/README_REPORTING_STANDARD.md

Also publish mobile-friendly primary review PNG and exact artifact path.

REPORT

agent-handoffs/reports/<timestamp>-dexa-photos-timeline-evidence-ui-style-translation.md

LOCK STATUS

Training/Nutrition/Activity/Energy/Weight/Recovery Evidence = LOCKED.
DEXA/Photos/Timeline = exploration pending Founder review.

STOP when final Evidence families are fully audited, interaction parity validated, corrected Hub rendered, delta ledger reviewed, and dark/light mobile review artifacts are ready.

END TASK.
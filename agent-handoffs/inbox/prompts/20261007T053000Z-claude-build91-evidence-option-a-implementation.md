PhysiqueOS Build 91 — implement Founder-approved Evidence visual system Option A

Continue in the SAME Claude Build 91 Evidence visual-system conversation and its current Remote Control-provided worktree.

Do NOT create another Claude session, child task, sub-chat, or additional worktree.

AUTHORITIES

Current shipped Native:
Build 90
32baf1d5f43120cd07088df1210e1dc84ed26a78

Evidence design candidate:
a9e478ade1c4b2cefed500e146a3bda5f6b60fca

Evidence design report:
549dcc265df1ec2c6511bc300f028349cba15965

Founder has completed the Evidence design decisions.

LOCKED FOUNDER DECISIONS

Use OPTION A: distinct stable color per Evidence domain.

Approved category direction:
- Training: Purple
- Activity: Amber
- Nutrition: Green
- Energy: Orange
- Weight: Blue
- DEXA: Cyan
- Progress Photos: Rose
- Recovery/Sleep: Teal
- Timeline/Hub: Neutral, with Timeline events using their domain identity where applicable.

Use ONE shared neutral Evidence surface hierarchy across all destinations.

Remove:
- Evidence-only neon/lime Dark accent;
- Evidence-only army/olive Mineral accent;
- Training dark blue-green/teal card wash;
- bespoke category card washes.

Preserve semantic data colors independently from category identity:
- Nutrition macro/meal semantics;
- Energy Intake vs Estimated expenditure;
- Weight vs DEXA markers;
- DEXA composition/trend semantics;
- Sleep series/stages;
- status/danger semantics;
- other meaningful multi-series colors.

Restore meaningful real icons on every Evidence Hub rectangle and page hero.

Locked icon choices:
- Nutrition: fork.knife
- Recovery: moon.fill
- other icons: use the established map in the approved design package.

Typography remains OUT OF SCOPE:
- preserve existing Training/Nutrition/Activity Plus Jakarta Sans behavior;
- no app-wide typography redesign.

ENERGY MINERAL CONTRAST

Founder approves Option A's orange Energy visual direction.

The design audit measured the current existing orange ink below normal-text AA on some Mineral surfaces.

Implementation rule:
- preserve the approved orange visual identity;
- first search existing PhysiqueOS orange/amber tokens or existing darker treatment for an AA-compliant Mineral text/accent usage;
- do not introduce a visibly different hue merely to satisfy a token preference;
- do not create a new arbitrary Evidence-only color without documenting why existing tokens cannot satisfy both the approved appearance and accessibility;
- small icon-only/non-text uses may follow the appropriate non-text contrast standard;
- normal-size Energy accent text must meet the accepted accessibility target.

If no existing token can preserve the approved appearance while passing normal-text contrast, create the smallest semantically named shared PhysiqueOS orange ink token needed, document exact contrast and keep Dark Option A unchanged.

Do NOT silently switch Energy to another Option/family.

TIMELINE

Use category identity only for event types that actually map to an Evidence domain.

Current production Timeline does not emit Nutrition/Energy/Sleep event types. Do not invent them.

System events such as Briefing, Check-In, Analysis, Protocol and generic Evidence Upload remain neutral unless an existing semantic mapping legitimately applies.

Upload failure remains danger red.

SURFACE SYSTEM

Implement the approved shared neutral Evidence hierarchy rather than the DEBUG palette override mechanism.

Prefer:
- one shared Evidence surface palette/tokens;
- one shared Evidence category presentation/accent registry;
- environment/projection of category identity where appropriate;
- no page-by-page duplicate mappings.

Remove the design fixture/seam from production implementation.

Hub/page identity must not rely on color alone:
- icon + title remain present;
- selected controls retain shape/fill/ring distinction;
- charts retain legends/labels.

TRAINING

Normalize its cards/surfaces to the shared Evidence hierarchy.

Remove the blue-green wash completely.

Retain Training purple as category identity only.

Do not change Training data semantics, performance records, filters, navigation or Logger behavior.

NUTRITION

Normalize its cards/surfaces to the shared Evidence hierarchy.

Retain Nutrition green category identity.

Preserve macro/meal semantic colors.

Do not turn Nutrition cards into green-tinted category surfaces.

WEIGHT / DEXA / PHOTOS / ACTIVITY / ENERGY / RECOVERY

Apply approved Option A category identity consistently while preserving all Build 90 data semantics, charts, navigation, states, disclosures and interactions.

Do not regress:
- Energy Build 90 approved redesign;
- Recovery/Sleep Build 90 approved redesign;
- Photo Briefing work;
- Weight chart semantics;
- DEXA data presentation.

HUB

Replace letter tiles with approved real icons.

The Hub should be the visual key for the category system.

Preserve Recently Used / All Evidence behavior, ordering and navigation.

ACCESSIBILITY

Verify both Mineral and Dark:
- normal text contrast;
- icon/non-text contrast;
- selected/unselected controls;
- category identity has icon/text redundancy;
- semantic chart distinction;
- Dynamic Type/layout where existing Evidence tests cover it.

TESTS

Add/adjust focused tests for:
- category registry mapping;
- all nine destination icons;
- Option A accents;
- shared surface hierarchy;
- no legacy Evidence lime/olive category accent;
- no Training teal surface wash;
- Nutrition semantic colors preserved;
- Energy semantic series colors preserved;
- Weight/DEXA semantic distinction preserved;
- Recovery/Sleep semantic colors preserved;
- Timeline domain vs neutral system events;
- Mineral/Dark contrast where testable;
- Hub navigation unchanged.

Update UI tests that currently expect letter tiles.

Run:
- focused Evidence unit/presentation tests;
- all relevant Evidence UI suites;
- full PhysiqueOSTests;
- generic Release compile;
- verify_release_configuration.py;
- Release seam scan;
- generator determinism if project inputs change;
- git diff --check.

Release must contain no design-review fixture/seam.

CONCURRENCY / BUILD 91 BOUNDARY

Claude B separately owns:
- Operating Plan redesign;
- DEXA appointment behavior/page;
- Peptides/Tracking;
- Watch Mineral footer fix;
- Watch-ready haptic.

Do not touch those areas.

Tomorrow's Founder workout feedback may add Watch/Logger work. Evidence should remain independently integrable.

NO RELEASE / NO INTEGRATION

Do NOT:
- merge into a Build 91 integration branch;
- bump Build 91;
- archive;
- upload TestFlight;
- change latest release authority;
- change Server;
- mutate production.

OUTPUT

Push one clean isolated Build 91 Evidence implementation candidate.

Publish a main-visible report-only handoff with:
- exact candidate SHA;
- Founder Option A decisions;
- category map;
- Energy contrast disposition;
- shared surface implementation;
- icon implementation;
- files changed;
- focused/full/UI tests;
- Release compile/seam scan;
- expected overlap/conflicts with Claude B;
- confirmation no integration/build bump/TestFlight/Server/production mutation.

Status:
Build 91 Evidence Option A implementation ready for later integration.

Notify:
PhysiqueOS Build 91 Evidence Option A — implementation candidate ready.

STOP.

END TASK.
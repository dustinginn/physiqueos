Task id: claude-midweek-standard-format-v3-integration-20260924

Purpose:
Start a NEW, separate persistent Claude Code lane for Midweek Briefing presentation. This lane may run in parallel with the existing HealthKit Founder Takeover Claude lane because it must use its own isolated Midweek worktree and must not modify HealthKit worktrees/files.

Founder concern / primary product direction:
The current Sep20-22 Midweek Briefing is visually and structurally far from the established Midweek Briefing standard. Do NOT treat the broken current V3 screen as the design baseline and merely patch it incrementally. The task is to restore the established Midweek briefing FORMAT/UI/INFORMATION ARCHITECTURE first, using the prior accepted Midweek briefing implementation/format as the visual and structural reference, and then pipe the new V3 Server-owned content/semantics into that standard.

The older briefing is a FORMAT reference, not a CONTENT source:
- preserve the established layout, hierarchy, section rhythm, information density, cards/charts/labels, navigation, and concise coaching presentation that made the prior Midweek useful;
- do NOT copy old factual values, old recommendations, old Confidence content, old Goal state, old narrative text, or old strategic conclusions into V3;
- V3 Server contract remains authoritative for current content, module inclusion/omission, claim ownership, Goal/Phase meaning, Confidence, uncertainty, and narrative semantics.

This distinction is mandatory:
OLD/ACCEPTED MIDWEEK = format/UI standard.
CURRENT V3 SERVER PRESENTATION CONTRACT = content/semantic authority.

Read first:
agent-handoffs/reports/20260924T044000Z-healthkit-revision-strength-presentation-reviewed-green.md only if needed for current Native lineage context, not Midweek semantics.
Locate/read the Midweek forensic chain published by commits:
cf8632c4e5c2d32bdccf170205e928ba7e81a481
e54c23ad073740375699dbc0b4e693a549253471
8acece351400867146e4d001636d8760f50d7d7f
03bf386c57d15fe1ee90d81cc0e57fc8b045bf09
fb6f3ecdca041064c39c9ba543244ce2e50f9938
0163a74fbb2e1a149c9c2c28906f68fd574dd727
d3ddb2a1257a9b798f420d9add86f4f1400c522e
1f9b1938e86d9e2107090e7a33855a13ef63e895
1a59cd233c1bd808e670ead9f7f98a860691c9ba
8165c0bdb4d82be799763f925ccae06983011912

Key prior authority:
- Midweek Server implementation candidate was 28ac1e4f51afdf3a30f2fb50fcb5c95148a2709d and was deployed/accepted in deployment e8c3bed3-20f6-4f5c-b34a-d27ab0881480.
- Production has since advanced through HealthKit work. Reverify current production; do not assume the old Server SHA is still current. The Midweek Server presentation contract should already be contained in current production lineage unless source inspection proves otherwise.
- Prior reviewed Midweek Native candidate was 4ab5b8dd469f016251dfb2fff2dab2b8e0612b1c, based on an earlier HealthKit lineage. DO NOT blindly archive or ship this SHA now.
- Current installed Native is Build 58 / fd7eed02add35bb9016dcd873018cd0c4ef43265.
- The HealthKit Claude lane is actively implementing further Native/Server work in separate worktrees. Do not touch those worktrees or merge their in-progress unreviewed work.
- This Midweek lane is SECONDARY: publish timestamped reports to main but DO NOT overwrite agent-handoffs/latest.json/latest.md while HealthKit owns the primary lane.

Founder-observed broken Sep20-22 V3 Native behavior:
- copy was sometimes reasonable but much too long/redundant;
- Energy, Training, Weight/body composition and other expected factual sections appeared missing;
- backend-ish/internal content surfaced;
- overall format no longer resembled the established Midweek Briefing experience;
- after Midweek Server deployment, Build 57 showed no visible change because Native still used the old renderer; this was expected.
The prior forensic work proved the Sep20-22 frozen artifact itself contains the structured information. Do not regenerate it.

FIRST TASK — recover and formalize the Midweek FORMAT STANDARD before coding

Before changing code, locate the most recent accepted/pre-V3 Midweek Native implementation and any fixture/snapshot/test or historical briefing read model that represents the established Midweek format. Prefer repository history and existing tests/components over memory or invention.

Produce a concise “Midweek Format Standard” artifact/checkpoint covering:
1. Header:
   - cadence/date range/title behavior;
   - active Goal/Phase context;
   - Confidence placement and compactness.
2. Core factual modules and order:
   - Energy;
   - Weight/body composition;
   - Training;
   - Recovery/execution when applicable;
   - charts/metrics and when omitted.
3. Coaching hierarchy:
   - concise result/what changed;
   - what it means;
   - what to do;
   - what to watch;
   - Coach’s Take only when distinct/useful.
4. Information density:
   - expected card lengths;
   - scannability;
   - avoidance of paragraphs that repeat structured facts;
   - labels/headers/collapsible behavior if historically present.
5. Visual/navigation conventions:
   - cards, spacing, hierarchy, colors/typography as represented by existing Native components;
   - historical Briefing History navigation behavior;
   - V2 historical compatibility.
6. What MUST NOT be copied from legacy:
   - old factual values;
   - old Confidence calculations;
   - old recommendation semantics;
   - old Goal/Phase state;
   - legacy local strategic derivation that V3 now owns on Server.

Use an actual accepted prior Midweek fixture/snapshot/implementation as the format oracle. If there are multiple historical versions, identify which was last accepted and why. Do not invent a new design unless a V3 requirement genuinely cannot fit the established standard.

SECOND TASK — map V3 contract into the standard

Audit current production/current source Midweek V3 presentation contract and prior Native candidate 4ab5b8dd.

Create an explicit mapping:
V3 Server field/claim/module -> established Midweek UI slot.

Examples of the intended principle:
- V3 concise lead -> established headline/summary slot.
- V3 Goal/Phase meaning -> established Goal/Phase context area, not a giant prose hero.
- V3 Confidence -> established compact Confidence surface exactly once.
- V3 Energy module -> established Energy card/chart.
- V3 Weight/body composition -> established Weight/body composition card.
- V3 Training rollup -> established Training section, movement detail subordinate.
- V3 coaching sections -> established concise coaching hierarchy.
- V3 bounded uncertainties -> established Watch/Still Unresolved treatment, <=2, no backend diagnostics.

If a V3 field has no appropriate legacy slot, decide whether:
A. it belongs in a minimal extension consistent with the standard;
B. it is redundant and should not render separately;
C. it belongs in detail/drill-in rather than the main briefing.
Do not create a new top-level card just because a backend field exists.

THIRD TASK — rebase/reconcile the reviewed Midweek Native work onto current safe Native authority

Do NOT use the old 4ab5b8dd candidate as a release artifact directly.

Audit its diff and salvage only the V3 contract decoding/presentation logic that remains correct.
Create a new isolated Midweek worktree/branch from the appropriate current stable Native authority. Because HealthKit is actively changing Native, do not merge HealthKit's in-progress implementation. Use the latest RELEASED/accepted Native authority (Build 58 / fd7eed02...) unless a newer fully-reviewed/released authority exists by the time this task starts.

Apply/reimplement Midweek changes cleanly on that base.
No HealthKit behavior changes.

IMPLEMENTATION REQUIREMENTS

The main V3 Midweek screen should feel like the established Midweek briefing, not like a backend contract dump.

Required behavior:
- concise top summary;
- Goal/Phase context visible but compact;
- Confidence exactly once;
- factual modules restored in established order;
- Energy visible when Server includes it;
- Weight/body composition visible when Server includes it;
- Training rollup visible when Server includes it;
- Recovery/execution only when included/applicable;
- charts use the established Midweek visual treatment and Server eligibility rules;
- movement-specific detail subordinate to broad Training;
- no full concatenated Narrative V3 body in hero;
- no repeated Result/Meaning/Action/Watch copy;
- Coach’s Take only if distinct;
- <=2 visible unresolved/uncertainty items;
- no backend diagnostic labels/reason codes in user-facing copy;
- no duplicate Confidence;
- no duplicate semantic claims;
- no client-side strategic interpretation.

Historical behavior:
- frozen Sep20-22 artifact/assessment remain immutable;
- corrected dynamic projection may change how that historical briefing renders;
- V2 historical briefings retain their legacy presentation;
- do not regenerate historical briefings.

Content authority:
Server V3 owns:
- module include/omit;
- Goal/Phase synthesis;
- Confidence values/movement/reason;
- claim identity/salience/primary surface;
- uncertainties;
- coaching narrative semantics.
Native owns:
- faithful rendering into the established format;
- visual hierarchy;
- navigation;
- accessibility;
- dedup by Server-provided identity/ownership.
Native must not derive a different strategy.

PRODUCTION-FIXTURE ACCEPTANCE

Use the sanitized Sep20-22 production fixture from the forensic chain as the semantic oracle and the accepted prior Midweek implementation/fixture as the FORMAT oracle.

Acceptance must prove BOTH:
A. FORMAT PARITY:
- recognizable established Midweek structure/order/hierarchy;
- factual cards restored;
- comparable density/scannability to the accepted prior briefing;
- no giant prose dump;
- visual conventions preserved.
B. V3 SEMANTIC PARITY:
- V3 module/claim ownership obeyed;
- Goal/Phase/Confidence current and Server-owned;
- valid Machine Lateral Raise 90 lb and Leg Extensions 90 lb facts remain factually available without both monopolizing narrative prominence;
- uncertainties bounded/deduped;
- no client strategic derivation.

Add snapshot/structural tests where practical that would fail if the V3 screen collapses back into a narrative-only layout.

CONCURRENCY / WORKTREE RULES

HealthKit Claude owns its current Native and Server worktrees. Do not enter, modify, switch, rebase, clean, or build from them.
Create/use an isolated Midweek worktree from released Native authority.
Do not touch HealthKit production policy/data.
Do not overwrite agent-handoffs/latest.json/latest.md.
Do not use the Midweek worktree for HealthKit changes.
Before eventual release, Midweek must be reconciled onto whatever Native release authority is current at that future time; do not race HealthKit build numbers.

TESTING

Use only the existing iPhone 17 Pro simulator.
No other simulator devices/runtimes.
Run focused Midweek Native tests, historical V2 tests, production-fixture tests, snapshot/structure tests, then relevant full Native suite.
Mutation-test/deliberately break:
- module ordering;
- one-Confidence rule;
- narrative-detail hero exclusion;
- claim dedup;
- <=2 unresolved;
- V2 fallback boundary.
Fresh-context independent adversarial review exact final Midweek candidate.
No TestFlight upload without separate Founder authorization.

VISUAL ACCEPTANCE

If simulator visual inspection is useful, compare:
1. an accepted prior/pre-V3 Midweek rendering or fixture;
2. Sep20-22 V3 rendering from the production fixture.
The comparison is about layout/hierarchy/density, not copying old content.
Screenshots are optional evidence, not required if deterministic snapshots/structure tests prove the contract. Do not require Founder screenshots to implement.

GITHUB REPORTING

This is a secondary parallel lane.
After substantive chunks publish timestamped reports under agent-handoffs/reports/ to main.
DO NOT overwrite latest.json/latest.md while HealthKit owns primary.
Every completion message must include report commit SHA + path.
If publication fails, say REPORT NOT PUBLISHED.
At minimum publish:
- Midweek Format Standard + V3 mapping checkpoint;
- implementation/test checkpoint;
- fresh-review final candidate.

PERSISTENT CLAUDE PHONE HANDOFF

This task is intended for a NEW Claude conversation, separate from HealthKit.
Codex should bootstrap it using the proven persistent mechanism:
- correct isolated Midweek worktree;
- claude --bg --remote-control with a distinct name such as “Midweek Briefing Founder Takeover”;
- process hosted by Claude daemon/PTY, independent of Codex terminal lifetime;
- once Remote Control is confirmed, Codex disengages.
Do not use native-production-read-foundation/Build41 as the engineering worktree merely because it was used for the connectivity test.

AUTHORIZATION

Authorized now:
- read/audit repository history;
- create isolated Midweek worktree/branch from correct released Native authority;
- implement/test/review Midweek Native presentation;
- publish GH reports.

Not authorized:
- Server production deployment;
- Native TestFlight upload;
- production data mutation;
- historical briefing regeneration;
- HealthKit code/policy/data changes;
- merging HealthKit in-progress work.

IMMEDIATE NEXT STEP

First recover and publish the Midweek Format Standard from the last accepted prior Midweek implementation/fixtures, then map V3 into it. Do NOT begin by editing the broken current screen. Only after the format standard and mapping are explicit should implementation start.

Flags:
AUTHORITY_REVERIFIED
ISOLATED_MIDWEEK_WORKTREE
HEALTHKIT_WORKTREES_UNTOUCHED
LEGACY_ACCEPTED_FORMAT_ORACLE_IDENTIFIED
MIDWEEK_FORMAT_STANDARD_PUBLISHED
V3_TO_STANDARD_MAPPING_PUBLISHED
CURRENT_BROKEN_SCREEN_NOT_USED_AS_DESIGN_BASELINE
RELEASED_NATIVE_BASE_USED
ENERGY_STANDARD_SLOT_RESTORED
WEIGHT_BODYCOMP_STANDARD_SLOT_RESTORED
TRAINING_STANDARD_SLOT_RESTORED
CONFIDENCE_SINGLE_SURFACE
GOAL_PHASE_COMPACT
NARRATIVE_HERO_CONCISE
CLAIM_DEDUP_PASS
UNRESOLVED_MAX_TWO
V2_HISTORICAL_UNCHANGED
SEP20_22_ARTIFACT_IMMUTABLE
FORMAT_PARITY_PASS
V3_SEMANTIC_PARITY_PASS
NATIVE_TESTS_PASS
FRESH_CONTEXT_REVIEWED
TESTFLIGHT_UPLOADED
GH_REPORT_PUBLISHED

# PhysiqueOS comprehensive ChatGPT handoff — 2026-10-04

Status: ACTIVE DESIGN PROGRAM WITH PARALLEL CODEX LANES; MULTIPLE EARLIER IMPLEMENTATION ITEMS STILL OUTSTANDING

This is the canonical handoff from the long PhysiqueOS planning/design conversation ending 2026-10-04. Read this file first, then inspect the latest relevant reports/artifacts rather than reconstructing decisions from old chat history.

## Operating model

ChatGPT is planner/orchestrator. Codex is primary engineer/designer. Claude may review/operate when useful. Before prompts, identify agent/chat, reasoning level, and same/new chat. Copyable Codex/Claude prompts must be plain text only.

User often works from phone and now has GitHub app. On "check GH": inspect latest checkpoint/report, summarize findings, and provide direct GitHub links pinned to exact artifact commit for primary composite PNG and focused boards. Composite PNGs work well on mobile. Reports must remain discoverable from main.

## Hard design/implementation standard

Current redesign is a vetted product specification, not loose inspiration. Once Founder locks a design, it becomes Native visual acceptance authority. Server/canonical contracts remain data/behavior authority where appropriate.

Implementation has three acceptance gates:
1. Visual parity: actual Native simulator dark/light screenshots vs exact locked design at same geometry.
2. Content/data parity: exact canonical values, copy, ordering, units, states, conditional content and provenance.
3. Behavior parity: navigation, Show All, sheets/drawers, inline disclosures, completion/mutation semantics, media viewers, zoom, HealthKit/source behavior.

"All fields represented" is NOT parity. Parity includes hierarchy, ordering, prominence, grouping, relationships, navigation, disclosures, media placement, workflow, interactions, content and state behavior.

Do not silently approximate locked designs. Surface conflicts.

After design program finishes, implementation starts with FOAM ROLLING PRIORITY DETAIL as a small parity pilot. Implement dark + mineral light, capture real simulator screenshots, compare side-by-side, correct all mismatches, then lock methodology. Only then scale to Priority Detail family and larger families.

Design lock != implementation approval.

## Theme

Real appearances:
- Dark
- Mineral Light

Future You/Settings: System / Dark / Light. Mineral Light becomes actual Light appearance. System expected default unless constraints dictate otherwise.

## Home — LOCKED

Final direction is compact/high-information:
- trajectory hero with colored/gradient field;
- canonical confidence ring/content;
- goal/phase journey integrated;
- Guardrail persistent and visually separate from phase timeline;
- Log Morning Weight;
- Latest Briefing button;
- Today's Priorities;
- bottom nav;
- dark/mineral light.

Canonical content must not change for design. Example: "79% confidence" must not become invented "moderate". Redundant Build Lean Mass labels removed. "Target" became "Target Date". Guardrail is not Phase 3. Latest Briefing uses report/document icon. Background ring stays subtle.

Home is primary visual reference.

## Log — LOCKED

Selected Compact Command Center:
- What happened?
- prominent Training Logger;
- Logged Today compact grid;
- realistic density: Strength + cardio, nutrition calories + macros, Activity, Weight;
- Uploads Ready to Review;
- Log weight for another date;
- Add evidence;
- Add details without asset;
- Sources collapsed at bottom.

Do not repeat Apple Health in every tile. Sources disclosure at bottom explains provenance.

## Briefings — recurring family LOCKED

Founder requires DESIGN ONLY; no content/order changes. Canonical briefing content was heavily tuned.

Weekly/Midweek:
- dark/mineral light;
- creative data presentation without content rewrite;
- colored sections/cards break up mineral-light white;
- graphs retained;
- Recovery graph in recurring briefings;
- Body Composition immediately below Weight;
- no invented Weekly Photos section;
- no invented "Still unresolved";
- Midweek includes Biggest Takeaway;
- same section family, Midweek condensed;
- Priority Muscle Groups condensed rather than awkward stacking.

Locked style: strong hero, Energy graph, Weight, Body Composition, Training Response, Recovery graph, canonical Coach's Take/What To Do/What To Watch/Into Next Week.

Monthly was also designed successfully after correcting early Coach's Take placement/tags. Preserve canonical monthly ordering/content.

Recovery briefing contract: graph-driven, Green/Yellow/Red only where canonical, sleep average vs personal baseline, foam rolling context, association not causation, no Recovery Score.

## Watch / Live Activity / Training Logger — LOCKED

Watch accepted except KEEP current production icons/colors for Workout Metrics and Daily Totals. Founder intentionally chose those distinctions.

Live Activities accepted.

Training Logger accepted. Keep larger obvious DONE control with checkbox for set completion.

Known implementation delta: Apple Watch timed-set duration reaches shared projection but Watch mapper drops it. Reverify during implementation.

## Goals — LOCKED

Includes root, active Build Lean Mass, current Phase 2, completed Phase 1, completed Visible Abs, Your Journey, progress bars, first/final completed-goal photos, Goal/Phase/Guardrail relationship.

Guardrail persistent, never Phase 3. Completed Visible Abs must show first/last real photos.

Founder decision: completed-Goal ProgressPhotoTile does NOT need tap-to-expand.

## Priority Detail — LOCKED after final Preparation consolidation

Intentional simplification:
REMOVE Related Goals, informational Completion cards, sandbox fallback.
KEEP Mark Complete, completion contexts, dose, preparation, execution notes, timing, protocol changes, evidence actions.

Audited generic, Morning Weigh-In, Foam Rolling, peptide/dose-aware, supplement, evidence-driven and completed/error states.

Old issues re-audited:
- completed Morning Check-In wrong routing resolved in Build 85;
- Home vs detail dose-aware peptide completion resolved/current Home is dose-aware; detail differs only for explicitly entered different amount.

Final Founder correction: Tesamorelin had two Preparation rows (finish eating 2–3 hours before injection; take fasted before bed). Consolidate into ONE Preparation section while preserving both canonical instructions. This was sent to Codex and should be verified in latest work.

Known implementation gap: Progress Photos/DEXA Priority action URLs may exist server-side while Native routing only maps /check-in/morning. Reverify exact authority during implementation; tracked in delta ledger.

## Operating Plan — ACTIVE CODEX A

Accepted:
- Operating Plan root;
- Energy Strategy detail;
- Nutrition Strategy detail;
- Training Strategy detail.

Artifact commit: 89d05249f90cb65da5941d08d987eba50bfb18ce
Board: agent-handoffs/artifacts/operating-plan-ui-style-translation-20261004/screens/operating-plan-mobile-review.png

Edit Strategy verification:
artifact be04cfa82efd9c5d38208427d3ca6f18ce150d03
board: agent-handoffs/artifacts/operating-plan-edit-strategy-verification-20261004/screens/operating-plan-edit-mobile-review.png

Finding: Energy has NO editor in Build 85; intentionally read-only. Nutrition and Training editors verified for fields, validation, concurrency/version and history/successor semantics. Founder reviewed and accepted; later said only remaining change across both lanes was DEXA Since Prior Scan.

CURRENT CODEX A TASK already staged/sent:
commit abe3ae1de0f9ee98d01617788d9a4fe96c06c74a
path agent-handoffs/inbox/prompts/20261004T203500Z-operating-plan-next-three-domains-ui-style-translation.md

Codex A is moving to NEXT THREE Operating Plan domains/pages/subpages. Inspect exact prompt and latest output before issuing more work. Founder explicitly wants to speed through remaining Operating Plan pages/subpages now that Codex has found the groove.

## Evidence — mostly LOCKED

Locked:
Evidence Hub, Training, Nutrition, Activity, Energy, Weight, Recovery, Timeline.

Evidence Hub:
- Timeline stays and is absolute BOTTOM destination.
- placeholder Health Metrics is REMOVED. No Coming Soon replacement.

Timeline accepted as current read-only/newest-first cross-domain historical index. Do not invent coaching/navigation.

### Training
Locked. Training Areas must list all current areas as production does; no arbitrary bucketing/truncation. Performance records stay at Exercise Detail unless requirement changes.

### Nutrition
Locked. Dead/nonfunctional Reporting destinations removed. Recent Nutrition History remains at bottom/root and accessible. Remove all Coming Soon.

### Activity
Locked. No fake reporting hierarchy. Recent history remains.

### Energy
Locked after correction.
Weekly History preview -> Show All -> weekly sheet.
Recent Daily Energy preview -> Show All -> daily sheet.
Daily rows: date, completeness, Intake, Active Calories where available, Estimated Expenditure, signed Balance, contextual Nutrition Day/Activity links.
No Energy Day Detail. Do not put audit explanation in UI.

### Weight
Locked.
Weekly Averages Show All expands inline; Weight History Show All expands inline; changes to Close.
Preserve Goal-dependent Highest/Lowest/Last Change, 3/7-day averages, weekly/history, DEXA markers, Goal filtering. No streak/Related Goals.

### Recovery
Locked.
Hierarchy: root -> Last Night -> Night Detail; See Trends -> Sleep Trends; Recent Nights -> All Nights.
Preserve Sleep, Sleep Window, Total Sleep, Continuity, Stage Mix, Stages, Time in Bed, Source & Data, finality/updating/provenance, approximate historical clock-time semantics.
Night Detail timeline overflow fixed. Continuity redesigned to lighter analytical point/line treatment. This new Continuity visual is an implementation delta vs current production. No Recovery Score.

### Progress Photos Evidence
Initial design failed parity; production screenshots became structural authority. Corrected flow preserves:
- visual Latest Photo Set + thumbnail/date/view count/comparison/Open Gallery;
- prominent full-width Read Photo Briefing;
- Uploaded Photos thumbnails + Show All;
- gallery pose detail with Previous + Current simultaneously, labels/dates, Interpretation, Capture Conditions, Source History, Previous/Next pose navigation and image expansion affordances.

Corrected artifact: 47ed6d1a5c1daf00ba0577638dbeb6faaec31385
Focused board: agent-handoffs/artifacts/photos-dexa-evidence-founder-parity-correction-20261004/screens/photos-focused-review-board.png

Founder later said only remaining change across both lanes was DEXA Since Prior Scan, so Photos is accepted/lockable.

Historical Retry Photo and incorrect persistent "Photo Briefing is being prepared" issues were rechecked and resolved in Build 85.

### DEXA Evidence
Accepted except final micro visual correction to Since Prior Scan.

Corrected artifact: 47ed6d1a5c1daf00ba0577638dbeb6faaec31385
Focused board: agent-handoffs/artifacts/photos-dexa-evidence-founder-parity-correction-20261004/screens/dexa-focused-review-board.png

Exact root order:
1 Evidence Report/DEXA + Viewing
2 Latest Scan
3 DEXA -> Apple Health status
4 headline metrics: Body Fat, Fat Mass, Lean Mass, Weight, RMR
5 Since Prior Scan
6 Core Trends
7 Supplemental Metrics
8 Regional Tissue Lean Mass
9 Regional Tissue Fat Mass
10 Scan History

Codex correction proved 17 graphs and 4 independent disclosure families. Every Show All/Close must preserve graphs/metrics/units. No audit commentary in UI.

FINAL Founder feedback: Since Prior Scan should copy production visual treatment because it is cleaner:
- one horizontal summary;
- Body Fat / Fat Mass / Lean Mass evenly distributed;
- semantic value colors;
- subtle vertical separators;
- less visual weight than nested tiles.

Founder already sent this correction to Codex.

## DEXA + Photo event briefings

Separate from Evidence.

DEXA briefing requirements: explicit units; "Since starting lean mass phase" must show actual baseline-to-current Goal/phase breakdown, not prose-only.

Photo Event flow: hero; This photo session; all confirmed poses; What visibly changed; Previous/Current comparisons; interpretation; What complete evidence means; Coach's Insight.

Photo Briefing interaction implementation requirement: tapping matched comparison should open Previous + Current side-by-side at larger size with zoom, preferably synchronized zoom/pan. Single-photo expansion already works.

## Current Codex B task — You / Settings / Profile

Already staged/sent:
commit ce0141a53e140fe9b0854d6a4df01d6a5dbae434
path agent-handoffs/inbox/prompts/20261004T203501Z-you-settings-profile-ui-design.md

Inspect this exact prompt and latest output before issuing more work.

Founder wants a You/Settings foundation before beta:
- Profile with basic demographics only where product/beta has real purpose;
- Data Sources showing Apple Health etc and what PhysiqueOS receives;
- Appearance: System / Dark / Light;
- likely account/sign-out, units, notifications, app/version/privacy if source/product supports them.

Key conceptual distinction:
Data Sources tells user WHERE evidence comes from.
Evidence tells user WHAT PhysiqueOS knows.

Do not collect demographics just because profiles usually have them. Each field needs current/near-term purpose.

Beta testing is approaching, so profile/account foundation matters.

## Design-to-Implementation Delta Ledger

Canonical file:
agent-handoffs/DESIGN_IMPLEMENTATION_DELTA_LEDGER.md

Future design agents must review it and append genuine implementation-relevant behavior/data/navigation/accessibility gaps. Do not bury findings only in task reports.

Known/open or important entries include:
- Photo Briefing dedicated simultaneous Previous/Current comparison viewer with synchronized zoom/pan target;
- Apple Watch timed-set duration projection mapping;
- Progress Photos/DEXA Priority action routing gap if still current;
- Recovery Continuity visualization target vs current production;
- any Energy Strategy history exposure gap if still relevant.

Architectural context should not automatically become patches.

## HealthKit / strategic rules that remain in force

HealthKit layers remain separate:
HealthKit observation -> canonical PhysiqueOS record -> evidence eligibility -> strategic interpretation.

Ingestion/source provenance must not decide strategic meaning.

Current strategic evidence eligibility includes activity, cardio_training, nutrition. Strength remains via Evidence Review reconciliation. Cardio can prospectively participate in V3 Confidence/Narrative.

No routine confirmation UI for automatic Apple Health Activity/Nutrition/cardio/sleep. Exception: reconciling Apple Health strength workout with structured Logger session uses Evidence Review.

No historical backfill by default; Founder-approved start boundary. Historical sleep validation imports must never rewrite historical briefings/confidence/narrative/recommendations.

## Confidence/Narrative V3

Server/Web V3 accepted and production authority historically 0a07132c... at Sep 18; reverify current authority before server work.

Sep 16 Midweek example: Goal confidence 79%, canonical_confidence_assessment_v3, recommendation continue current strategy.

Native V3 presentation added earlier. Historical V2 briefings remain unchanged.

Do not rewrite canonical confidence content for UI.

## Native / server / testing operational rules

Current design audits used Native Build 85 authority:
b8ee8690b194cb90086b62816b9a2c8c400dc026
Server used:
3c0f4aefddbb9a6886f6ad012443978303d47024
These are historical task authorities, not guaranteed current. Reverify before implementation.

TestFlight publication should be batched. Do not upload every design/implementation increment.

Agents must not log into App Store Connect/Apple Developer in browser. Upload via Xcode; if re-auth needed, tell user.

Prefer deterministic tests and concise textual acceptance. Manual simulator only for changed workflow, except visual parity implementation will deliberately require simulator screenshots.

## Reporting/mobile review convention

Every visual Codex task should produce:
- primary composite PNG;
- focused boards where useful;
- exact artifact commit;
- main-visible report/latest pointer.

When user says "check GH", provide direct clickable GitHub URLs pinned to exact artifact commit. This workflow has been tested successfully on user's GitHub iPhone app.

## Storage cleanup lane

A separate Codex storage audit/cleanup was launched during this chat. It was instructed:
- inventory first;
- protect active/ambiguous worktrees/processes;
- do not modify application source;
- safe cleanup only;
- remeasure storage;
- validate git/worktree health;
- publish before/deleted/after report.

Codex often says it cannot initially find the prompt in its checkout and resolves the supplied authority hash from shared Git object store. User asked whether this is expected. It has been recurring due isolated Remote Control/worktree context; prompts/reports should be made consistently discoverable via main/reporting standard.

New chat should inspect GH if storage cleanup status matters before assuming complete.

## Build 85 / logger outstanding validation

Earlier in this conversation Codex worked on logger/build 85. Founder confirmed a review and later asked whether anything remained before next workout; conclusion was essentially that next meaningful validation required a real next workout.

If logger behavior becomes relevant, inspect latest GH/build notes rather than assuming acceptance beyond what was actually exercised.

## Current exact next actions for new ChatGPT chat

1. Read this handoff.
2. Check GH latest for BOTH active Codex lanes before issuing anything:
   - Codex A: next three Operating Plan domains prompt at abe3ae1d...
   - Codex B: DEXA finalization + You/Settings/Profile prompt at ce0141a...
3. When complete, give Founder direct mobile GitHub review-board links.
4. Verify DEXA Since Prior Scan correction.
5. Review You/Settings/Profile carefully because it establishes beta/account/theme/source foundation.
6. Continue speeding through remaining Operating Plan pages/subpages if Codex A remains accurate.
7. Finish all design surfaces before broad Native implementation.
8. Then begin Foam Rolling Priority Detail implementation parity pilot.
9. Do not lose implementation deltas discovered during design.

## Founder working style/preferences

- Values architecture/functionality and exact parity over superficial speed.
- Comfortable accelerating after a family proves reliable.
- Wants concise prompts but comprehensive internal task instructions in GH.
- Often gives visual feedback from phone screenshots.
- Wants dark AND mineral-light renders; agents have forgotten light before, so always require both.
- Does not want screenshots from agents unless needed for design/visual acceptance; here they ARE needed.
- Does not want content changed during redesign.
- Wants direct, practical answers and minimal repeated context.
- "Check GH" means inspect actual latest repository state, not rely on memory.

PhysiqueOS product backlog — durable authority

Last updated: 2026-10-07
Owner: Founder
Purpose: durable cross-chat authority for outstanding product work, accepted deferrals, natural acceptance gates, and next-build integration items.

USAGE

This file is the durable backlog authority across ChatGPT chats and coder sessions.

Before proposing or reconstructing the PhysiqueOS backlog:
1. read this file from origin/main;
2. read the latest relevant agent handoff reports;
3. do not resurrect items listed under Completed / Removed from backlog unless the Founder explicitly reopens them.

Agent handoff reports describe implementation state. This backlog describes what still needs product attention.


NEXT BUILD 93 — FOUNDER NOTES CONSOLIDATED (CANDIDATES; SCOPE AND RELEASE NOT YET AUTHORIZED)
PRIMARY WORKOUT CTA CONTINUITY — FOUNDER REQUIREMENT 2026-10-08 (COLOR DECISION NOT YET RECONCILED)
- Founder requests one matching primary-action button color PER APPEARANCE across THREE surfaces: iPhone Logger "Finish Workout", Watch workout "Complete Set", and iPhone Live Activity "Complete Set". No mismatched Watch purple vs iPhone amber or Live Activity teal.
- Earlier LIVE ACTIVITY selections: Dark WARM AMBER primary/highlight, Mineral Light OPTION B MINERAL NEUTRAL with DARK INK primary and restrained amber accents. These are still recorded design preferences, but founder now prioritizes three-surface continuity and asks to reconcile them with the actual existing iPhone Finish Workout tokens before finalizing implementation. DO NOT silently assume that the two prior Live Activity swatch values equal the shipping iPhone button tokens.
- First coder task: audit actual shipping iPhone Finish Workout button semantic token separately in Dark and Mineral Light, then present exact comparison against the two previously selected Live Activity directions. Do not invent values or make a unilateral global accent decision. If they differ, request one concise Founder choice: retain the prior Live Activity colors across all three, or use actual iPhone Finish Workout colors across all three. Until resolved, do not ship mismatched colors.
- Shared semantic workout CTA token (per theme) is preferred for all three surfaces where supported; ensure readable foreground text, ActivityKit/Watch propagation, accessibility and status contrast. Do not recolor unrelated app controls.
- Status: CONTINUITY REQUIREMENT APPROVED; exact per-theme color authority pending source audit/Founder reconciliation. Build93 implementation pending.


TRAINING LOGGER PROGRESSION SUGGESTION ACTIONABILITY — BUILD 93 FOUNDER DEVICE FINDING 2026-10-08
- Founder physical Build92 screenshots: Seated Hip Adductions displays "Progress manually if today's performance supports it" and appropriately disables "Use suggestion" because no actionable proposed change exists. Hip Thrusts displays "MAINTAIN CURRENT PERFORMANCE 75 lb x 15" yet still ENABLES "Use suggestion"; tapping it applies no visible reps/load change. This inconsistency is a misleading no-op action.
- Required semantics: enable "Use suggestion" ONLY when the authoritative progression suggestion would make a meaningful, safe, actual change to one or more applicable sets' reps/load or other explicitly supported editable training parameter. A maintenance recommendation equal to current effective set values, or an absent/unavailable/invalid suggestion, must show a non-actionable disabled suggestion control or omit it consistently, while keeping "Keep previous" and manual editing available. Use the same canonical actionability predicate across all exercise types and presentation states; do not special-case Hip Thrusts or use a mere suggestion-text-present boolean. Consider per-set edits, variant partitions, load units, rounding, previously modified sets and current/previous distinctions.
- Audit existing Logger suggestion adapter, Server recommendation contract and apply command for semantic parity; distinguish truly actionable maintain-vs-progress changes. Ensure a disabled control cannot mutate or claim success; an enabled control must visibly apply a real change or return a truthful error, never silent no-op. Add focused regression tests for Seated Hip Adductions, Hip Thrusts maintain 75x15, actual progression, custom sets and edge cases.
- Status: FOUNDER REQUESTED BUILD93 BUGFIX; not yet implemented, released or physically accepted.

WATCH WORKOUT PRIMARY ACTION — AMBER CONTINUITY, BUILD 93 FOUNDER DESIGN DECISION 2026-10-08
- Founder physical Watch screenshot shows Mineral Light Complete Set button in vivid purple, while the iPhone Logger Finish Workout button is darkish amber in the shown Mineral Light screenshot. MINERAL LIGHT Watch: use the same primary CTA color/token as iPhone Finish Workout in Mineral Light (or a legibility-adjusted equivalent where watchOS contrast requires it), not purple. DARK Watch: use the actual primary Finish Workout button color/token from the iPhone app IN DARK MODE, not a separately chosen warm-amber approximation. Audit the current Dark-mode iPhone token first; exact hue must follow that source of truth, whatever its color. Prefer shared semantic token/theme parity where feasible, with sufficient Watch text contrast. This does not authorize a global accent change.
- Preserve readable text contrast, rest/progress legibility, accessibility, semantic completion feedback and existing Watch workout functionality. Scope includes Watch's Complete Set primary CTA and relevant workout primary actions, but do not arbitrarily recolor every purple app navigation/accent element.
- Separately, the Live Activity Dark Warm Amber and Mineral Light Option B Mineral Neutral decisions remain approved: the Live Activity is not the Watch workout screen. Keep their theme-specific CTA semantics distinct unless Founder expressly unifies them. Theme choice in PhysiqueOS Settings must propagate to supported surfaces; audit Watch appearance selection independently from Live Activity.
- Status: FOUNDER-APPROVED THEME-BY-THEME IPHONE/WATCH PRIMARY CTA COLOR PARITY / WATCH IMPLEMENTATION + TESTING PENDING. Dark uses the ACTUAL iPhone Dark Finish Workout button color; Mineral Light uses the iPhone Mineral Light primary Finish Workout color. No new arbitrary hue or design board required unless contrast/platform constraints demand it.


BUILD 93 IMPLEMENTATION CHECKPOINT — 2026-10-08 (NEWER THAN STAGED HANDOFFS BELOW)
- Codex Home/Morning/DEXA lane COMPLETED tested isolated candidates: Native 89378f31f7d2f460a5a2ce425bb6d8c61edc8300 (descends from Morning fix 01db8b2e and Build92 beaf5eff), Server a7854febcc17d99061e33900d658cd3e48ea67d2 (live Server 84cc64e4 parent). Report agent-handoffs/reports/20261008T144500Z-build93-home-priority-morning-integration.md, main report commit a4e207ca2218e718316e97a8b641cba17c52252e. 427 Native tests, 117 Server tests, real narrow/large iPhone UI Dark/Mineral and generic Release build passed. Home odd-tail full-row, Morning open/skip but no inline Complete, DEXA reminder-only and forged command refusal implemented. NOT deployed/released/physically accepted. GH issue #9 stays OPEN until Build93 device acceptance.
- Claude Recovery lane COMPLETED tested isolated candidates: Native e0a4706d (code 5de2f37b; Build92 base), Server c493eb06 (on Recovery 472513ef on live Server 84cc64e4). Report agent-handoffs/reports/20261008T144707Z-build93-recovery-native-card-and-wiring.md, main report commit d0737f2214e28af7963621e8f9c28711027a968e. Native 2,240 unit, 6 UI; Server 196 focused, no new full-suite failures. Existing approved Weekly/Monthly Recovery card implemented, Server composition wired OFF-by-default; NO real Founder Sleep read, policy activation, Server deployment or TestFlight. Need real prospective shadow calibration, reviewed deployment and separate authority installation; Server production Web build on latest wiring delta was held for disk headroom (13 GiB). Do not imply card automatically appears in first eligible briefing.
- Current release pointer remains Build92 beaf5eff, production Server 84cc64e4. These independent Native/Server candidates require semantic combined integration, conflict tests, and guarded release authority; neither is an automatically shipped Build93.
- Live Activity: Founder chose Dark WARM AMBER and Mineral Light OPTION B MINERAL NEUTRAL; color/theme implementation not yet delivered.
- Historical Static Hold seed and Super Set correction remain separately gated production-data operations, not yet applied.
- Energy backend audit report 20261008T131436Z-build93-energy-backend-audit.md (main b29c8ccf): source-correct where recorded; older exact target pair never canonically captured; NO corruption and NO repair warranted. Treat backend-cleanup task as DONE, and keep unrequested Energy Native UI/Server projection ON HOLD, outside Build93.

LIVE ACTIVITY VISUAL THEME — BUILD 93 FOUNDER REQUEST (2026-10-08)
- Founder screenshot shows existing iPhone workout Live Activity in Dark mode with teal/turquoise highlights (Current label, Complete Set button). This existing dark appearance works functionally but the Founder wants alternative DARK accent treatments to review before selection, plus a genuine MINERAL LIGHT Live Activity design.
- Theme authority: Live Activity must follow the user's persisted PhysiqueOS appearance selection (Dark vs Mineral Light) consistently on Lock Screen, expanded Dynamic Island and other supported ActivityKit presentation surfaces, including background updates and app restarts. Do not assume system appearance always equals in-app appearance. Audit ActivityKit/Widget extension's supported update and theme-propagation constraints; use explicit app-owned theme snapshot in activity content/state or equivalent supported method, with safe backward compatibility. Respect the user's current selection and update existing activity when feasible; document platform limitations rather than promise instant theme switches that ActivityKit cannot deliver.
- Keep all workout state and interactions identical: workout title, previous/current set, load/reps, rest stopwatch, Complete Set, progress and finish/cancel semantics. No source-of-truth changes or duplicate writes. Preserve accessibility, Dynamic Type, status contrast and legibility in both themes.
- FOUNDER DARK ACCENT SELECTED (2026-10-08): WARM AMBER, replacing teal/turquoise for the Live Activity's Dark mode highlights. Use established PhysiqueOS warm-amber/orange design tokens where suitable; maintain strong text/button contrast and status distinction. No further Dark accent comparison needed. This selection applies to Live Activity Dark styling, not an unrequested global app accent change.
- FOUNDER MINERAL LIGHT SELECTION (2026-10-08): OPTION B — MINERAL NEUTRAL. Use the existing light mineral background/surfaces with a DARK INK primary Complete Set action and restrained WARM AMBER status/progress highlights. Maintain contrast, readable prior/current set, rest stopwatch and activity progress. Founder selected the illustrative Option B comparison and does NOT need further competing Mineral Light color explorations; actual ActivityKit implementation/screens still require technical validation. Dark mode remains WARM AMBER as already approved. Both appearances must follow persisted in-app theme selection through supported Live Activity/Widget theme propagation, not just iOS system mode. No other Live Activity functionality or global app accent changes.
- Status: BOTH COLOR DIRECTIONS FOUNDER-APPROVED — Dark Warm Amber and Mineral Light Option B Mineral Neutral; implementation, real ActivityKit screenshots and testing pending. No release authorization implied.


FOUNDER BUILD 93 INTEGRATION DECISION — 2026-10-08 (SUPERSEDES STANDALONE HOTFIX RECOMMENDATION)
- Morning Weigh-In context fix from Codex candidate 01db8b2e2bfc67e8517d4fcdc90e58edb508c5fd, incident report agent-handoffs/reports/20261008T135843Z-build92-morning-checkin-context.md and GH issue #9, MUST be included in the COMBINED Build 93, NOT a standalone emergency TestFlight hotfix. Root cause is required href vs server projected typed destination. Preserve retry/failed-read guard, exact-once writes and user-entered weight. Current Build92 remains shipping until Build93 validated. Incident stays OPEN until Founder confirms working on device.
- Home Today's Priorities layout (new Founder screenshot 2026-10-08): three tiles in two-column layout (Morning Weigh-In, DEXA tomorrow, Foam Rolling). Foam Rolling third tile currently occupies HALF width and text wraps character-by-character, including "Rolling" and its time. Fix responsive odd-last-tile layout: Foam Rolling should SPAN FULL AVAILABLE WIDTH of bottom row, with normal readable title/time, balanced padding, appropriate line wrapping and existing completed visual state. Generalize to any odd last item, not a hardcoded Foam exception; test 1/2/3/4/5 priorities, compact/large Dynamic Type, Dark/Mineral, small/large iPhone, long names and status changes. No speculative redesign of other Home sections.
- Morning Weigh-In Home priority is an INPUT/NAVIGATION action, not directly completable from the Home priority tile. REMOVE/HIDE the circle/checkmark complete affordance on Home for this kind; keep tap/open-to-enter and the red Skip action if canonical semantics allow it. Completion must happen only after successful canonical Morning Weigh-In submission, not by Home priority completion shortcut. Preserve normal complete/skip controls on ordinary priorities. Do not accidentally write a check-in or mark Weight complete on tapping the tile.
- DEXA tomorrow is already separately queued as a non-actionable reminder: neither Complete nor Skip anywhere; keep Home reminder through appointment day. This screenshot confirms the Home DEXA tile still exposes both affordances; implement the existing Build93 requirement and test both tile and detail.
- Founder plans one COMBINED Build93 later today, but this is planning intent, NOT permission to bump/archive/upload before integrated gates. Codex should resume implementation on the Home layout/priority capability work and integrate the proven Morning fix in an isolated candidate, coordinating with Claude Recovery lane. No production mutation or separate hotfix release.
- Founder also wants a later reminder of the entered morning weight once fixed; the previous screenshot displayed 178.1 lb as USER ENTERED, not yet a saved canonical weight. Do not treat it as a persisted measurement. Reminder scheduling is handled separately in chat, not by GH backlog.
- Status: FOUNDER REQUESTED / NOT IMPLEMENTED OR PHYSICALLY ACCEPTED. Candidate report/test/Founder device verification required.


DEXA upcoming appointment — REMINDER-ONLY HOME PRIORITY (BUILD 93 FOUNDER REQUEST, 2026-10-08)
- Founder physically confirmed that the upcoming DEXA reminder/detail successfully appears on iPhone, showing the next-day appointment at the correct scheduled local time and meaningful What/When/Why information. This confirms reminder display, NOT that scan completion or HealthKit writeback has occurred.
- Product correction: the upcoming DEXA appointment is INFORMATIONAL ONLY, not a completable/skippable action. Remove/hide Mark Complete and Mark Skipped on the reminder's Priority Detail and any inline Home/notification/watch surfaces for this reminder kind. No completion/skip action or alternate mutation path should be exposed for this reminder. Do NOT globally remove Complete/Skip from ordinary actionable priorities; universal Skip remains the default for real tasks.
- Keep the DEXA reminder visible on Home for the entire scheduled local calendar day (including after appointment time) as a non-actionable reminder, without forcing user dismissal or converting it into a completed scan. Before that day, retain the normal upcoming reminder behavior. After the scheduled day, follow the existing expiry/rollover policy without retroactive completion/skip, and avoid stale permanent Home cards. Preserve correct local-timezone/date and the existing DEXA appointment editor/navigation.
- Reminder visibility and actual DEXA scan ingestion/confirmation are separate concepts. The reminder must NEVER imply scan evidence was received or that a scan was completed. Real DEXA evidence should still follow its canonical upload and prospective Apple Health writeback path.
- Engineering should audit the canonical reminder/priority kind and ensure Server and Native present consistent non-actionable capability semantics, including Home card, detail, notification/Watch actions if applicable. Fail closed for legacy clients/server command attempts to complete/skip this informational reminder, without weakening ordinary universal priority skip. Add date-boundary, non-actionable and regular-priority regression tests.
- Status: FOUNDER REQUESTED / BUILD 93 IMPLEMENTATION QUEUED, NOT YET BUILT OR SHIPPED. Do not change production data or claim acceptance from the screenshot alone.


BUILD 93 FOLLOW-ON ENGINEERING — AUTHORIZED HANDOFFS 2026-10-08 (AGENT START PENDING)
- FOUNDER decision: PROCEED with two narrowly scoped lanes, keeping the already approved single Recovery card design and limiting it to Weekly and Monthly only. Claude B existing Briefings conversation owns the next Native implementation and may prepare a separately tested, still-OFF-by-default Server wiring candidate. Full scoped GH prompt: agent-handoffs/inbox/prompts/20261008-build93-claude-recovery-native-wiring.md, prompt commit 86f88be194f059ef6576a1bb94f4227fd8cd7acd. Base Native exact shipped Build92 beaf5eff, reuse Recovery Server candidate 472513ef; no new design exploration, no Midweek Recovery, no production deploy, no real Sleep read, no policy activation, no TestFlight bump.
- FOUNDER corrected Energy scope: backend historical data investigation ONLY, NOT new Native historical history screen. Codex A existing Operating Plan thread owns a bounded source audit and, if safe established read-only guardrails work, a narrowly scoped owner-bound production READ-ONLY audit of canonical immutable Energy/Goal/phase versions, with sanitized findings; only later suggest a specific safe backend repair. Full scoped GH prompt: agent-handoffs/inbox/prompts/20261008-build93-codex-energy-backend-audit.md, prompt commit 6942b9e997c58e20b9f40c81b2a4014bbde96441. Prior projection Server e156e011 and Native UI 1bb88fb5 remain ON HOLD, not integration inputs. This authorization DOES NOT allow SQL writes, backfill, production apply, arbitrary broad private record reads, a new UI, or a deploy. Fail closed if read-only transaction and owner/source scope cannot be verified.
- Both may work in parallel. Claude owns expensive Native Xcode; Codex should not conflict with it. Preserve archives Builds 85–92, credentials, worktrees and unrelated simulators. Candidate work may be committed and remotely pushed only to the exact authorized branches; report-only publication must preserve release latest.json/latest.md at Build92.
- Static Hold definition restoration and historical Super Set corrections remain separate Build93 priorities with independent dry-run and APPLY approval boundaries. They are NOT assigned in these two concurrent lanes.
- Status: DETAILED TASKS STAGED ON GITHUB, NOT AUTOMATICALLY RUNNING. Founder needs to deliver prompts to existing conversations; do not label either task completed until GH candidate and report confirm results.


BUILD 93 OVERNIGHT ENGINEERING — COMPLETED CANDIDATES 2026-10-08 UTC (NOT DEPLOYED; FOUNDER REVIEW PENDING)
FOUNDER CORRECTION / SUPERSEDING SCOPE (2026-10-08): Recovery's single-card Dark/Mineral design was ALREADY accepted, so no new design/review exploration is needed; only tested Server/Native implementation against that design remains. Energy phase-history work was intended as BACKEND historical-data correctness/cleanup, not a new Native history UI. Codex Energy Server/Native candidates are isolated and ON HOLD; neither should be integrated until the actual data issue is identified and a narrow backend remedy is reviewed. The prior overnight task and delivery description below record what coders actually built, NOT approved scope.
- CLAUDE B / Recovery Weekly + Monthly only: Server candidate 472513efc8e107e77ced69ff654e89da5cd88931, branch claude/build93-recovery-weekly-monthly-server-20261008, exact parent live Server 84cc64e4. Report agent-handoffs/reports/20261008T055500Z-build93-recovery-weekly-monthly-server-candidate.md, main publication 7f83b49e8401c4d28817baf47edc8fec62a7a42b. Reconciled pure assessment, added prospective-only Sleep v3 reliability input projection, fail-closed authority (OFF), Weekly/Monthly optional artifact/composer/read seam, hard repository refusal of Recovery in Midweek/Daily/DEXA/Photo/all others. Publication composer STILL UNWIRED, Server not deployed, production authorization record absent, no real Sleep queried or changed; no Native rendering candidate. Focused 164/164, full Server failures identical to current base (294 failures plus 5 suite-load entries; 0 NEW failures), local Web build passed. Need Founder candidate review, separately authorized real prospective Sleep shadow read/calibration, bounded composition wiring, deployment, disabled-by-default authority activation and Native one-card rendering. Calendar theoretical first possible eligible Weekly Sun 2026-10-25 (period Oct 18–24; >=14 reliable prior baseline nights of possible Oct 2–17 plus >=5/7 current nights), NOT guaranteed. Oct 18 Weekly baseline cannot reach 14; Oct 2026 Monthly on Nov 1 baseline cannot reach 14; first possible Monthly for November is Dec 1 if >=20 November nights plus >=14 prior baseline. Monthly/Weekly scheduling and precedence unchanged.
- CODEX A / Energy Phase History: two isolated VERIFIED candidate branches: Server e156e01138aaa7488426029d7a8a51d8dcb85954 on codex/build93-energy-phase-history-server-20261008 (parent live 84cc64e4), Native 1bb88fb5dedab189946f215f48248852ba719875 on codex/native-build93-energy-phase-history-20261008 (parent shipped Build 92 beaf5eff). Report agent-handoffs/reports/20261008T055801Z-build93-energy-phase-history-candidate.md, main publication 354138a5c84fb8b8275a2d9035ac27cd461e1174. Server projects ONLY immutable phase-and-goal-linked reviewed protocolVersions caloricIntakeTarget and activityExpenditureTarget with exact inclusive/exclusive effective dates; missing/untrusted is unavailable, never invented. Native reads optional contract and renders authentic historical revision chronology in locked Dark/Mineral while keeping current Strategy unchanged. 58 focused Server tests and 376 focused Native tests passed, 72 final Native model tests, 1 UI screenshot test, Server Web build and Native Release passed; broader Server pre-existing fixture failures unchanged. Synthetic Dark/Mineral preview images are on Native candidate branch under agent-handoffs/artifacts/build93-energy-phase-history-20261008/; Founder has NOT reviewed or accepted them. No real Founder phase-target records queried; owner-scoped read requires new authorization if needed. Neither candidate deployed; Build 93 not bumped/uploaded.
- CONCURRENCY AND BOUNDARIES: Agents coordinated expensive Xcode/Next builds and preserved archives/credentials. No production data reads/writes, policy activation, historical Static Hold seed/Super Set correction, Server deploy, release bump, TestFlight upload, latest.json/latest.md mutation. Historical Static Hold/Super Set remain separate Build 93 work, not assigned overnight.
- BACKLOG STATUS: candidates delivered and remotely verified; NOT shipped/accepted. The next decision is review and gated integration planning. No automatic publication or production write authorization implied by overnight completion.

Historical Static Hold variant restoration — BUILD 93 APPROVED PLANNING ITEM (Founder request, 2026-10-07).
- Goal: restore the two canonical historical Static Hold definitions as selectable per-exercise variants in the already-shipped Build 92 Create/Select interface. Exact Founder history verified previously: Spider Curls (spider_curl) and Pendulum Squat Machine (pendulum_squat_machine). Preserve legacy key static_hold and original weighted-reps/load semantics. No invented duration or timed-hold variant.
- Implementation readiness: Training Variants Server/Web code already LIVE at 84cc64e4e7205b2540bf78ea43afd1cbfb068d06; Native variant Create/Select already VALID in Build 92 beaf5eff9d3c4147fba4dec095e8092c0fae9b91. Deployed Server contains deterministic legacy seed utilities and 6 focused synthetic seed tests. Deployment's read-only audit found ZERO canonical variant definitions; the historical evidence remains untouched. No new Native feature implementation is necessary merely to populate existing definitions.
- Execution sequence: first fresh production/runtime authority check and separately explicitly authorized READ-ONLY dry run; present exact intended creates/reactivations, owner-scoped counts, history/evidence hashes and drift guards for Founder review. Only THEN request a separate explicit authorization for a bounded apply of at most TWO definition records using the dry-run facts and idempotence checks. Verify canonical reads and historical alias resolution afterward without rewriting any workout/evidence/performance events.
- Never seed super_set: historical Super Set misclassification/correction is a DIFFERENT Build 93 item with independent audit and apply gates. No automatic Seed Apply, no production mutation, no backfill, no unexplained records and no broad training catalog reset. Preserve ordinary mode, progression/PR partition isolation, Build 91 compatibility and the real Founder training history.
- Status: FOUNDER REQUESTED FOR BUILD 93 PLANNING; SEED NOT RUN. Adding this to the Build 93 list authorizes planning only, NOT the dry run or apply. Since the underlying Server/Native feature is already shipped, this is a separately gated production-data operation; it need not consume a Native release or hold an unrelated Build 93 upload absent new evidence.

Operating Plan Energy phase history — FOUNDER SCOPE CORRECTION: BACKEND DATA AUDIT / CLEANUP ONLY (2026-10-08).
- Founder clarified that the intended work is a BACKEND/canonical historical-data cleanup and correctness project, NOT an additional Native Operating Plan history display or new design surface. Prior ChatGPT assignment over-scoped this into a Server read projection + Native screens; that extra UI scope has NOT been accepted. Do not include Native history screens in Build 93, request UI design review or assume new presentation is desired.
- First determine the specific existing historical Energy/phase strategy data inconsistency or omission: audit canonical immutable protocolVersions, phase/goal identity links, effective dates, historical intake targets and activity/expenditure targets, existing read/correction semantics, and whether anything actually needs repairing. A read-only production audit of real Founder records needs separate express approval and approved owner-scoped READ ONLY guardrails; no ordinary test fixtures can establish whether Founder history is correct.
- Only after the historical data issue is confirmed should the team propose the SMALLEST backend-only corrective action, with exact changed records, before/after canonical values, preserved history and guards. Any production repair/apply requires another separate explicit authorization. Never infer missing targets from current strategy or logged nutrition/activity, rewrite historical evidence, backfill, or alter active Energy Strategy, phase transitions, Confidence or Briefings.
- Existing Codex overnight candidates: Server e156e01138aaa7488426029d7a8a51d8dcb85954 implements additive historical read projection; Native 1bb88fb5dedab189946f215f48248852ba719875 implements unrequested historical UI. Neither was deployed/merged; NO Founder approval for integration. Mark BOTH ON HOLD until the backend issue and precise solution are understood; the Native candidate should remain isolated and excluded from Build 93 integration. A read-only projection alone is NOT proof that any canonical data were corrected.
- Status: NEEDS TARGETED BACKEND ROOT-CAUSE CLARIFICATION AND DATA AUDIT; UI SCOPE WITHDRAWN / NOT AUTHORIZED. Build 93 candidate only as a bounded backend-correctness follow-up, not a shipping Native feature or release blocker. Original Codex report on main: agent-handoffs/reports/20261008T055801Z-build93-energy-phase-history-candidate.md (354138a5c84fb8b8275a2d9035ac27cd461e1174).

Recovery Briefing V1 — BUILD 93 PREPARATION / WEEKLY AND MONTHLY ONLY (Founder scope locked 2026-10-07).
- Founder reiterated 2026-10-08: the RECOVERY CARD DESIGN HAS ALREADY BEEN DONE AND APPROVED (the original contiguous one-card hierarchy). Reuse the accepted Weekly/Monthly design as-is; NO further design rounds, visual explorations or new conceptual card designs are requested. Server candidate 472513ef is logic/composition groundwork, not a design project. Native implementation has not been completed; implementing the existing design in a real Weekly/Monthly screen remains a coding task, not another design approval.
- Founder explicitly limits Recovery card publication to the WEEKLY and MONTHLY recurring briefings ONLY. Midweek, DEXA, Photo and all other briefing types MUST NOT contain the Recovery card or a Recovery section; any older design/prototype suggesting Midweek Recovery is superseded. This is a product-level constraint on Server artifact composition and Native presentation, not merely a style preference.
- Founder wants the accepted single Recovery card in the FIRST ELIGIBLE WEEKLY after >=14 actually RELIABLE PROSPECTIVE Sleep V3 nights in the prior-28-night baseline and adequate Weekly coverage; monthly publication can follow only when separately eligible under its own monthly coverage and baseline rules (the approved shadow candidate uses >=20 current-month reliable nights). These are data-readiness constraints, not calendar timers. Never invent an eligible date, force an assessment or write to earlier artifacts.
- Truth checked against original source report agent-handoffs/reports/20261001T224516Z-recovery-briefing-v1-shadow-assessment.md, candidate 1bfa92ef874c3c96f05b23a9d3cbdfb956384156: the one-card design and pure deterministic Server shadow assessment were implemented/tested (89 tests) BUT deliberately UNWIRED and NEVER DEPLOYED. There is no production shadow input-authority/composition connection, scheduled shadow evaluation or active briefing recoveryAssessment publication. Therefore the first eligible Weekly WILL NOT automatically acquire a Recovery card under current production behavior.
- Sleep V3 prospective canary is Founder-confirmed COMPLETE; do not reopen it. Build 93 preparation requires reviewing/authorizing the prospective-only validation-only Sleep-to-Recovery authority/composition boundary, reconciling the isolated older Server candidate against live Server 84cc64e4, testing REAL prospective shadow output without strategic writes, reviewing calibration, then separately authorizing future-only recoveryAssessment publication into NEW eligible WEEKLY and MONTHLY briefing artifacts and the accepted one-card Native rendering. Include explicit Server and Native regression tests verifying NO Recovery field, card, placeholder, empty Recovery section or Recovery-specific graph in Midweek, DEXA, Photo or other excluded briefing types. Preserve unchanged Midweek's existing non-Recovery briefing content.
- Approved one-card statuses: Green / Yellow / Red / Not enough data, with Green typically quiet. No Recovery Score, no automatic Goal/Strategy Confidence movement, no strategic Sleep graduation and no historical briefing backfill. No Recovery card in Midweek under any status.
- Next action: prepare the scoped Server + Native readiness and tests EARLY enough to aim for first eligible Weekly, with Monthly as the second allowed cadence. If approvals/tests/data delay that first Weekly, report it honestly; do not silently claim Recovery is scheduled, active or published.
- Status as of 2026-10-08: new Server CANDIDATE READY FOR FOUNDER REVIEW at 472513ef (see overnight delivery above), with prospective-only projection, disabled authority and never-Midweek enforcement. Still NOT wired, deployed or published, no real Founder Sleep read and no Native Recovery card; shadow calibration and authorization remain pending. First theoretically eligible Weekly is Oct 25, not necessarily the first actual qualified Weekly. Separate review/deploy/production-read/authority activation decisions are required.

DEXA appointment access — ACCEPTANCE ONLY, NOT BUILD 93 NEW FEATURE.
- The previously unavailable Priority Detail View DEXA Appointment destination was fixed in Build 91, inherited by Build 92. Only real-device Priority → Next DEXA Scan → DEXA editor/save/back confirmation remains. The Oct 9 real DEXA → Apple Health prospective verification is separate.
- Exact report: agent-handoffs/reports/20261007T220548Z-build91-native-integration-candidate.md (main publication 1d83b999ac2915f33588e40d017664cd952061a2). Historical F1 'unavailable' design-audit note is stale.

Historical Super Set evidence classification correction — BUILD 93 FOUNDER-REQUESTED SCOPE (promoted from deferred, 2026-10-07).
- Goal: correct the three historical canonical Training evidence occurrences that have "Super Set" / super_set misclassified as an executionVariant. The relevant exercise groupings include Leg Extensions + Sissy Squats and Seated Hip Adductions + Abductions. Superset is an exercise relationship, not a per-exercise execution variant.
- Audit first: use a separately authorized bounded owner-scoped READ-ONLY production audit/dry run to identify exact evidence IDs, original source text, current revisions, exercise order, completed sets and relationship-group semantics; establish hash/digest, baseline PR/progression/history state, eligible targets and any superseded records. Produce an exact proposed correction and verify zero unintended effects. Do not assume the three records can be corrected identically without examining their source.
- After Founder reviews the dry-run facts, require separate explicit authorization for the canonical evidence correction/supersession path (not a direct mutable history rewrite). Preserve all originally performed exercise/set/reps/load facts, linkable history, dedup/idempotency, correction provenance and appropriate PR/progression partition integrity; explicitly assess whether the changed historical relationship classification affects any current record or progression interpretation.
- The deployed Build 92 Training Variants Server already reserves the Superset name for new execution variants, so new misuse is prevented. Historical misfiled occurrences remain untouched until a separately authorized apply. This is separate from the two Static Hold legacy-definition seeds; NEVER seed super_set.
- Acceptance: read-only post-correction proof of exactly intended canonical changes and unchanged unrelated evidence/performance records, with Native/Server history rendering consistent with actual superset relationships and no invented workout details. Stop rather than guess where genuine historical intent cannot be established.
- Status: FOUNDER REQUESTED FOR BUILD 93 PLANNING, NOT YET AUDITED OR CORRECTED. Adding this to the list authorizes planning only, NOT production read/write, source deployment or a TestFlight release.

CURRENT DELIVERY / OPEN ACCEPTANCE AUTHORITY — 2026-10-07 local (LATEST; supersedes historical Build 91 and pre-release Build 92 roadmap snapshots below)

Build 92 is RELEASED TO TESTFLIGHT (Apple build-status VALID; import-status VALID), NOT YET PHYSICALLY ACCEPTED BY FOUNDER.
- App: com.physiqueos.native.dev 1.0 (92); exact shipped source beaf5eff9d3c4147fba4dec095e8092c0fae9b91 (only Build 92 version-bump on exact validated Native integration 56c51e4f7f41b521845dcfc2b9f0583407494e3c).
- Delivery: 56b0c334-b8f5-42e4-979b-78e68a6d0573, VERIFIED VALID; archive PhysiqueOS-Build92-beaf5eff.xcarchive retained. Report: agent-handoffs/reports/20261008T044757Z-build92-testflight-valid.md; publication main commit 5273e868b6e750c7b93affdd5874721747bb19fe.
- agent-handoffs/latest.json and latest.md were advanced with guarded release authority from Build 91 to Build 92. The NEXT build is 93. Do NOT use the stale Build 91/next-92 declarations further down this historical backlog as active release authority.
- Production Server/Web: 84cc64e4e7205b2540bf78ea43afd1cbfb068d06, deployment 32143aa4-90d4-496a-81b2-17f35a609fde, ACTIVE 9/9 and ready 9/9. Report: agent-handoffs/reports/20261008T021639Z-build92-training-variant-server-deployed.md; main report commit 9e2084c8ee2385ced7a6e1d674eacf52f3523fb1. Supersedes 738ce668; Universal Skip and prior Confidence/Adaptive Progression behavior retained.
- Native integrated report: agent-handoffs/reports/20261008T025315Z-build92-native-three-lane-integration.md; main report commit 2210e488723f4fc84dff3376660935eb7479e79f.
- Full shipping Build 92 release validation: 2,223 iPhone unit cases passed (one intentional skip), 75 Watch unit passed at both tested sizes, 147 focused release-contract cases passed, Release compilation/archives/entitlement/seam/configuration gates passed; iPhone UI 87 pass in one 93-case long run plus 6 order-dependent Sandbox state failures that ALL passed in isolated clean-simulator reruns. Do NOT misrepresent the uninterrupted long run as 93/93. Follow-up: reset Sandbox draft between TrainingAcceptanceUITests; known Watch UI no-WCSession simulated finish-confirmation limitation remains 9/10 per size, baseline reproduced. These are non-blocking test-harness backlog items, not physically accepted product features.

DEXA appointment navigation — correction to historical design-audit note: the formerly unavailable Priority Detail 'View DEXA Appointment' destination was implemented and tested for Build 91 (Next DEXA Scan, return-to-Priority crumb and Coaching Updates DEXA editor route), and carries into VALID Build 92. Source: agent-handoffs/reports/20261007T220548Z-build91-native-integration-candidate.md (main report commit 1d83b999ac2915f33588e40d017664cd952061a2). Status: IMPLEMENTED / TESTFLIGHT SHIPPED / FOUNDER DEVICE ACCEPTANCE PENDING for Priority → View DEXA Appointment → edit/save/back; not an unimplemented new-build feature. Old 'unavailable' text in the historical F1 audit is superseded by this correction.

Build 92 shipped scope / remaining acceptance gates:
1. Training Execution Variants V1 — SERVER DEPLOYED, NATIVE IN TESTFLIGHT, VISUALS FOUNDER APPROVED. Shipping Native from Claude candidate 39b818e214c858ab127f891e3010760ba2ad9b17. Founder accepted ten authentic Dark/Mineral/Create/Select/Watch review boards without changes; report main 8272186ab8f2b2912545f5fb338160d3c29933ca, approval 3630d60193b838ea792f0aab8b97525c0f9aa9f7. Create and select are per exercise, no timing or rename/retire UI; preserves sets/load and history partitions. Production deployment audit found ZERO saved variant definitions. Build 92 SHOULD show Ordinary and Create Variant on canonical exercises; historical Static Hold is NOT yet populated. Founder physical create/select/Watch-label acceptance PENDING. DEBUG-only screenshot/review branch 7c17645e was intentionally excluded from shipping. Legacy Static Hold seed dry run and seed apply are TWO SEPARATE NOT-YET-AUTHORIZED production actions; Super Set misclassification repair is separate future work. Do not mark either seeded, and do not invent populated choices.
2. App-wide redesign closeout — DESIGN COMPLETE and founder visually approved where specifically reviewed, IMPLEMENTATION SHIPPED IN BUILD 92, PHYSICAL ACCEPTANCE STILL PENDING. Native visual candidate f6b394233b21429044af100dc180657132da5e30 plus integration Logger refusal/error-state finishing. Includes Home secondary states, Workout Match states, DEXA PDF wrapper, evidence date picker, training support media, widget refresh >=44pt and dark/mineral polish. No more design boards are required absent a Founder-reported defect. Do not reopen as unfinished design; close final physical-acceptance gate only upon Founder confirmation.
3. Home Priority one-tap Skip / confirmed-only fading completion feedback — CODE SHIPPED IN BUILD 92 (plus Server universal priority.skip.v1 already live). Red 44pt direct Skip, no ellipsis/confirmation, grouped rows included, brief ~1.3-second in-page acknowledgement after canonical success. Physical in-app acceptance pending.
4. Apple Health repeated permission repair — CODE SHIPPED IN BUILD 92 from Codex HealthKit candidate 6c52df29191ae27b1337bec0c8048f602052747c. Exact-scope authorization-status preflight, shared iPhone coalescing, Watch automatic-vs-direct consent timing, original HealthKit workout and DEXA writeback behavior preserved by tests. Physical verification of absence of repeated sheets and legitimate first consent still pending. Do not claim OS-level behavior proven on hardware.
5. Remaining Logger U01 refusals / stale test helper — SHIPPING PRODUCT PRESENTATION FIX SHIPPED, targeted unit/UI passed. The separate 6 long-run order-dependent Sandbox UI failures remain a test-isolation maintenance item.
6. Build 91 physical Watch footer/ready-haptic concerns — INCOMPLETE FOUNDER DEVICE ACCEPTANCE, carried into next real workout/Build 92. Do not imply acceptance due to Build 92 VALID. Check Watch footer, once-per-fresh-preparation ready vibration, workout start/handoff and finish/cancel; record actual results. Physical acceptance of Build 92 as a whole PENDING.

Other OPEN work unchanged:
- Real canonical DEXA scan on Friday 2026-10-09: verify prospective Apple Health Body Fat Percentage plus fat-free Lean Body Mass only (NO Weight), timestamp, provenance, dedup/reconciliation and no feedback loop; no historical backfill.
- Recovery Briefing V1: Build 93 candidate 472513ef now implemented (not deployed/wired); target first eligible WEEKLY (earliest theoretically Oct 25 if verified) and MONTHLY only (earliest theoretically Dec 1 for November). Explicitly NO Midweek/DEXA/Photo Recovery card. Reliable prospective nights, calibration, Server wiring and separately authorized publication remain. Sleep V3 canary stays Founder-closed.
- Operating Plan Energy history: Founder corrected Build 93 scope to backend historical data correctness/cleanup ONLY. Proposed Native history display is unapproved and excluded. Existing Codex Server/Native UI candidates are ON HOLD pending root-cause read-only audit and a narrowly specified backend solution; never reconstruct missing targets.
- Beta readiness, future Settings/account features, potential Super Set cleanup and other accepted deferred projects remain independent.
- Prior Founder-confirmed completed six features remain CLOSED; no resurrection based on historical entries further down this file.

BACKLOG EXECUTION RULE REINFORCEMENT (Founder request 2026-10-07):
At EACH material GH implementation completion, production deployment, TestFlight VALID release, Founder visual approval, physical acceptance, deferral or removal: reconcile this backlog on origin/main with exact branch/release/report identities and current truth. Distinguish CANDIDATE READY vs DEPLOYED/SHIPPED vs VISUALLY ACCEPTED vs PHYSICALLY ACCEPTED. Do not close on test pass alone. Retain precise separate follow-up items, original authority, and historical context. Any handoff/release lane should verify backlog parity as part of closeout; backlog update must never silently move latest release pointers or mutate Founder data.

HISTORICAL BUILD 91 → 92 SCOPE / DECISIONS — 2026-10-07 (SUPERSEDED BY CURRENT DELIVERY AUTHORITY ABOVE)

Latest Native authority: Build 91, release SHA 106f05183ea3e2328496acce0636dc087116bbce, TestFlight VALID; live production Server 738ce66849a1361b4ce0ed069a4a04eac6abc4ef. The next Native build number is 92. These are planning decisions and Founder acceptance expectations, NOT authorization to deploy, build, release, change production state or start other unapproved scope.

BUILD 91 — PHYSICAL ACCEPTANCE
Status: In progress, Founder plans to finish Thursday 2026-10-08 during the next real Watch workout. Do not mark accepted in advance; capture real-world Watch footer, once-per-preparation ready haptic, execution and any remaining Evidence/OP/Skip findings. Preserve Build 91 unchanged.

BUILD 92 — FOUNDER-APPROVED IMPLEMENTATION SCOPE (2026-10-07; NO DEPLOY/TESTFLIGHT AUTHORIZATION)
A. Training Execution Variants — INCLUDE. Initial Server foundation already implemented but remains isolated, NOT deployed: exact candidate 6ac19b8c2e224a91a04e53aa5029ad14d2f3e2a3. It was based on older Server e7ffc671; fresh compare/rebase/semantic conflict audit against live Server 738ce668 required. Native Create + Select per-exercise variant UI and contract, canonical partitioning, compatible Web projection, plus legacy Static Hold seed gated by separate explicit operational authorization. No timed logging for V1; no fabricated durations; do not seed real Founder history without separate authorization. Verify full compatibility before deployment, and preserve separately issued Server and Native release controls.
B. Home Priority Skip + feedback — INCLUDE. Founder asks for a red circular, immediately tappable 44pt effective Skip action replacing ellipsis/menu/dialog and for a short in-page confirmed-only fading Skipped/Completed indication, including eligible grouped rows. Staged task at c961acb789c8cbbceb3baa59b08814a61ee2d976. No change to canonical priority.skip.v1 semantics.
C. Apple Health repeated authorization repair — INCLUDE. Audit report on main 0fee162b2f64c427053acdd5a05e219d51ef2c6b identifies redundant requests, phone race, Watch per-workout raw request. OS-status exact-scope preflight, per-target coalescing and foreground-only deliberate UI, with no invented read-grant status or request scope broadening; must preserve Watch HealthKit workout start/save. No automatic permission reset.
D. Home Screen widget refresh accessibility — INCLUDE. Enlarge effective refresh hit region to >=44x44 pt for small and large without changing visible glyph, widget routing, current Start/Resume workout behavior, or source authority.

FINAL REDESIGN CLOSEOUT — FOUNDER APPROVED FOR BUILD 92 (2026-10-07)
The final 98-group audit (report on main 65e221d10a52d9ef89ae19e4dcf528ca2c66de07) declared DESIGN COMPLETE: zero undesigned surfaces; major UI ships in Build 91. Founder now authorizes completing the remaining bounded presentation-state tail in Build 92: Home secondary/no-goal/older-briefing state styling, Workout Match confirmation/refresh/processing/failure/dismissed states, DEXA PDF app-owned wrapper chrome, evidence intake date-sheet wrapper, training supporting-media placeholders, and truthful Logger validation/refusal displays, using only locked Dark/Mineral family patterns. Home red direct Skip and Widget target are in the same closeout scope. The active Logger implementation file ownership belongs first to the Training Variants lane; coordinate the small Logger refusal/error-state finishing work at integration rather than colliding with that lane. No new design boards or new feature semantics; no speculative product-policy changes. Closure requires tests and Founder physical acceptance. No earlier phase-history data work is bundled.

OPERATING PLAN ENERGY PHASE HISTORY — HISTORICAL BUILD 92 DEFERRAL; SUPERSEDED BY BUILD 93 FOUNDER REQUEST ABOVE
Founder explicitly punted this historical presentation change. Active Energy Strategy remains correct; immutable prior-phase calorie/activity targets and dates are not yet available in the Native detail because the Server does not project the historical snapshots. Do NOT include Energy history Server or Native work in Build 92 or let it block Training Variants/redesign closeout/HealthKit repair. Retain as a separately authorized later enhancement; no reconstructed historical estimates.

RECOVERY BRIEFING V1 — WAIT FOR RELIABLE BASELINE AND FIRST ELIGIBLE WEEKLY
Founder confirms the Sleep V3 prospective canary validation is complete. Waiting for >=14 reliable prospective nights under the accepted algorithm, then the first Weekly briefing eligible after that threshold. Earliest possible eligibility is mid-October, but do not infer readiness just from elapsed calendar days. Shadow interpretation, cautious Recovery assessment in future briefing artifacts and any strategic Sleep graduation remain separate authorization/verification gates; do not publish Recovery on a date assumption. Do not reopen the closed Sleep canary.

BRIEFING NARRATIVE / GOAL CONFIDENCE
Founder reports current quality is good and wants ongoing observation over time. Deprioritize proactive narrative-tuning project; reopen only for concrete examples, calibration drift or meaningful regression. No active rewrite authorized.

DEXA -> APPLE HEALTH
Existing prospective policy already active for canonical DEXA dates >= Friday 2026-10-09. Founder expects confirmation after the actual 2026-10-09 scan, NOT a new implementation. Validate exactly the two authorized output types (Body Fat Percentage and fat-free Lean Body Mass, NOT Weight), canonical acceptance, deduplication, provenance and no feedback loop. No historical backfill or synthetic writes. Set the appointment time before the scan when applicable. Keep existing protection until the first real prospective verification.

RELEASE, STORAGE AND REPORT RULES
Build 92 planning does not itself authorize merges, production deployment, Founder data changes or TestFlight. Future coder tasks must specify the exact branch/commit publication authorization for dustinginn/physiqueos and authorize bounded additive report-only publication through the guarded installed publisher, leaving latest.json/latest.md unchanged for non-release work; only a VALID new TestFlight release may move latest under --release-authority. Reuse existing approved worktrees/sessions when relevant; no child chats/extra worktrees. Maintain safe disk headroom via addendum 4bcfe4d861eb5abeb0cdfef1dead1fdc1d926217 and protect all archives, credentials, active lanes and unreproducible artifacts.


FOUNDER COMPLETION RECONCILIATION — 2026-10-07 (CURRENT AUTHORITY)
Founder explicitly confirmed the following SIX as completed; they are CLOSED and must not recur in active planning merely because older report/issue text still says pending:
- Training Detail workout PR card below Workout Summary (GitHub #6; Founder confirmed complete).
- iPhone Logger rest stopwatch for phone-only workouts (GitHub #7; Founder confirmed complete).
- Guided iPhone-to-Watch workout handoff (GitHub #8; Founder confirmed complete).
- Workout Live Activities + Dynamic Island physical feature acceptance (prior active item 1; Founder confirmed complete).
- HealthKit Sleep V3 prospective canary validation (prior active item 4; Founder confirmed complete). This does NOT activate strategic Sleep interpretation, certify 14+ reliable nights for a Recovery baseline, or complete Recovery Briefing V1.
- Mac automated iCloud backup/recovery verification (previous local/remote-proof backlog; Founder confirmed complete). Earlier Oct 3 remote durability UNKNOWN/partial archive-tier text remains historical audit evidence, not an open user-directed project. This reconciliation did not independently re-query iCloud or newly prove third-party remote durability; operational health can be checked if a future backup incident arises.

These six closures are Founder-reported acceptance, not independently rerun technical/device tests in this backlog-maintenance step. Preserve technical report histories and never invent missing run IDs, logs or proof. On 2026-10-07, shipped Native Build 91 (106f05183ea3e2328496acce0636dc087116bbce) is VALID in TestFlight; future backlog planning starts from its shipped authority, not the historical Build 77–85 roadmap snapshots. Current other work remains open, including Build 91 physical acceptance of NEW changes, post-Build-91 redesign closeout, HealthKit repeat-authorization fix, Training Variants Build 92, Recovery Briefing shadow work and beta readiness.


DELIVERY WORKFLOW RULE (durable, 2026-10-02)
- Normal Native distribution is TestFlight-first: Claude/Codex archive on the Mac -> guarded App Store Connect upload -> TestFlight VALID -> Founder installs remotely -> physical acceptance.
- Tethered (USB / same-Wi-Fi / local device tunnel) installs are exceptional bring-up/debugging only.
- Future prompts must not make local Mac or device reachability a routine release gate.

ACTIVE / NEXT

00. DEXA -> Apple Health writeback — DUE before Founder DEXA Fri 2026-10-09
Status: **PROSPECTIVE POLICY ACTIVE / ZERO CURRENT INTENTS / OCT 9 ACCEPTANCE PENDING** (2026-10-03).
Report: agent-handoffs/reports/20261003T171246Z-dexa-healthkit-prospective-policy-activation.md
Current authority:
- Server `b47663b32372a78010dbc8e4aa41303012d98dc7`, deployment `b9449c52-5444-4dae-9f44-fd0261b1a9d3`, remains ACTIVE and healthy.
- Native Build 84 `bcd92c74602695766c270fe6af052de45afece4b`, delivery `a4b7b504-e0ba-4cb5-9909-3e01cc8156d5`, is installed and physically validated.
- Founder confirmed the bounded Sep 12 pair in Apple Health: BF% `8.1%` and fat-free Lean Body Mass `160.5 lb`; no Weight. Guarded deletion removed both samples, and production receipts now show the exact two final `deleted` / `absent` states.
- Read-only closeout found zero feedback-loop observations/evidence, zero DEXA Weight intent/receipt, no Sep 12 canonical semantic/revision change, no historical permanent intents, and zero current or candidate permanent intents.
- Founder authorized and the guarded create-only mutation created exactly one version-1 policy record at `2026-10-03T17:09:54.334Z`: enabled, effective canonical scan date `2026-10-09`, only `bodyFatPercentage` + `leanBodyMassFatFree`, prospective-only, no backfill.
- Fresh preflight, in-transaction checks, parent post-readback and an independent post-activation audit all passed. Current permanent intents remain `0`; all three existing DEXAs remain excluded; Sep 12 receipts remain final `deleted` / `absent`; all protected Weight/Evidence/Confidence/Briefing/Sleep/Training/Cardio counts and digests are unchanged.
- **Active prospectively:** the first eligible permanent write can only arise from an accepted canonical DEXA dated `2026-10-09` or later. No historical writeback occurred.
Validation controls: retain the guarded Sep 12 controls temporarily in installed Build 84 until the first real Oct 9 prospective write succeeds; do not invoke them again. Then hide/remove them in the next consolidated Native build rather than create a cosmetic-only build. The normal DEXA -> Apple Health toggle remains.
Pre-scan prep: make sure the Oct 9 DEXA appointment in PhysiqueOS has its local time set (used as the sample timestamp).
Incidental (not fixed): web Evidence Review discard lacks status guard; possible briefing-step lookup issue on same-date DEXA re-import (unverified).

0. Progress Photos flexible cadence (Every N Weeks / Months) — SHIPPED, pending Founder acceptance
Status: Server 4ffde0f5 deployed (deployment faaf66bd) and verified; Native Build 81 (source 6a093251) uploaded VALID (delivery 212d79dd-cc57-4319-ab8c-d9694f0585ad); next build 82. Report: agent-handoffs/reports/20261002T070000Z-progress-photos-flexible-cadence.md.
What changed:
- Coaching Updates > Progress Photos: "Every [1-12] [Weeks | Months]" + "On [day]" / "On the [first..fourth|last] [day]"; monthly = weekday of the month (not day of month).
- Existing Every 2 weeks schedule unchanged (no migration); cadence changes are future-only with a predictable first date; same-day changes amend with audit, and a same-day revert restores the original dates.
- Photo Event briefing semantics unchanged (completed confirmed session only).
Acceptance (Build 81): Every 2 weeks loads; 3 weeks and 1 month save/reopen retained; set the wanted cadence before Saturday; specific time, reminder toggle, Photo Event toggle unchanged; exactly one pending Progress Photos reminder.
Note: after a 3+ week or monthly cadence is saved, Builds <=80 cannot open Coaching Updates (fail closed by design).

1. Workout Logger Live Activities — FOUNDER CONFIRMED COMPLETE 2026-10-07
Status: Shipped in Build 77 and carried through Build 91; Founder confirms iPhone Live Activities and Dynamic Island complete. No remaining acceptance gate for this item.
Authority:
- shipping source c299fa29
- final report agent-handoffs/reports/20261001T220947Z-workout-live-activities-phase1-implementation.md
Historical acceptance checklist (completed by Founder confirmation; not a new task):
- Lock Screen/Dynamic Island, load/reps, Complete Set, Stopwatch, finishing, supersets, deep link and lifecycle behavior.

2. Performance Record celebration — PHYSICAL ACCEPTANCE PASS; larger polish shipped in Build 85 (VALID)
Status: the Build 84 real workout physically passed both session-volume (7,500 lb) and reps-at-load (15 reps at 125 lb) records. Exact Build 85 source `b8ee8690b194cb90086b62816b9a2c8c400dc026`, delivery `a8c393e7-7d2c-41f0-9ba0-d37f43e53dc1` VALID, makes the confetti noticeably larger while preserving one-time persistence and Reduce Motion.
Build 78 report: agent-handoffs/reports/20261002T010500Z-native-build78-completion-notification-polish.md
Authority:
- fix branch codex/workout-pr-celebration-lifecycle-fix-20261001
- fix SHA 69cad804e2ac7d74ed98914e1601f2e7863dadc3
- audit agent-handoffs/reports/20261001T170354Z-workout-performance-record-celebration-audit.md
Decision:
- do NOT create a dedicated build solely for this fix.
- keep it ready for the next consolidated Native release, currently expected Build 78.
- when Build 78 scope is assembled, review/rebase/integrate this exact fix against current Native authority and rerun its lifecycle tests.
Acceptance:
- future natural workout with at least one supported canonical PR;
- PR details visible after confirmation;
- confetti once when appropriate;
- navigation/background timing cannot consume the celebration;
- no historical replay.

3. Actionable Priority notifications — add Skip action
Status: SHIPPED in Build 78 (VALID), pending physical acceptance. Simple binary Priorities get Complete (check-circle) + Skip + Snooze; Morning Check-In/weight unchanged. Build 79 (VALID) extends Skip to peptides and Foam Rolling from the Server-owned skipCommand (see BUILD 79 below); supplements remain Complete + Snooze.
Context:
- PhysiqueOS now supports a canonical skipped state for applicable actionable Priorities.
- Existing actionable notification flows already support actions such as completion and snooze.
Requirement:
- expose Skip from actionable Priority notifications when the underlying Priority/action supports canonical skipping;
- route through the same canonical Priority mutation semantics as in-app Skip;
- do not create a notification-only skip state;
- notification/UI state must reconcile after the action;
- preserve dose-aware/specialized completion semantics for priorities that require them;
- fail soft if Skip is not valid for that occurrence.
Build decision:
- do NOT create a dedicated build solely for this.
- integrate/review with the next consolidated Native release, currently expected Build 78, alongside the staged Performance Record celebration fix.
Acceptance:
- supported Priority can be skipped directly from notification;
- resulting occurrence is canonically skipped and reflected in Home/Priority detail;
- unsupported Priority does not offer an invalid Skip action;
- repeated/stale action is safe;
- notification clears/updates appropriately.

4. HealthKit Sleep — prospective canary FOUNDER CONFIRMED COMPLETE 2026-10-07
Status: Founder explicitly confirms completion of this V3 prospective-canary milestone. Historical 2026-10-02 audit was HOLD, prior to this confirmation; no new per-night telemetry/audit logs were independently retrieved in this reconciliation. sleep-canon-v3 ACTIVE for ordinary prospective Sleep (effective 2026-10-02; policy healthkit_sleep_canonical_algorithm_policy). P2 Oura copy splice resolved prospectively: Oct 2 corrected v2 rev2 -> v3 rev3 (asleep ~455, deep ~98.5, REM ~117.5, core ~239, awake ~25 min, 73 segments; one coherent revision, 0 ambiguity). Activation changed exactly 2 of 52 collections (config + Oct 2 day); historical mutation 0; strategic mutation 0. Founder accepted the rare out-of-order Oura revision ambiguity as a known residual (visible via ambiguousContinuationCount). D0 2026-10-02 validation_only. Strategic Sleep OFF.
Authority:
- Server `89fe0a0340adee22d15b92a1f074a0bbd348ac77` (deployment `28678d4a-e3cc-4b2b-a479-1851ab7093bf`) carries Sleep v3 unchanged; Native Build 83 `3e61dd215e8474c52bd54230d2d9dfb2f3a93534` (TestFlight delivery `507b409f-a29f-48a0-93b4-49ab46b5ad6d`, VALID) remains v2+v3 stage-capable.
- activation report agent-handoffs/reports/20261002T220000Z-healthkit-sleep-canon-v3-prospective-activation.md
- v3 design report agent-handoffs/reports/20261002T201500Z-healthkit-sleep-canon-v3-copy-coherence.md
- canary audit agent-handoffs/reports/20261002T182755Z-healthkit-sleep-prospective-canary-audit.md
Historical validation plan from the earlier HOLD audit (retained for traceability, not an active canary task after Founder's completion confirmation):
1. >=2 (prefer 3) natural prospective nights (Oct 3+) accepted under sleep-canon-v3; ideally one Oura duplicate-revision night (check copySelection diagnostics).
2. Closed-app background delivery: Oura syncs while PhysiqueOS stays unopened >=75 min; Sleep receipt precedes any Founder command.
3. Post-boundary strategic-leakage checks: Sun Oct 4 Weekly (and Wed Oct 7 Midweek if needed) scanned — zero Sleep/Recovery markers; Goal/Strategy Confidence unmoved by Sleep.
4. Separately, 14 reliable prospective nights are still needed before Recovery baseline interpretation; this is a Recovery Briefing prerequisite, not a reason to reopen the Founder-closed Sleep canary.
- no manual Sleep import; no backfill; no historical recanonicalization (historical stays sleep-canon-v2).
After acceptance:
- authorize prospective validation-only Sleep as input to Recovery shadow assessment through a separately reviewed non-strategic composition boundary.

5. Recovery Briefing V1 — shadow calibration then publication
Status: visual design accepted; one-card hierarchy accepted; Server shadow assessment candidate implemented but intentionally unwired/un-deployed.
Authority:
- candidate 1bfa92ef874c3c96f05b23a9d3cbdfb956384156
- report agent-handoffs/reports/20261001T224516Z-recovery-briefing-v1-shadow-assessment.md
Accepted product direction:
- one contiguous Recovery card;
- Green / Yellow / Red / Not enough data;
- no Recovery Score;
- Green normally no commentary;
- prior-28-night personal baseline candidate;
- foam rolling execution context only;
- Midweek no Red;
- Recovery status does not automatically move Goal Confidence;
- training corroboration is non-causal.
Next:
- Sleep V3 canary acceptance was confirmed by Founder 2026-10-07; proceed with separate, explicitly authorized Recovery shadow-input boundary review instead of reopening the canary;
- note: a prospective-only prior-28 baseline needs >=14 reliable nights, so non-"Not enough data" shadow output is not possible before ~Oct 15 even once authorized;
- review/authorize prospective-only non-strategic shadow input boundary;
- run shadow calibration;
- only later consider additive recoveryAssessment on NEW WEEKLY AND MONTHLY artifacts (Founder explicitly EXCLUDED Midweek 2026-10-07; older Midweek prototype scope superseded);
- historical Briefings remain unchanged;
- strategic Sleep/V3 graduation remains a separate Founder decision.

FUTURE MAJOR PROJECTS (roadmap only — NOT started; do not implement without a separate Founder-authorized prompt)

F1. App-wide UI/design polish
Position: DESIGN COMPLETE by 2026-10-07 Build 91 closeout audit (main report 65e221d10a52d9ef89ae19e4dcf528ca2c66de07). Most approved designs ship in Build 91; a bounded final implementation/acceptance tail remains: Home one-tap Skip + transient feedback, Energy phase history, widget refresh target, and limited UI state surfaces. The narrative below records historical design exploration and should not be interpreted as a current not-started status.
Current state: Home, Log Compact Command Center, Weekly, Midweek, Monthly, DEXA, Photo, the complete Goals hierarchy and Priority Detail are design-direction locked in dark/mineral light under their accepted corrections. Tesamorelin now has one Preparation section preserving both canonical instructions. Nutrition and Activity are accepted as good in their separate lane. Operating Plan root plus Energy, Nutrition, Training, Recovery, Peptides and Supplements are accepted and locked. The exact final Server-ordered rows — Tracking and conditional Coaching Updates — now have complete dark/mineral review artifacts covering their root continuity, detail/support, complete editor, schedule/timing and material conditional states; these final surfaces are pending Founder review. The source audit also preserves the current non-root Founder Production DEXA appointment unavailable state and records its usability gap. Recovery remains graph-driven, future-only and uncoupled from Confidence. Historical design-audit statement (superseded): Photo's simultaneous paired comparison viewer was then listed as required implementation, along with Energy phase-history projection and DEXA appointment destination. As of 2026-10-07 the Founder confirms the Photo paired comparison viewer COMPLETE (see Completed F), and the DEXA appointment destination shipped in Build 91 (device acceptance pending). Only Energy phase history is now a Founder-requested Build 93 feature (see current Build 93 block), not an ongoing deferral; do not read the older exploration text as current implementation status. Authority: `agent-handoffs/backlog/20261003-app-wide-ui-design-polish-home-exploration.md`.
Scope boundary: no Native implementation, Server behavior, production content projection, Recovery activation, build or TestFlight work is authorized by the exploration.

Recurring Briefing implementation backlog, not started:
- Photos: remove from recurring Weekly/Midweek presentation only; preserve Photo evidence/event and Photo Briefing.
- Still Unresolved: not a Briefing section; remove the current recurring presentation seam and do not replace it with another standing uncertainty card.
- Section parity: Hero/Confidence, Energy, Weight, Body Composition when available, Training, Recovery after graduation, Biggest Takeaway, What To Do, cadence-specific close, provenance.
- Recovery historical style concept (SUPERSEDED): early explorations listed Midweek, Weekly and Monthly. Founder now limits all Recovery card/graph publication to WEEKLY and MONTHLY ONLY; NEVER Midweek, DEXA or Photo. Weekly may use its Sunday–Saturday period, Monthly its calendar-month aggregates, only when evidence eligibility and separate production authorization pass.
- Midweek: guarantee canonical Biggest Takeaway in the presentation contract and preserve shorter-horizon restraint.
- Midweek Weight: use the shared Weekly metric/delta/context typography hierarchy.
- Monthly: locked in dark/mineral light at `agent-handoffs/artifacts/monthly-correction-dexa-photo-briefing-ui-20261004/`; future implementation must remove redundant rendered Goal/Phase tags and move unchanged Strategic Summary after What Changed, before Month Ahead.
- DEXA + Photo event briefings: locked in dark/mineral light at `agent-handoffs/artifacts/dexa-photo-founder-flow-confirmation-20261004/`. DEXA preserves 17/17 field-specific unit rows and the complete production Goal/Phase body-composition breakdown. Photo preserves the exact five-section, five-pose, five-comparison production flow. Historical Build 85 audit (superseded): its paired comparisons paged one image at a time and a simultaneous side-by-side synchronized zoom/pan viewer was then required. Founder has since confirmed that viewer COMPLETE as of 2026-10-07 (see Completed F). Preserve Photo's no-Confidence presentation and no Recovery in either event surface.

Goals hierarchy review state:
- one locked-family style translation covers Goals root, active Build Lean Mass, Your Journey, active/completed phase detail, persistent Guardrail, completed Visible Abs, first/final photo requirement and representative loading/error/empty/unavailable states;
- dark/mineral-light content parity and canonical active/completed content are validator-checked;
- completed historical phase detail receives only the chronology fields currently supplied by the production adapter; no strategy/success copy is fabricated;
- completed Goal photo pixels are redacted in the harness, while the authenticated first/final `mediaId` binding requirement is preserved;
- Goals is locked in dark/mineral light. Completed-Goal `ProgressPhotoTile` remains intentionally static; tap-to-expand is not required and is not an implementation gap;
- review root: `agent-handoffs/artifacts/goals-ui-style-translation-20261004/`.

Final appearance-translation review state:
- Founder accepted the dark Weekly/Midweek family and required one order correction: Weekly Body Composition now sits directly under Weight, matching Midweek.
- Corrected dark Weekly, unchanged dark Midweek, and direct mineral-light versions of both are ready at `agent-handoffs/artifacts/weekly-midweek-light-translation-final-20261004/`.
- Automated proof confirms exact dark/light content, semantics, geometry, Energy graphs, Recovery graphs and page-height parity. The accepted dark Midweek is structurally unchanged; all dark Weekly sections are unchanged apart from the authorized Body Composition move.
- Founder accepted and locked Weekly/Midweek dark + mineral light. Reopen only for a demonstrated implementation blocker.

Final polish review state:
- Selective mineral-light surface rhythm for Weekly/Midweek is ready at `agent-handoffs/artifacts/briefing-light-log-density-final-polish-20261004/`; exact content/order/graphs remain unchanged.
- Weekly Priority Muscle Groups compact candidate preserves all canonical labels/statuses/counts and reduces the measured block from 254 pt to 143 pt.
- Locked Log Compact Command Center realistic-density candidate covers simultaneous Strength + Cardio, calories + P/C/F, Activity, Weight and pending review in dark/mineral light with exact appearance parity.
- Centralized Log source/provenance candidate removes repeated Apple Health tile copy while preserving scope; Weight remains explicitly source-unavailable because the current Log projection exposes no Weight provenance.
- Founder accepted and locked the richer briefing mineral-light surfaces, condensed Weekly Priority Muscle Groups and bottom-collapsed Log Sources treatment. Implementation remains not started.

Monthly exploration state:
- actual Build 85 Native and current production Server Monthly contracts audited independently from Weekly;
- dark and mineral-light full-length renders, family boards, focused views and exact parity proof are ready;
- Monthly remains prior-calendar-month/day-1 and higher-precedence among recurring cadences on collision;
- Monthly Recovery is fixture-only, uses weekly aggregates, and remains inactive/Confidence-decoupled;
- Monthly is pending Founder review and is not locked.

F2. Briefing Narrative + Confidence quality/tuning audit
Position: next major strategic-quality project.
Scope placeholder: audit and tune Briefing narrative quality and Goal Confidence behavior across Daily/Midweek/Weekly/Monthly/Event briefings (accuracy, calibration, tone, repetition, evidence grounding). Not started; no audit or implementation authorized yet.

PARKED / LATER

6. Beta-user readiness / DigitalOcean capacity
Status: not an immediate blocker; Founder may consider another user in roughly the coming month but has not authorized onboarding.
Next before beta:
- bounded production capacity/read-latency/cost audit;
- realistic two-user load estimate;
- confirm prior performance optimizations remain effective.
Trigger:
- Founder begins planning actual beta onboarding, or DO cost/performance symptoms recur.

7. Apple Watch companion
Status: BUILD 84 REAL WORKOUT GENERALLY PASSED / BUILD 85 SERVER + PROSPECTIVE POLICY ACTIVE AND INDEPENDENTLY VERIFIED / NATIVE BUILD 85 TESTFLIGHT VALID (2026-10-03). Final authority: `agent-handoffs/reports/20261003T225500Z-build85-server-policy-native-testflight-final.md`.
Current physical-acceptance facts:
- real Watch execution, set completion, phone editing, pause/resume, Finish confirmation, recovery, HealthKit save, Saved summary/Done, metrics, Daily Totals, Crown paging and green progress substantially passed;
- performance-record celebration physical acceptance PASS for session-volume and reps-at-load records; exact reviewed Build 85 candidate includes larger local confetti while preserving the one-time/Reduce Motion lifecycle;
- inactive/Always-On false `OFFLINE · HEALTH ON` root cause is corrected in exact reviewed Native `b8ee8690b194cb90086b62816b9a2c8c400dc026`; immediate reachability is passive, stale/failed authority stays visible, and structured mutations remain fail-closed;
- the real PhysiqueOS-created Strength workout incorrectly entered generic 95% Pending Review. The Founder manually confirmed it with the correct Logger session; that explicit pre-activation reconciliation remains unchanged and is not retroactively converted into trusted correlation;
- exact Server `3c0f4aefddbb9a6886f6ad012443978303d47024` is production deployment `e9ffc644-ba32-48d0-afc7-ec3d809d8c77`, ACTIVE 9/9 with healthy live/ready and exact web/worker source. The create-only prospective trusted-Watch policy is version 1 and active for exact source `com.physiqueos.native.dev`, type 50, indoor required, 120-second tolerance and effective `2026-10-05T07:00:00.000Z`; no backfill. It created exactly one policy row plus audit `healthkit_trusted_watch_correlation_audit_6dbb503923b0247b369bbd5e91b39e5c`. Independent verification passed with no workout/review/strategic/Sleep/DEXA mutation or duplicates;
- exact Native `b8ee8690b194cb90086b62816b9a2c8c400dc026` is Build 85, App Store Connect delivery `a8c393e7-7d2c-41f0-9ba0-d37f43e53dc1`, build/import VALID.
Locked V1:
- phone is the sole structured `TrainingSessionAuthority` and planning surface; Watch starts one phone-prepared Ready-for-Watch plan only while the paired phone is reachable;
- after start, a disconnected Watch HealthKit workout may continue, but every structured mutation fails closed until phone authority returns;
- Watch owns `traditionalStrengthTraining` + `indoor` HealthKit lifecycle and physiology; Logger owns exercise/set/reps/load evidence;
- Finish never happens automatically and always confirms, including after the final planned set;
- Total Calories is active + basal only when both measurements are legitimately available; otherwise `—`;
- watchOS 11+ and PhysiqueOS dark navy/purple visual language; Apple Workout green/orange is not the product identity.
- Founder-selected normal-set treatment is split metrics: separate large Load and Reps tiles are the Phase 1A baseline. Preserve a future focus-then-Crown adjustment seam, but do not ship Crown editing in Phase 0 or initial V1 without separate authorization and conflict/navigation design.
Phase 0 implemented:
- partial-superset early-finish correctness blocker fixed through one performed-session projection used by commit and durability comparison; only completed sets survive, empty exercises disappear, and relationships retain only performed members when at least two remain;
- deterministic pause/resume, active elapsed ledger, Stopwatch/Countdown freeze and re-anchor, paused Live Activity parity;
- minimal Ready-for-Watch marker/selection, pure versioned Watch commands/acks/projections/metrics, and phone authority router with compare-and-set/idempotency semantics;
- trusted exact PhysiqueOS Watch workout correlation seam is additive and default-disabled; trusted exact links do not create duplicate performed Training evidence, and a second exact workout claim fails closed;
- non-shipping Watch target/signing feasibility is proven against the Founder's physical Apple Watch; no Watch target or TestFlight build was shipped.
Phase 1A implemented:
- generator-owned watchOS target/test target, shared schema-v2 contracts, phone `WCSession` bridge and deterministic latest-projection delivery;
- Ready-for-Watch phone affordance and locked PhysiqueOS Watch Start/execution/metrics/controls/paused/final/offline/superset/single-set surfaces with split Load/Reps;
- real Watch-owned HealthKit strength lifecycle, metrics, mirroring/recovery, phone-authoritative pause parity, two-leg recoverable Finish saga, completion summary, haptics and Always-On treatment;
- latest shipping Build 81 Progress Photos authority reconciled; paired simulator builds/renders and full/focused regressions complete with no new deterministic failures;
- signed Release archive contains iPhone + Live Activity/Widget + embedded Watch with version/build parity; every signature/profile/entitlement/companion boundary was inspected cleanly;
- automatic signing created the explicit HealthKit-capable Watch profile and the signed candidate is installed on the Founder iPhone.
- physical Watch Developer Mode/pairing, Watch-authorized provisioning, signed installation, launch and phone-reachable empty-state proof are complete;
- physical launch exposed and fixed a WatchConnectivity reply-callback actor-isolation trap; off-main regression tests pass and the fixed Watch app remains running without a new crash log.
- canonical confirmed Cancel Workout is available while active and paused without Resume; it abandons the structured draft, creates no Training evidence, discards the Watch HealthKit workout and ends the Live Activity;
- phone Cancel now publishes an authoritative terminal projection that clears Watch execution, metrics, controls, pending/rest/pause state and prevents delayed same-session resurrection across reconnect/relaunch;
- generator-owned PhysiqueOS Watch AppIcon is compiled into the signed archive and the physical Watch returns the installed 216x216 icon as non-placeholder;
- fresh paired Build 82 archive, strict signature/profile/entitlement inspection, physical iPhone+Watch install, launch and idle reachability proof are complete.
Phase 1A / Build 85 remaining gates:
- Founder remote-installs VALID Build 85;
- physical reconnect/stale-authority and inactive/Always-On presentation acceptance after Build 85;
- exact HealthKit-to-structured association proof with a new eligible workout after the prospective policy boundary;
- physical Cancel acceptance while active, while paused without Resume, and from phone remains a separate unfinished matrix item unless already recorded by a later acceptance report.

OPERATIONAL / ENVIRONMENT

8. Shared Mac restart
Status: recommended when convenient, not currently blocking.
Last cleanup:
- free space recovered to approximately 25 GiB;
- remaining swap persisted without unsafe manual deletion.
Rule:
- maintain >=15 GiB free for heavy Xcode work;
- restart when convenient to clear residual swap;
- use safe generated-artifact cleanup before waiving disk floor.

COMPLETED / REMOVED FROM BACKLOG

A. Progress Photos / completed Visible Abs photos
Status: COMPLETED. Founder explicitly confirmed 2026-10-01.
Includes previously deferred concerns:
- retry/photo recovery behavior;
- misleading Photo Briefing preparation state;
- photo expansion behavior;
- completed Visible Abs first/last real progress photos.
Do not resurrect without new Founder report.

B. Exercise Performance Records current-record correctness / exercise identity audit
Status: COMPLETED. Founder explicitly confirmed 2026-10-01.
Includes previously deferred:
- recent session exceeding displayed current record;
- canonical exercise identity matching/reconciliation.
Do not confuse with the separate Performance Record celebration lifecycle fix, which remains ACTIVE for Build 78 integration.

C. Sleep Evidence UI
Status: ACCEPTED / complete for current scope.
Build 76 fixes accepted by Founder.

D. Sleep Server canonical/read architecture
Status: complete for current scope.
sleep-canon-v2, historical Evidence, Recovery reads, midnight-safe window math accepted/deployed.

E. Recovery Briefing V1 visual design
Status: accepted.
Future shadow/publication work remains active above.

F. Photo Briefing paired comparison viewer — FOUNDER CONFIRMED COMPLETE 2026-10-07
Status: CLOSED / REMOVED FROM ACTIVE BUILD 93 LIST. Founder explicitly confirmed the paired comparison viewer is already done.
Scope understood as the two-photo side-by-side comparison experience with synchronized zoom and pan. Prior Build 85 design/audit notes that described it as unimplemented are historical and superseded by the Founder's current completion confirmation.
This update records Founder-reported completion; it did not independently inspect the currently installed UI or assign an unverified implementation/build SHA. Do not add it to Build 93 or reopen it unless Founder reports a new issue.

BACKLOG MAINTENANCE RULE

When Founder adds, closes, defers, reopens, or reprioritizes a meaningful PhysiqueOS item:
- update this file on origin/main in the same planning turn when practical;
- preserve completed items in the Completed / Removed section so future chats do not resurrect them;
- include exact implementation/report authorities for staged fixes;
- do not treat speculative ideas as committed backlog unless Founder adopts them;
- when a build is assembled, review all items marked for next-build integration before bump/upload.


FOUNDER IOS ROADMAP — 2026-10-01

Near-term ordering after current acceptance work:

1. Workout Logger Live Activities
Status: IN PROGRESS / Build 77 real-workout acceptance.
Founder plans several days of real use before finalizing ergonomics/typography.

2. Home Screen widget
Status: SHIPPED in Build 79 (VALID, delivery 8937b165); Build 79 physically verified working on the Founder's device. Number formatting polished in Build 80 (VALID, delivery 39ae9ddd); remaining physical acceptance pending — see BUILD 80 / BUILD 79 below. Founder-approved V1 = systemSmall four-tile square (primary) + optional systemLarge detailed Logged Today alternate.
Founder clarified desired V1 on 2026-10-01:
- mirror the existing Native "Logged Today" summary as closely as WidgetKit allows;
- include Training summary;
- include Nutrition total plus macros;
- include Activity active calories / current-day status;
- include today's Weight when available;
- add a clear Start Workout Logger action that becomes Resume Workout when an active live session exists.
Design direction:
- preserve the existing Logged Today information hierarchy rather than reducing V1 to only three standalone totals;
- prefer a large Home Screen widget as the primary V1 if needed for legibility; medium may be evaluated as a condensed secondary family;
- missing current-day values must not fall back to yesterday or display as zero;
- Start/Resume remains navigation into the authoritative Workout Logger rather than creating a session inside the widget.

3. Apple Watch companion
Status: promoted to active backlog item 7; audit approved and Phase 0 foundation implemented. See item 7 for locked V1 decisions and Phase 1A next work.

BUILD 80 — SHIPPED (VALID, delivery 39ae9ddd-271e-438c-80c2-f24137637e2f), Home widget formatting polish
Source 1783691d (branch claude/native-build80-widget-number-formatting-20261002) = Build 79 a75f93df + one display-formatting patch. Report: agent-handoffs/reports/20261002T043000Z-native-build80-widget-number-formatting.md.
Trigger (Build 79 physical acceptance finding): the widget worked on device but showed decimal fractions (Nutrition 2463.3 cal, P 182.2 C 166.7 F 110.1, Active 890.1 cal).
Shipped: one HomeWidgetValueFormatter for every widget family/state — calories and active calories as whole numbers with grouping (2,463 / 890), macros as whole grams (P 182 C 167 F 110), Weight keeps one decimal (176.1 lb). Display only; canonical precision unchanged.
Acceptance pending: Founder confirms small + large show whole Nutrition/Activity/macros and one-decimal Weight. All other Build 79 items below keep their status (carried unchanged into Build 80).

BUILD 79 — SHIPPED (VALID, delivery 8937b165-e7df-4f46-87b5-63efd3ce8244), pending Founder physical acceptance
Physical finding 2026-10-02: Home Screen widget verified working on device; requested whole-number Nutrition/Activity formatting → shipped in Build 80.
Source a75f93df (branch claude/native-build79-widget-priority-skip-integration-20261002) = Build 78 + Priority Skip 88d597b2 + Home Screen Widget 82040143 + integration review fixes. Production Server 2d967e48 (skipCommand contract verified read-only). Report: agent-handoffs/reports/20261002T040500Z-native-build79-widget-priority-skip-integration.md.
Keep each item until the Founder confirms on device:
- Home Screen widget V1: gallery discovery; small square (Nutrition cal + P/C/F, active cal, today's Weight); optional large (adds Training); no-weight; refresh; Start Logger / Resume Workout; stale/offline and locked/privacy; real App Group population; widget empties after Production revoke/re-pair, then refills.
- Item E peptide/Foam Skip: peptide Detail Mark Skipped; peptide notification Complete (planned dose) / Skip / Snooze; skipped peptide records no dose; Foam Rolling notification Complete / Skip / Snooze; supplement Complete / Snooze (no Skip); Morning Check-In no actions.
- Build 78 items A-D are carried unchanged in Build 79; their acceptance can be done on Build 79.
Residual non-blocking review notes are listed in the Build 79 report (known limitations).

BUILD 78 — SHIPPED (VALID, delivery 32447de5), pending Founder physical acceptance
Items A-D below shipped in Build 78 (source 5911dd2a) and are carried unchanged in Build 79. Keep until acceptance; Workout set-completion haptic intentionally deferred.

A. Performance Record celebration lifecycle fix
Authority: 69cad804e2ac7d74ed98914e1601f2e7863dadc3.
Integrate/review against current Native authority rather than releasing alone.
Add appropriate celebratory haptic alongside confetti/PR presentation.

B. Actionable Priority notification — Skip
Expose canonical Skip for notification actions where the Priority supports it.
No notification-only state.

C. Actionable Priority notification — one-tap Complete control
For simple binary Priorities that require no additional input, provide an Apple Reminders-style checkbox/check-circle action directly from the notification rather than requiring long-press -> Complete.
Do NOT apply this shortcut to Morning Check-In/weight or other flows that may require additional information.
Use canonical in-app completion semantics and preserve specialized/dose-aware behavior where applicable.

D. Targeted haptic feedback
Treat haptics as interaction polish, not a standalone feature project.
Initial accepted candidates:
- PR celebration: celebratory haptic + confetti;
- Priority completion: subtle success haptic;
- Priority Skip: lighter confirmation haptic;
- Workout set completion: DEFERRED (not in Build 78); consider subtle confirmation, especially interactive system surfaces, after real-use acceptance.
Avoid haptics on ordinary read-only navigation/charts/browsing.


E. Priority Skip capability expansion — peptides + Foam Rolling notifications
Status: SHIPPED — Server 2d967e48 (deployed 2026-10-02) + Native Build 79 (VALID); pending Founder physical acceptance (see BUILD 79). Supplement Skip and peptide un-skip remain deferred product decisions.

Peptides:
- peptide occurrences must support canonical Skip even though Complete remains specialized/dose-aware;
- Skip means intentionally not taken for that occurrence;
- no dose should be recorded on Skip;
- planned-dose / took-a-different-amount completion semantics remain unchanged;
- peptide notifications should expose Skip once the occurrence contract advertises it safely.

Foam Rolling:
- Foam Rolling already supports canonical Skip from Priority Detail;
- actionable notifications should expose Skip as well;
- do not rely on Native guessing that all Recovery Support priorities are skippable.

Architecture direction:
- make Skip capability independent from completion mode;
- a Priority may be specialized for Complete and still support Skip;
- prefer Server-owned explicit skip capability/skipCommand in notificationAction so Native does not infer by Priority name/type;
- Native renders Skip only when the occurrence contract authorizes it;
- use the same canonical priority.skip.v1 mutation path as in-app Skip;
- stale/duplicate Skip remains idempotent and reconciles Home/Priority Detail/notifications.

Acceptance:
- peptide detail screen exposes Skip;
- peptide notification exposes Skip without weakening dose-aware Complete;
- skipped peptide records no dose;
- Foam Rolling notification exposes Skip;
- Home/Priority Detail reflect canonical Skipped state;
- unsupported Support priorities do not accidentally inherit Skip.

PARKED IOS FEATURES

Native capture / quick intake
- Native Progress Photo capture: keep for possible later enhancement; current workflow is sufficient.
- DEXA quick upload / Files picker shortcut: keep for later. Current preferred workflow remains DEXA notification -> Priority -> Files because the Priority may carry the needed context/action.
- Broader Share-to-PhysiqueOS evidence intake enhancements: keep lower priority; current workflows are sufficient.

Face ID / biometric authentication
- Keep for future multi-user/login phase.
- Not needed for current Founder-stage app.

Home Screen quick actions
- Keep lower priority.
- Likely inexpensive, but not necessary yet.

REMOVED / CURRENTLY NOT WANTED

Siri / broad Shortcuts surface
- Founder currently sees no meaningful need.
- Remove from active roadmap/backlog for now.
- Existing AppIntent use required internally by features such as Live Activities does not imply a user-facing Siri/Shortcuts project.

CURRENT-SCOPE COMPLETE

General deep HealthKit integration
- Consider current non-Watch scope sufficiently robust/complete.
- Activity, Nutrition, Cardio and Sleep have substantially reached the desired current state.
- Do not reopen generic HealthKit work as a feature project.
- Next meaningful HealthKit expansion belongs to the paired Apple Watch project (Watch-owned strength workout + heart-rate/physiological observations).

Training Logger / Live Activities
- Existing broad Native Workout Logger feature vision has become the current Logger + Build 77 Live Activities work.
- Do not duplicate it as a separate future backlog item.

END BACKLOG.


## DEXA -> Apple Health writeback — PROSPECTIVE ACTIVE / OCT 9 ACCEPTANCE PENDING (updated 2026-10-03)

Status: Server/Native implementation shipped in Build 84; bounded real Sep 12 write/verify/delete validation passed; permanent prospective policy activated create-once on 2026-10-03; zero current intents; Oct 9 real-scan acceptance pending.

Audit authority:
- agent-handoffs/reports/20261002T235405Z-dexa-healthkit-writeback-audit-plan.md
- main report commit 789aafd9cc2b4b95dee71c0fd3ee9eb0d51a2422

Founder-approved product decisions:
1. V1 writes Body Fat Percentage plus Apple Health Lean Body Mass calculated as fat-free mass = canonical DEXA totalMass - fatMass. Do not write raw DEXA lean soft tissue as Apple Health Lean Body Mass.
2. Do NOT write DEXA total mass to Apple Health Weight.
3. Permanent writeback is prospective-only for scan dates >= 2026-10-09. No historical Apple Health backfill is authorized.
4. Write automatically after canonical DEXA acceptance, with quiet status/retry.
5. Canonical corrections automatically replace PhysiqueOS-owned Apple Health samples using versioned exact-once semantics.
6. One-time explicit opt-in plus persistent You -> Apple Health toggle. Turning off stops future writes but does not automatically delete prior samples.
7. Physical pre-scan validation must use the Founder's REAL canonical 2026-09-12 DEXA, not fabricated health data. Temporarily authorize only that scan, write its real Body Fat % and calculated fat-free Lean Body Mass, verify source/timestamp/units/exactly-once/no feedback loop, then delete both PhysiqueOS-owned samples and verify removal. Permanent policy remains prospective from 2026-10-09.
8. After the Sep 12 physical test passes, other real historical DEXA figures may be used freely as deterministic/simulator test fixtures for mapping, units, revisions and edge cases, but must NOT be written into the Founder's real Apple Health history unless separately authorized.

Execution gate:
- DO NOT backfill or write another historical DEXA. The Sep 12 physical controls are complete and should not be invoked again.
- Permanent policy is now active. Do not update/overwrite it without a separately reviewed and authorized correction operation.
- For the Oct 9 scan, use the normal DEXA intake and verify exactly two permanent intents/samples: Body Fat Percentage plus fat-free Lean Body Mass; no Weight. Retain the guarded Sep 12 controls until this succeeds, but do not invoke them.
- Target readiness remains the Founder DEXA on Friday 2026-10-09.


## Build 83 Cardio classification — LOCKED Founder decision 2026-10-02

Status: **SHIPPED and production-repaired 2026-10-02.** Server `89fe0a0340adee22d15b92a1f074a0bbd348ac77` is ACTIVE in deployment `28678d4a-e3cc-4b2b-a479-1851ab7093bf`; bounded D3 is complete and independently verified. Native Build 83 source `3e61dd215e8474c52bd54230d2d9dfb2f3a93534` is TestFlight `VALID`, delivery `507b409f-a29f-48a0-93b4-49ab46b5ad6d`. Final report: `agent-handoffs/reports/20261003T055504Z-build83-server-d3-native-testflight-final.md`.

Continuation authority:
- Build 83 continuity checkpoint: agent-handoffs/reports/20261003T033236Z-build83-first-real-workout-corrections-checkpoint3.md
- checkpoint main commit: b2e1779aa8b639ca8508c817204b96df4b4ba511
- pushed Native candidate: abb131d9e1a4cd9eeb6c1a5caca1e1ad9e1b9c4e
- final reviewed Native authority: 3e61dd215e8474c52bd54230d2d9dfb2f3a93534

Founder locked classification:
- Stair Stepper / HealthKit type 44: canonical Cardio and prospectively strategically eligible under the accepted Cardio framework.
- Cooldown / HealthKit type 80: canonical workout/history record labeled Cooldown, but NOT Cardio anywhere.

Cooldown must NOT:
- count as a Cardio session;
- contribute Cardio session totals;
- contribute Cardio minutes/totals;
- set hasCardio or equivalent flags;
- satisfy Cardio targets;
- appear as Cardio in Home, Active Goal, Training reporting or indicators;
- enter Cardio strategic evidence;
- affect V3 Confidence, Narrative, recommendations, Briefings or Cardio strategy.

Cooldown MAY:
- appear as Cooldown in Log;
- appear as Cooldown in Training Day/history;
- appear as Cooldown in Activity/history where canonical workout history is presented.

Architecture requirement:
canonical workout/history inclusion is independent from workout-family reporting classification and strategic evidence eligibility.

No production policy change is authorized merely to implement this distinction. If the current policy/model cannot represent it safely and backward-compatibly, stop for Founder review.

Build 82 compatibility is mandatory for Server read responses until Build 83 adoption. Do not introduce an enum/value that causes Build 82 Training Day/Log decoding failure.

WITHDRAWN SERVER CANDIDATE:
- 22925625 is explicitly withdrawn and MUST NOT be deployed or used for D3 repair.
- A new exact Server SHA implementing the locked Cooldown non-Cardio rule must pass tests and fresh independent review before Founder deploy authorization.

D3 completion contract was:
- bounded repair of exactly the Oct 2 Stair Stepper and Cooldown source_only observations;
- dry-run first;
- Stair Stepper repaired as Cardio;
- Cooldown repaired as canonical non-Cardio;
- no Activity calorie/exercise-minute inflation;
- no other records affected;
- no historical strategic artifact rewrite.

Completion result:
- the replacement Server candidate was reviewed, directly authorized and deployed; withdrawn `22925625` was never deployed and is not an ancestor;
- the fail-closed dry run matched exactly the two reviewed Oct. 2 observations;
- D3 applied exactly six writes: one audit row, two canonical creates, one Stair coexistence update and two observation reconciliation updates;
- Stair Stepper is canonical strategically eligible Cardio;
- Cooldown is canonical Cooldown history, reporting family `other`, strategic role `history_only`, and contributes nothing to Cardio reporting, targets, indicators or strategy;
- duplicate workouts `0`; Activity canonical-day count/digest and live calories/exercise minutes unchanged; no historical strategic artifact rewritten;
- physical TestFlight acceptance remains observational and is listed in the final report.


## Mac disaster-recovery / iCloud backup V1 — FOUNDER CONFIRMED COMPLETE (2026-10-07)

Founder confirms automated iCloud backup and recovery verification completed and closes this item. The detailed October 3 provisional small-tier/remote-proof limitations below are historical evidence only; this maintenance step did not query the live Mac/iCloud status or retroactively certify independent remote state. Routine backup maintenance or a new observed failure is not an open V1 implementation backlog item.

Audit authority:
- `agent-handoffs/reports/20261003T174554Z-mac-icloud-backup-disaster-recovery-audit-plan.md`
- prompt authority `5b7ece032abc2a10fd83da6c6c36ad578f1c1e1b`
- implementation prompt authority `b84428fe54121f5a0d5198157fe972d99586a59a`
- local Phase 7 implementation authority `54b4ba82ed089a98e2c5950fecbe9b9a7a7e4dc8`
- iCloud status/archive-integrity implementation authority `6a3e6199` (full SHA in post-copy checkpoint)
- final scheduler/upload-gate implementation authority `b53c26ed8d3be583dd8b0dd3becece436689bcd9`

Goal:
Create a safe, automated backup path for non-reproducible PhysiqueOS development state on the Founder Mac, with iCloud Drive as a likely off-device destination.

Founder preference:
- simple iCloud Drive folder;
- at least once daily;
- also after major patches/releases/checkpoints where useful;
- coders may produce/update the backup artifact automatically once the design is accepted.

Architecture constraints:
- DO NOT place active Git worktrees, Xcode projects-in-use, DerivedData, simulator device data, node_modules, caches or other high-churn development trees directly under iCloud synchronization.
- Prefer a staged, immutable/versioned backup bundle or snapshot copied atomically into a dedicated iCloud Drive/PhysiqueOS Backups folder.
- Never copy secrets, keychain contents, PATs, App Store Connect credentials, DigitalOcean credentials/database URLs, signing private keys or other sensitive credential material into the backup bundle.
- Preserve references/inventory for credential-dependent tooling without exporting credentials themselves.
- Do not rely on iCloud as the only source-control backup. GitHub remains source authority for pushed source/handoffs.

Audit findings:
- iCloud Drive is locally available, but the dedicated `PhysiqueOS Backups` folder does not exist and no remote upload was attempted or claimed.
- Current and legacy shared Git object databases have 22 local branch tips not reachable from any freshly fetched GitHub head/tag (12 tips / 14 commits current; 10 legacy).
- Five worktrees have verified dirty/untracked state. Thirteen older checkouts under `~/Documents` remain `UNKNOWN-REVIEW` because read-only status scans stalled in the File Provider-backed estate.
- `iCloud Drive/Documents` points to `~/Documents`, where an older PhysiqueOS repo/worktree estate already lives. Do not move it in this project; capture/review first, then handle any later migration as a separate controlled operation.
- No Time Machine destination or local snapshot is configured.
- Seven signed Xcode archives (Builds 79-84) total about 673 MiB. One usable Apple Development identity and seven profiles are present, but private keys/keychain/profiles remain excluded from the recovery bundle.
- The guarded release tool is local-only and small; safe tool source, schema-validated receipts and sanitized state are backup candidates, while release configs, ASC key material and auth containers are never-copy.
- Small daily recovery state is expected to be about 5-25 MiB with a 100 MiB fail-closed review ceiling. Builds/caches/simulators/agent session stores remain excluded.

Accepted design pending Founder choices:
- stage outside iCloud under a generation-specific incomplete path;
- import fresh GitHub refs and all local refs into a temporary bare aggregator, then create one local-only Git bundle with GitHub prerequisites;
- capture staged/unstaged state with binary patches plus exact content-addressed file bytes; capture untracked files only through an explicit allowlist;
- fail closed on deterministic filename/content/structured/Git-object scans and report categories/paths only, never secret values;
- SHA-256 every file, verify the bundle, and perform a fresh-clone scratch restore before any iCloud promotion;
- copy into iCloud under an incomplete name, destination-rehash, locally rename, then track local completion, File Provider upload-reported completion and independently downloaded remote confirmation as distinct states;
- never rotate on local copy success or unknown remote status; keep immutable daily/weekly/monthly/release generations;
- restore onto a new Mac by cloning GitHub first, importing local-only refs/dirty state, recreating worktrees outside iCloud, restoring safe tools, and reauthenticating all credential-dependent systems.

Audit/design covered the truly non-reproducible local state, including:
- repo/worktree/branch/SHA inventory;
- dirty/uncommitted changes;
- unpushed commits/branches;
- safe git bundle/patch representation where appropriate;
- agent handoff/config/operational files not already durable on GitHub;
- release/archive inventory and whether signed archives need a separate backup policy;
- local scripts/tools that are not tracked but are necessary to recover;
- simulator/Founder test fixtures only if genuinely irreplaceable;
- Xcode project generator/source authority;
- sanitized deployment/config metadata;
- restoration procedure onto a replacement Mac.

Design requirements established:
- daily backup cadence;
- post-major-patch/release trigger;
- atomic write (stage locally, validate, then move/copy into iCloud destination);
- checksums/manifests;
- retention/rotation policy;
- size ceiling;
- disk-floor awareness;
- verify iCloud destination is actually available before deleting/rotating anything;
- never delete the only copy of local state merely because a backup was attempted;
- restore drill/test;
- human-readable latest manifest;
- optional notification only on failure or meaningful backup problem.

Founder-approved V1 decisions:
1. destination — recommend exactly `iCloud Drive/PhysiqueOS Backups`;
2. cadence — recommend 03:30 local daily with next-wake catch-up plus post-major-main-checkpoint and post-TestFlight-VALID runs;
3. retention — recommend 14 daily, 8 weekly, 12 monthly and 12 release/checkpoint generations;
4. signed archives — recommend a separate post-release tier beginning with current Build 84 + rollback Build 83, plus named milestones;
5. untracked policy — recommend strict explicit path/type/size allowlist; unknown paths block promotion;
6. Time Machine and a second destination are intentionally outside V1 and do not block it.

Status / hard gate:
- Phase 1 audit/design is complete and the approved local V1 tool is implemented on the pushed feature branch.
- Live `audit`, deterministic tests, full `dry-run`, local `create`, checksum verification and fresh-GitHub scratch restore all pass. The first local immutable generation is `PhysiqueOS-Recovery-20261003-191629Z`, 5,260,954 bytes, manifest SHA-256 `7b712856eb9437ffce9d0e9d63d12abb80f177fe7a1d2bb78f49eb9d1e96413d`.
- The generation contains 22 local-only recovery refs, five exact dirty-worktree reconstructions, four guarded tool sources, 37 schema-validated release receipts, and sanitized inventory. The secret scanner reports `PASS`; credentials, keychains/private keys, auth sessions, raw production/health exports, build trees, dependencies and caches remain excluded.
- Fourteen File Provider/legacy checkouts are recorded `UNKNOWN_FILE_PROVIDER_OR_TIMEOUT`; their common-database refs are captured, but dirty-state coverage is not claimed.
- The mandatory pre-write checkpoint was published and verified on `origin/main` at `b181dd54c98ba27aab6717eef2996d0ce3039d8c` before the first iCloud write.
- The dedicated destination now exists. Generation `PhysiqueOS-Recovery-20261003-191629Z` was copied through `.incoming`, destination-rehashed, renamed, and made current through atomic `LATEST.json`. Scratch restore from the final iCloud destination copy passes.
- Foundation metadata produced a clean 97/97 `ICLOUD_UPLOAD_REPORTED_COMPLETE` observation during status refresh and again at scheduler installation, but later queries returned metadata unavailable. Historical upload-reported completion is recorded; current live state and independent remote state are conservatively `REMOTE_ICLOUD_SYNC_UNKNOWN`.
- A clean exported `origin/main` snapshot review passed 19 tests before enablement; after fresh-metadata, scheduled-upload failure and idempotent reinstall gates were hardened, the suite passed 22 tests. The 03:30 local launchd agent is installed, loaded and idle with last exit `0`; its RunAtLoad catch-up correctly skipped because the generation was under 24 hours old.
- Explicit hooks are installed for post-major-main-checkpoint and post-TestFlight-VALID use, with recursion prevention verified against the recovery report.
- Retention is implemented but generation #1 deletion is disabled. Current upload metadata unknown additionally disables all retention deletion.
- A conservative cache-only cleanup raised data-volume free space from 13.174 GiB to 21.248 GiB before archive copying. The exact deletions were Apple media-analysis cache, stale Sparkle install staging and inactive Chrome cache; no repository/worktree, simulator, archive, recovery generation, credential/signing state, evidence or unknown checkout was touched. All 22 local-only refs and all five dirty-state hashes reverified unchanged, and the installed recovery audit passed.
- The separate archive tier now contains **Build 84 + Build 83 only**. Both local iCloud-container copies have 52-file checksum manifests with zero mismatches, and the original Organizer archives remain intact. The immediate File Provider query returned errors/unavailable metadata, so archive upload-reported completion and independent remote durability remain unproven. Final observed free space after the tier copy was about 21.1 GiB.

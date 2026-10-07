PhysiqueOS Build 92 — FINAL native visual redesign closeout and Home/Widget interaction polish

OWNER: Start ONE dedicated Claude Native visual-closeout Remote Control conversation with one managed isolated worktree based on shipped Native Build 91. Do not reuse the locked Build 91 release worktree for modifications. No child agents/chats/subagents, duplicate worktrees or long-lived redundant sessions.

FOUNDER APPROVAL / SCOPE
Founder has approved the entire remaining bounded app-owned visual-state tail and explicitly wants the major redesign closed in Build 92. Energy phase history is DEFERRED OUT OF SCOPE. Implement one isolated visual closeout candidate, not a separate batch of speculative redesigned screens.

AUTHORITIES
- Native Build 91 shipped 106f05183ea3e2328496acce0636dc087116bbce, 1.0(91).
- Final app-wide design audit report agent-handoffs/reports/20261007T225919Z-final-app-redesign-closeout-audit.md, main report commit 65e221d10a52d9ef89ae19e4dcf528ca2c66de07. Every route has accepted visual design; 98-group coverage with no new design surfaces.
- Home exact direct Skip/confirmation requirements staged at c961acb789c8cbbceb3baa59b08814a61ee2d976, full text in agent-handoffs/inbox/prompts/20261007-build91-home-priority-one-tap-feedback-polish.md.
- Founder final approval/defer decision in backlog commit 49215f14056b9a695709d4d560597aba69b8af45.
- New Native Training Variants and HealthKit permissions are separate approved concurrent lanes; no merge now.
- Server currently 738ce668; no Server change or Founder production data mutation.

EXACT VISUAL CLOSEOUT
1. Home: eliminate the three-dot Skip Menu and extra confirmation on Home priorities. Render a visibly red circular action with readable minus/skip glyph and at least 44pt effective target. A single tap submits the already projected canonical priority.skip.v1; no premature optimistic state, duplicates, misrouting or lost haptic. For successful canonical Skip and Complete show a small in-page acknowledgement with icon and plain-language Skipped or Completed that fades after ~1-1.5 seconds, even when the card is removed. Reduce Motion, VoiceOver, failure handling, grouped/daypart child priorities, stale-version refresh and double taps all must be covered. Preserve detail-page and notification semantics unchanged; don't invent Skip on unavailable capabilities.
2. Home less-common presentation tails: legacy priority-card internals, additional-goal/no-goal and older-briefing variants, loading/failure/notices. Use already-approved shared Home tokens; no new business logic or fake data.
3. Home Screen Widget: enlarge the effective Refresh totals target to minimum 44x44 points for small/large, keeping visible icon compact, truthful Start/Resume action and refresh routing distinct from small widget's whole-widget workout link; VoiceOver label remains correct. Do not change app group provenance or displayed numbers.
4. Evidence/transaction state-tail: refine the app-owned DEXA PDF wrapper chrome (not Apple's PDF renderer), Evidence Intake app-owned date-sheet wrapper, Workout Match confirming/refresh-required/processing/failed/dismissed states, training supporting-media placeholders, shared evidence loading/empty/error and media states. Match locked Dark/Mineral kits; preserve canonical content, Evidence write commands, source semantics, current/retry/back actions and no unwanted decorative screens.
5. Logger refusal/error truthfulness is approved, BUT Logger picker/model/source is owned by the concurrent Native Training Variant lane codex/build92-native-training-execution-variants-20261007. DO NOT EDIT any Logger Swift file that the Variant lane is modifying. Document the exact remaining Logger-facing refusal/copy/error presentation suggestions and their acceptance cases in the final report; leave that small fragment to the final integration owner once Variant candidate lands. Other non-overlap UI tails can proceed now. If any other overlap is discovered, coordinate ownership, do not overwrite.

BOUNDARIES
- No new design boards required or new feature architecture; use existing accepted design system.
- No Energy phase history Server/Native work, no Recovery V1 activation, no Settings/account architecture, no timed set log support, no Build 92 variant creation/UI, no HealthKit auth coordinator work.
- No production writes, build number bump, archive, TestFlight, or release pointer changes.
- Preserve Watch workout haptic/footer fixes, Universal Skip server semantics and Build 91 Evidence Option A.
- Make accessibility, Dynamic Type, Dark/Mineral, navigation/retry, minimum hit targets and Reduce Motion explicit acceptance cases.

TESTS AND STORAGE
Run narrow focused unit/UI suites for changed Home/Widget/Evidence/Workout Match. Do not launch full Xcode simulator matrix alongside Native Variants or HealthKit repair. The Mac has low headroom; follow 4bcfe4d861eb5abeb0cdfef1dead1fdc1d926217, measure before/after, reuse one lane-owned DerivedData, guard free space and clean ONLY completed owned intermediates after evidence capture. Preserve Archives 85–91, other process-owned data and simulator runtimes. If disk unsafe, HOLD and report instead of deleting ambiguous artifacts. All required full integrated Build 92 validation is separately gated.

PUBLICATION
Founder explicitly authorizes publishing the one isolated exact candidate branch claude/native-build92-final-visual-closeout-20261007 with its reachable history to freshly verified dustinginn/physiqueos via normal non-force push, after scope and tests pass. Founder explicitly authorizes the timestamped final report via installed guarded report-only publisher on origin/main: add ONLY new file under agent-handoffs/reports/, no existing-file changes, latest.json/latest.md remain Build 91. The necessary bounded Git pushes for these exact scopes are approved; don't ask for redundant destination-ownership permission when verified. Stop on drift.

FINAL
Report file-by-file change census, which of 98-group visual tails are now closed vs need Logger integration, focused tests/QA, Dark/Mineral accessibility proof, storage before/after, expected overlapping files/merge notes, exact candidate branch SHA. Do not declare entire redesign fully accepted until founder post-Build-92 real-device acceptance and the one outstanding Logger tail (if any) are reconciled.

Notify: PhysiqueOS final visual redesign closeout candidate ready for Build 92 integration.
STOP.
HealthKit Sleep Evidence — visual prototype and screenshot review

Standing reporting protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

READ FIRST

Design:
agent-handoffs/reports/20261001T032718Z-healthkit-sleep-evidence-design.md

Historical shape:
agent-handoffs/reports/20260930T210326Z-healthkit-sleep-historical-shape-validation.md

Founder page cleanup candidate:
a5041eb0 on claude/healthkit-sleep-next-native-20260930

PURPOSE

Founder wants to SEE the proposed Sleep Evidence experience before approving production implementation.

Create a NON-SHIPPING Native visual prototype using synthetic/redacted Sleep data shaped like the validated September dataset, run it in iOS Simulator if possible, and capture screenshots for Founder review.

Founder is away from the Mac and reports the macOS user session may currently be LOCKED.

SECURITY / LOCKED-MAC RULE

Do not attempt to:
- unlock the Mac;
- enter or retrieve a macOS password;
- bypass the lock screen;
- use accessibility/security workarounds to unlock;
- change login/security settings.

If Xcode/Simulator/screenshot automation cannot operate because the GUI session is locked:
- stop;
- publish a GH checkpoint describing the exact blocker;
- preserve/push any prototype code completed before the blocker;
- state the minimum Founder action required later (for example, unlock the Mac);
- do not substitute fake screenshots.

If simulator tooling can run normally despite the locked display, proceed.

SCOPE

Prototype only.

Do NOT:
- deploy Server;
- activate prospective Sleep;
- read raw Founder Sleep;
- use historical Founder values in fixtures;
- upload TestFlight;
- change production;
- implement Briefings/V3/Confidence/strategic Recovery;
- invent a Sleep Score;
- touch sleep-canon-v2 correctness lane.

Use synthetic values only, but shape them realistically from the sanitized validation report:
- 30/30 nights;
- Oura primary;
- staged data;
- one main episode/night;
- detailed timeline;
- occasional inferred-timezone marker;
- no need to model real Founder bed/wake values.

BASE / BRANCH

Use current accepted Native design authority appropriate for Sleep prototype work, preserving the a5041eb0 Founder-page cleanup.

Create a dedicated prototype branch.
Do not make it a shipping candidate.

VISUAL PROTOTYPE

Implement enough fixture-backed UI to render the approved design faithfully.

At minimum render:

1. Evidence Hub
- existing PhysiqueOS Evidence visual language;
- Recovery row populated with Sleep instead of Coming soon;
- representative Last night / sleep summary.

2. Recovery landing — top
- header;
- Last Night card;
- 14-night Total Sleep chart;
- trailing 7-night average;
- realistic selection/labels.

3. Recovery landing — lower
- Sleep Window card;
- Recent Nights;
- Data Sources;
- inferred-timezone marker example.

4. Sleep Trends
- range selector;
- Total Sleep trend + 7-night average;
- Sleep Window trend;
- representative Continuity area/card if visually appropriate;
- Stage Mix collapsed by default.

5. Night Detail — top
- date/headline;
- total sleep;
- sleep window;
- detailed hypnogram/timeline.

6. Night Detail — lower
- stage composition;
- continuity;
- time in bed;
- Source & Data;
- inferred timezone provenance.

7. At least one state example
Prefer inferred-timezone or updating/pending-correction state.

CANON-V2 GATING

Current v1 stage/Awake data is not final.

Prototype may use SYNTHETIC corrected-looking stage values solely to visualize layout.

Clearly fixture-gate the prototype.

Do not wire v1 production values.

Design stage/continuity components so the pending-correction state is also renderable.

VISUAL QUALITY

This is Founder visual acceptance, not a wireframe.

Use:
- existing PhysiqueOS typography;
- spacing;
- card language;
- colors/tokens;
- dark-mode appearance matching current app;
- native SwiftUI/Charts;
- real navigation chrome.

Avoid:
- giant engineering labels;
- placeholder rectangles when actual fixture UI can render;
- cramming every metric onto the landing;
- generic dashboard aesthetic inconsistent with PhysiqueOS.

SCREENSHOTS

If simulator access works, capture clean screenshots at current supported iPhone form factor.

Required screenshot set:
A. Evidence Hub with Recovery
B. Recovery landing top
C. Recovery landing lower
D. Sleep Trends
E. Night Detail top/hypnogram
F. Night Detail lower
G. one state/provenance example if not already visible

Prefer PNG.
No raw/private Founder data.

Store screenshots in a review-safe repo artifact location if repo policy allows images; otherwise use the existing approved handoff/artifact mechanism and document exact paths.

Do not commit Xcode DerivedData or simulator internals.

NAVIGATION

Make the prototype reachable through Sandbox or a fixture-only launch/navigation mechanism that cannot accidentally become production behavior.

No production API dependency should be necessary to render the screenshots.

TESTING

Run enough to prove:
- prototype compiles;
- fixture navigation works;
- no production path can accidentally use fixture data;
- existing Evidence destinations are not broken;
- a5041eb0 cleanup is preserved.

No need for full Native suite if resource-heavy; risk-scaled tests + Release compile are sufficient for a non-shipping prototype.

DISK

Check free disk/swap before heavy Xcode work.
Respect 15 GiB floor.
Do not delete active Codex worktrees/state.

REPORT

Publish:
agent-handoffs/reports/<timestamp>-healthkit-sleep-evidence-visual-prototype.md

Include:
- branch/SHA;
- base;
- whether locked-session Simulator access worked;
- screenshot inventory/paths;
- fixture description;
- implementation notes;
- tests/build;
- explicit NON-SHIPPING status;
- no production/Founder data used;
- any visual questions for Founder;
- exact minimum next action.

Publish GH checkpoint before every stop.

END TASK.

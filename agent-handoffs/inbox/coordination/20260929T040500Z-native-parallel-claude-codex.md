Parallel Native build coordination — Claude integrator + Codex PR-celebration workstream

This note coordinates the currently active consolidated Native daily-driver build.

AUTHORITATIVE PARENT TASK

Claude Remote Control is executing:
agent-handoffs/inbox/prompts/20260929T031000Z-native-consolidated-daily-driver-build.md

Claude remains the final integrator and owner of the consolidated candidate.

OWNERSHIP

CLAUDE OWNS:
- Sep 28 Activity/workout same-day consistency diagnosis and fix;
- Logged Today strength + cardio coexistence;
- context-aware Log tab -> active Workout Logger;
- post-HealthKit-sync reconciliation notification timing/deep-link work;
- Priority Detail -> Mark Skipped;
- Monthly Native cleanup;
- any other parent-task work except the Workout Complete performance-record celebration;
- final integration, full Native validation, Release candidate and GH acceptance report.

CODEX OWNS ONLY:
- Workout Complete -> authoritative new performance-record summary;
- small one-time confetti celebration when authoritative new records exist;
- Reduce Motion / one-shot/accessibility behavior;
- any smallest bounded read-contract extension strictly required to expose authoritative records for the just-completed session.

Codex must not calculate PRs in Native.

PARALLELISM / COLLISION RULES

Codex works in an isolated branch/worktree.
Codex must not merge, rebase, deploy, upload TestFlight or modify Claude's worktree.
Claude should not implement the Workout Complete PR-celebration workstream while Codex owns it.
Claude should continue all other work and must not block/wait on Codex until final integration is otherwise ready.

Codex must avoid:
- Activity sync/aggregation;
- Logged Today;
- HealthKit workout reconciliation;
- notification timing;
- Log-tab navigation;
- Priority Mark Skipped;
- Monthly UI;
- auth;
- peptides;
- Photos;
- Sleep.

HANDOFF CONTRACT

When Codex finishes, it must:
1. commit and push its isolated branch;
2. publish a GH report under:
   agent-handoffs/reports/
   with a filename containing:
   workout-complete-performance-record-celebration
3. include:
   - branch name;
   - exact SHA;
   - files changed;
   - whether any Server/read-contract extension exists;
   - tests/build results;
   - fresh-context review result;
   - exact integration/cherry-pick instructions for Claude;
   - any known overlap/conflict risk.

Codex must not update production or TestFlight.

CLAUDE INTEGRATION CONTRACT

Claude should look for the Codex report only when ready to integrate.
If it is not present yet, Claude continues its own work.
When present, Claude reviews the Codex diff before cherry-picking/integrating.
Claude remains free to reject or manually adapt the Codex implementation if its assumptions conflict with the Activity diagnosis or current consolidated candidate.
After integration, Claude owns full-suite validation and Release compilation.

If Claude reaches final integration before Codex is done, Claude should publish its own candidate state and identify the PR-celebration workstream as pending rather than silently reimplementing it.

SERVER SAFETY

Any Server change produced by either agent remains separately gated and must not be deployed without explicit Founder/ChatGPT authorization.

DISTRIBUTION SAFETY

No TestFlight upload until Founder/ChatGPT accepts the consolidated candidate.
Do not use App Store Connect/Apple Developer browser login.

CURRENT PRODUCTION AUTHORITY

Briefing Intelligence is deployed at Server/Web 7242043f plus the subsequently deployed Strength reconciliation fix 396e750d. Agents must independently reverify current authority before any operation that depends on it.

END COORDINATION NOTE.

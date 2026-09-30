PhysiqueOS agent reporting protocol — mandatory GitHub checkpoint before every stop

Applies to all coding/operations agents, including Claude and Codex, across Server, Native, intelligence, HealthKit, auth, briefing and operations workstreams.

PURPOSE

ChatGPT and Founder coordinate work through GitHub. A coder's local/chat state is not authoritative enough for handoff.

MANDATORY RULE

BEFORE EVERY STOP, publish the current state to GitHub.

"Stop" includes:
- task completion;
- waiting for Founder/ChatGPT review;
- waiting for another agent;
- usage/session limit approaching or reached;
- context window/session ending;
- disk/resource blocker;
- test/build failure;
- authentication/permission blocker;
- uncertainty requiring a decision;
- pausing work intentionally;
- handing work to a child/sub-agent;
- returning control after a milestone;
- any other point where the agent will no longer actively continue execution.

Do not rely on a chat message alone.

CHECKPOINT CONTENT

Every stop checkpoint must state, as applicable:
- task/workstream;
- status: complete / candidate / blocked / paused / waiting / failed;
- exact repository;
- exact branch(es);
- exact pushed SHA(s);
- current production authority if relevant and whether reverified;
- what changed since the previous checkpoint;
- what is implemented;
- what is not implemented;
- tests actually run and exact results;
- tests/builds/reviews NOT run;
- deploy/TestFlight status;
- blockers;
- decisions/input needed;
- safe next step;
- rollback/integration notes when relevant;
- whether local-only/untracked work remains;
- whether private Founder data/harnesses exist locally and were intentionally not pushed.

If implementation changed after the previous report, the checkpoint must reference the NEW exact SHA.

Do not describe a test as passed if it was not run on the exact candidate being reported.

LOCATION

Prefer:
agent-handoffs/reports/<timestamp>-<workstream>-checkpoint-or-final.md

For a decision request, also create/update an appropriate review request under:
agent-handoffs/inbox/review-requests/

Update the established latest pointer when that workstream uses one.

PUSH REQUIREMENT

The report/checkpoint itself must be committed and pushed to a remote branch ChatGPT can read.

If code exists only locally, push the code branch first unless doing so would expose secrets/private data.

Never push:
- credentials;
- private Founder evidence exports;
- private photo bytes unless explicitly authorized;
- local absolute paths containing sensitive material;
- unredacted secrets.

If a privacy/security rule prevents publishing a needed artifact, publish a sanitized report explaining what remains local.

CHILD/SUB-AGENTS

The parent agent remains responsible for publishing the consolidated checkpoint.

Do not assume a child thread's completion is visible to ChatGPT.
Before the parent stops, collect child results, ensure relevant code/reports are pushed, and publish one consolidated parent checkpoint with all child branches/SHAs/results.

USAGE LIMITS

If usage is running low, prioritize:
1. push completed code;
2. publish checkpoint;
3. then spend remaining usage on optional validation.

Do not consume the last available usage on a long test/build and leave no GH handoff.

TESTING EFFICIENCY

Continue to use risk-scaled validation.
Do not perform lengthy simulator/manual tours by default.
Prefer deterministic tests and focused changed-workflow acceptance.
But regardless of test depth, publish exactly what was and was not run before stopping.

CHAT RESPONSE

After publishing, tell Founder the exact GH report path and commit/SHA.
A chat-only status without a pushed GH checkpoint does not satisfy this protocol.

This protocol remains standing until explicitly superseded.

END PROTOCOL.

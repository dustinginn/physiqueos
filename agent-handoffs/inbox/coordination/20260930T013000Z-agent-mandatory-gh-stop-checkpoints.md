PhysiqueOS agent reporting protocol — mandatory GitHub MAIN checkpoint before every stop

Applies to all coding/operations agents, including Claude and Codex, across Server, Native, intelligence, HealthKit, auth, briefing and operations workstreams.

PURPOSE

ChatGPT and Founder coordinate work through GitHub. A coder's local/chat state or feature-branch-only report is not authoritative enough for handoff.

FAIL-CLOSED DEFINITION OF DONE

A session is NOT done, paused, blocked, waiting, handed off, or otherwise safely stopped until its current report/checkpoint is visible and readable from the repository default branch, origin/main.

A report committed only to a feature/worktree branch DOES NOT satisfy this protocol.

If engineering work is complete but publication to main is not complete, publishing the checkpoint becomes the active task. Do not tell Founder the task is done and stop.

MANDATORY RULE

BEFORE EVERY STOP:
1. push all publishable implementation commits to their remote feature branches;
2. create/update the sanitized checkpoint/final report;
3. publish that report/checkpoint to origin/main;
4. update agent-handoffs/latest.json and latest.md when that workstream/protocol uses them;
5. fetch/reverify origin/main;
6. prove the exact report path is readable from origin/main;
7. report the exact MAIN-BRANCH REPORT COMMIT SHA to Founder.

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
- exact implementation branch(es);
- exact pushed implementation SHA(s);
- exact main-branch report commit SHA;
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

MAIN PUBLICATION REQUIREMENT

The report/checkpoint itself MUST be committed to and visible from origin/main.

Feature-branch publication is useful for code authority but is insufficient for handoff.

Implementation code may remain on a reviewed feature branch. The main report must point to its exact pushed SHA.

After publication, explicitly verify all of:
- git fetch origin/main or equivalent remote refresh succeeded;
- origin/main contains the report commit;
- the exact report path can be read from origin/main;
- latest pointers, when required, resolve to the intended report.

If any verification fails, the session is still active and publication recovery is the next task.

If direct main publication is blocked by permissions or a genuine safety rule:
- do not claim completion;
- keep the implementation branch pushed;
- publish to the highest-authority readable remote branch available if possible;
- clearly state MAIN_PUBLICATION_BLOCKED in chat;
- provide the exact blocker and required action;
- resume publication as soon as access is restored.

Never push:
- credentials;
- private Founder evidence exports;
- private photo bytes unless explicitly authorized;
- local absolute paths containing sensitive material;
- unredacted secrets.

If a privacy/security rule prevents publishing a needed artifact, publish a sanitized report to main explaining what remains local.

CHILD/SUB-AGENTS

The parent agent remains responsible for publishing the consolidated checkpoint to origin/main.

Do not assume a child thread's completion is visible to ChatGPT.
Before the parent stops, collect child results, ensure relevant code is pushed, publish one consolidated parent checkpoint to main, and verify it from origin/main.

USAGE LIMITS

If usage is running low, prioritize:
1. push completed code;
2. publish checkpoint to main;
3. verify report from origin/main;
4. then spend remaining usage on optional validation.

Do not consume the last available usage on a long test/build and leave no main-visible GH handoff.

TESTING EFFICIENCY

Continue to use risk-scaled validation.
Do not perform lengthy simulator/manual tours by default.
Prefer deterministic tests and focused changed-workflow acceptance.
But regardless of test depth, publish exactly what was and was not run before stopping.

CHAT RESPONSE

After publishing, tell Founder:
- exact GH report path;
- exact main-branch report commit SHA;
- implementation branch/SHA when relevant;
- confirmation that the report was re-read from origin/main.

A chat-only status, a local report, or a feature-branch-only report does not satisfy this protocol.

CHATGPT COORDINATION RULE

When Founder asks "Check GH", "Check Claude GH", "Check Codex GH", or equivalent, origin/main is the handoff authority.

If no current main-visible report exists, treat the coder handoff as incomplete rather than reconstructing completion from feature branches. Feature branches may be inspected to diagnose the missing handoff, but they do not substitute for the required main report.

This protocol remains standing until explicitly superseded.

END PROTOCOL.

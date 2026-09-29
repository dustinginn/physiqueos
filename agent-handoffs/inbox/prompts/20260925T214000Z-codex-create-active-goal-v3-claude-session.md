Task id: codex-create-active-goal-v3-claude-session-20260925

This is an ORCHESTRATION / SESSION-SETUP task for Codex only.

Do not perform the Active Goal V3 engineering yourself. Do not modify PhysiqueOS product code. Your job is to create a new isolated persistent Claude Code conversation/worktree, deliver the already-published governing engineering prompt to it, verify persistence/authority, report the handoff, and stop.

Read first:
agent-handoffs/STANDING_DISK_SAFETY.md
agent-handoffs/inbox/prompts/20260925T213000Z-claude-active-goal-v3-current-state-coaching.md
agent-handoffs/training-localday/latest.json
agent-handoffs/performance/latest.json
agent-handoffs/latest.json
agent-handoffs/latest.md

REVERIFY AUTHORITY BEFORE SETUP

Expected current production Server:
09f04dc54eb26bfccdd2aeb34b156d8fc7d3f80e

Expected installed Native:
Build60 release SHA 00321dcc6dd86a6479dbca5dd27e691c87348cd8

Expected unreleased combined Native lineage to preserve:
c15f08812dd8c7a0102087d7abca7aa92e61da8d
This already descends from Performance Phase2 c736254b and contains local-day/timezone correctness. The new Goal V3 lane must not lose, overwrite, duplicate, or accidentally fork away from that reviewed Native work.

Do not blindly trust these values; reverify repository refs and current lane pointers first.

PRESERVE EXISTING CLAUDE LANES

Before creating anything, enumerate:
- git worktrees;
- persistent Claude sessions/daemon hosts;
- relevant branch names/paths.

Do not modify, restart, resume, repurpose, stop, or delete any existing lane, including:
- HealthKit Founder Takeover;
- Midweek Briefing Founder Takeover;
- PhysiqueOS Performance Phase 2;
- PhysiqueOS Training + Local Day Correctness.

Prove there is no worktree/branch/session/path collision.

DISK SAFETY

Read and obey STANDING_DISK_SAFETY.md.
Check free disk before setup.
Do not launch heavy tests/builds; this is setup only.
Do not clean unrelated lane artifacts merely to create the chat.
If disk is below the standing floor, stop and report rather than risking existing work.

CREATE NEW ISOLATED WORKTREE / BRANCH

Create a dedicated worktree/branch for the Goal project, using current repository conventions.

Preferred names if collision-free:
branch: claude/active-goal-v3-current-state-20260925
worktree: /private/tmp/physiqueos-active-goal-v3-current-state

Authority requirements:
- Server engineering must be able to descend cleanly from production 09f04dc5.
- Native engineering must preserve c15f0881 as its Native base/ancestor if Native changes are needed.
- Because one git worktree has one HEAD, do not invent a merge or rewrite merely to combine unrelated Server and Native authorities during setup.
- Establish the safest repository starting point for Claude and explicitly tell Claude, via the governing task it will read, to create/use isolated Server/Native candidate branches as needed with those exact bases.
- Do not modify c15f0881 or its existing worktree.
- Worktree must be clean before Claude begins.

CREATE A BRAND-NEW CLAUDE CONVERSATION

Conversation/Remote Control title:
PhysiqueOS Active Goal V3

Start Claude Code from INSIDE the exact new Goal worktree.

This must be a genuinely new Claude conversation/session.
Do not resume or repurpose an existing session.
Do not create multiple sessions if startup fails; diagnose the first attempt.

Make it persistent and phone-accessible from the beginning using the already-proven Claude daemon/bg-PTY Remote Control mechanism.

Once the new session ID exists, use the equivalent established command:
claude --resume <new-session-id> --bg --remote-control "PhysiqueOS Active Goal V3"

Use the locally established invocation if syntax has evolved, but preserve the semantics:
- persistent Claude daemon/bg-PTY ownership;
- independent of Codex's transient shell;
- Remote Control accessible from the user's phone;
- survives Codex ending this task.

Do not use a transient foreground Claude process as the final host.

AUTHENTICATION

Use existing Claude authentication if valid.
Do not open/login to App Store Connect or Apple Developer.
Do not expose tokens/credentials.
If Claude authentication is invalid and requires user interaction, stop and report exactly that rather than creating duplicate/rescue sessions.

DELIVER EXACT ENGINEERING TASK

Once the new persistent Claude conversation is verified, send exactly this instruction to it:

Read agent-handoffs/inbox/prompts/20260925T213000Z-claude-active-goal-v3-current-state-coaching.md and execute it.

Do not paraphrase the task.
Do not add your own engineering interpretation.
Do not substitute another prompt.
Do not send additional product instructions unless required solely to make Claude read the governing file.

Verify Claude receives the instruction and has begun from that GH task.
Do not wait for the full engineering project to complete.

PERSISTENCE VERIFICATION

Before reporting success, verify:
- new Claude session id is known;
- Remote Control is active;
- daemon/bg-PTY host is alive;
- Claude process is independent of Codex transient shell;
- exact worktree and branch are known;
- starting HEAD/base authority is known;
- worktree was clean before Claude began;
- the exact 20260925T213000Z engineering task was delivered;
- existing HealthKit/Midweek/Performance/Training-LocalDay sessions and worktrees remain untouched.

REPORT BACK

Report:
1. Claude conversation name;
2. new Claude session ID;
3. Remote Control link;
4. persistent host/daemon verification;
5. worktree path;
6. branch;
7. starting HEAD;
8. Server authority Claude must use;
9. Native base/ancestor c15f0881 preservation plan;
10. worktree cleanliness before Claude started;
11. disk free space;
12. confirmation all existing lanes were untouched;
13. confirmation exact engineering instruction was delivered and Claude began;
14. any setup caveat.

Then STOP.

DO NOT

Do not perform Goal V3 engineering in Codex.
Do not edit product code.
Do not deploy Server.
Do not prepare/archive/upload Build61.
Do not mutate production.
Do not modify HealthKit policy/reconciliation/ingestion.
Do not touch tomorrow's prospective Cardio acceptance path.
Do not update lane latest pointers merely for session setup unless the established orchestration protocol explicitly requires a setup handoff file.
Do not delete worktrees, sessions, archives, credentials, or other lane state.

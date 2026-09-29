# Claude phone handoff operating procedure

Purpose: preserve the proven PhysiqueOS workflow for starting or restoring a Claude Code engineering session on the Mac and handing control to the Founder on a phone.

This is an agent operating procedure, not a task-specific handoff. Task-specific authority, branches, SHAs, deployments, build numbers, production state, and next actions must live in the relevant timestamped report.

## Proven workflow

The working sequence is:

1. ChatGPT identifies that Claude is the intended engineer and identifies the correct task/workstream.
2. A Mac Codex session inspects the current repository/worktree state and identifies the correct existing worktree/branch for Claude.
3. Codex starts a new Claude Code conversation from that exact worktree.
4. If Claude authentication has expired, Codex may initiate the normal Claude authentication flow. The Founder completes any user verification/authentication step. Codex must not access the Founder's email, retrieve verification links/codes, use hidden credentials, or bypass authentication.
5. After Claude starts successfully, Codex invokes Claude's Remote Control command/workflow. In the proven test, starting a Claude conversation alone was not sufficient for reliable phone takeover; invoking Remote Control restored phone access.
6. Codex confirms the Claude conversation and Remote Control session are available, then stops interacting with that Claude conversation.
7. The Founder takes over the Claude session from the phone.

Remote Control is therefore part of the standard phone-handoff procedure unless a later explicitly validated workflow replaces it.

## Worktree and authority rules

Do not blindly launch Claude from a default directory.

The successful connectivity test used:
`/Users/dustinginn/Developer/PhysiqueOS/native-production-read-foundation`
on branch `Native-build41`.

That proves the phone-handoff mechanism only. It does NOT make that worktree the default for future engineering.

Before every real Claude task, Codex must:
- identify the correct existing worktree/branch for that task;
- verify repository/worktree state and task authority;
- use the worktree containing the intended implementation lineage;
- avoid switching/rebasing/mutating an unrelated worktree merely to launch Claude;
- avoid creating a replacement worktree unless the task explicitly calls for one;
- ensure no other agent is concurrently modifying the same worktree.

For an existing Codex-to-Claude engineering transition, the outgoing Codex must first publish a durable implementation-ready handoff to GitHub. Claude should recover state from GitHub reports/authority rather than reconstructing it from transient chat.

## Authentication rules

Use the existing authenticated Claude installation/session when available.

If authentication is absent or expired:
- Codex may start the normal login flow;
- Codex may enter the Founder-provided account identifier when explicitly authorized;
- the Founder completes user verification;
- do not store account identifiers, verification codes, links, credentials, tokens, or secrets in GitHub handoffs;
- do not change Claude authentication configuration unless separately authorized.

## Remote Control rules

After starting the intended Claude conversation, invoke the normal Claude Remote Control command/workflow required to make the session reachable from the Founder's phone.

Do not invent a replacement Remote Control configuration if the established workflow fails.

If Remote Control requires authentication, configuration changes, installation, destructive actions, or an unclear worktree/session transition, stop and report the blocker.

Once phone access is confirmed, Codex disengages from the Claude session. Codex and Claude must not simultaneously operate the same worktree.

## Claude task bootstrap

The initial Claude prompt should include or point to:
- exact GitHub handoff/report paths;
- current task/workstream;
- correct worktree/branch;
- current production/server/native authority when relevant;
- authorization boundaries;
- exact next action;
- standing test/review/reporting requirements.

For substantial PhysiqueOS engineering, Claude should publish durable GitHub checkpoints after substantive chunks just like Codex.

## GitHub reporting rule

A substantive engineering chunk is not complete until its timestamped report is committed to GitHub main.

Every Codex/Claude review, deployment, upload, repair, or acceptance completion should report:
- GitHub commit SHA;
- report path;
- exact candidate/runtime/build authority;
- tests/review status;
- mutations performed or explicitly not performed;
- unresolved blockers;
- exact next step.

If publication fails, say REPORT NOT PUBLISHED and do not represent the chunk as complete.

For parallel lanes, secondary agents publish timestamped reports to main but must not overwrite `agent-handoffs/latest.json` or `latest.md` when another workstream owns the primary lane.

## Existing PhysiqueOS safety rules remain in force

Phone handoff does not relax any existing rule, including:
- production authority reverification;
- explicit authorization before production writes/deployments when required;
- explicit authorization before TestFlight uploads;
- no App Store Connect/Apple Developer browser login by agents;
- Xcode/guarded uploader release path;
- iPhone 17 Pro simulator-only rule;
- targeted disk cleanup;
- production read-only transaction requirements;
- no new/incremental spending without explicit Founder approval;
- task-specific strategic/data mutation gates.

## Proven test

A bounded connectivity test succeeded on September 24, 2026:
- Claude Code was launched from the established PhysiqueOS Mac workspace;
- authentication was completed through the normal Founder-controlled flow;
- a new Claude conversation returned the expected handoff marker;
- phone access was restored after Codex invoked Claude Remote Control;
- no repository/worktree changes or Claude tool work were required for the test.

Do not store the Founder's account email or other authentication details in this procedure.

## Standard future instruction

When ChatGPT decides Claude should take over a task, the normal orchestration is:

ChatGPT -> Mac Codex bootstrap -> correct existing worktree -> new Claude conversation -> Remote Control -> Founder phone takeover.

For a Codex-to-Claude transition:
1. finish the current coherent Codex chunk;
2. publish the final Codex handoff to GitHub;
3. identify the exact Claude worktree/branch;
4. have a Mac Codex bootstrap Claude there and invoke Remote Control;
5. Claude reads the GitHub handoff and continues;
6. Codex disengages from that worktree/session.

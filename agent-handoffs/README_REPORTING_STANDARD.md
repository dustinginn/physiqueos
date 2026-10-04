# PhysiqueOS Codex reporting standard

Purpose: make every Codex report discoverable by ChatGPT when the Founder says "check GH".

## Mandatory publication rule

Every Codex task that produces a checkpoint, review package, audit, design artifact set, release gate, implementation result, or final report MUST publish a discoverable report on the repository default branch `main` before stopping.

Working branches may keep their own report/artifacts, but a main-branch discoverability update is mandatory.

## Minimum required main-branch update

Before any stop:

1. Publish or copy the canonical report under:
   `agent-handoffs/reports/<timestamp>-<task>.md`

2. Update:
   `agent-handoffs/latest.md`

3. Update:
   `agent-handoffs/latest.json`

4. The latest pointer must include:
   - task name
   - agent
   - status
   - generated UTC time
   - exact source/work branch
   - exact report commit SHA
   - report path
   - artifact root if applicable
   - next action / stop reason

5. Fetch/re-read `main` after publishing and verify the report and latest pointers are actually visible there.

6. Report the exact main commit SHA to the Founder.

## Branch-only reports are not sufficient

Do NOT stop after publishing only to:
- codex/*
- claude/*
- a worktree branch
- a PR branch
- an unmerged local commit

If the work itself should remain isolated on a feature branch, publish a documentation-only discoverability checkpoint to `main` that points to the exact branch/commit/artifact locations.

## No hidden branch assumption

ChatGPT may search all branches when needed, but the durable operating contract is that `main` carries the latest discoverability metadata.

## Conflict safety

If updating `main` directly would risk conflicting with active source work:
- publish only documentation/report/latest-pointer changes;
- do not merge application source;
- do not modify another agent's worktree;
- include exact branch/commit references.

## Founder shorthand

When the Founder says "check GH", the expected lookup path is:
1. read `agent-handoffs/latest.json`;
2. read `agent-handoffs/latest.md`;
3. follow the referenced report/branch/commit;
4. if needed, search recent commits across branches as a fallback.

This standard applies to all future Codex sessions unless the Founder explicitly overrides it.

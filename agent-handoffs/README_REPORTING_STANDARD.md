# PhysiqueOS Codex reporting standard

Purpose: make every Codex report discoverable by ChatGPT when the Founder says "check GH".

## Mandatory publication rule

Every Codex task that produces a checkpoint, review package, audit, design artifact set, release gate, implementation result, or final report MUST publish a discoverable report on the repository default branch `main` before stopping.

Working branches may keep their own report/artifacts, but a main-branch discoverability update is mandatory.

## Minimum required main-branch update

Before any stop:

1. Publish or copy the canonical report under:
   `agent-handoffs/reports/<timestamp>-<task>.md`

2. Do NOT update `agent-handoffs/latest.json` or `agent-handoffs/latest.md` unless this task IS the accepted
   Native release (guarded TestFlight delivery VALID). They are release authority, not the latest task; audit,
   design, report-only, incident and implementation-candidate tasks leave them unchanged. See
   `agent-handoffs/RELEASE_AUTHORITY.md`.

3. Accepted Native release only: update `latest.json` + `latest.md` as the release authority and run
   `python3 agent-handoffs/tools/release_pointer_guard.py --base origin/main --head HEAD` before pushing.

4. The report must include:
   - task name
   - agent
   - status
   - generated UTC time
   - exact source/work branch
   - exact report commit SHA
   - report path
   - artifact root if applicable
   - next action / stop reason

5. Fetch/re-read `main` after publishing and verify the report is actually visible there (and, for a
   release, the latest pointer).

6. Report the exact main commit SHA to the Founder.

## Branch-only reports are not sufficient

Do NOT stop after publishing only to:
- codex/*
- claude/*
- a worktree branch
- a PR branch
- an unmerged local commit

If the work itself should remain isolated on a feature branch, publish a report-only discoverability checkpoint to `main` (new file under `agent-handoffs/reports/` only) that points to the exact branch/commit/artifact locations.

## No hidden branch assumption

ChatGPT may search all branches when needed, but the durable operating contract is that `main` carries the latest discoverability metadata.

## Conflict safety

If updating `main` directly would risk conflicting with active source work:
- publish only the new timestamped report (never the latest pointer, unless this is the accepted Native release);
- do not merge application source;
- do not modify another agent's worktree;
- include exact branch/commit references.

## Founder shorthand

When the Founder says "check GH", the expected lookup path is:
1. read the newest report in `agent-handoffs/reports/` (timestamp-sorted filenames), or the inbox
   `lifecycle.completion_handoff_path` for an inbox task;
2. follow the referenced branch/commit;
3. read `agent-handoffs/latest.json` for the current accepted Native release;
4. if needed, search recent commits across branches as a fallback.

This standard applies to all future Codex sessions unless the Founder explicitly overrides it.

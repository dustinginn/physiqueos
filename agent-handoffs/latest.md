# PhysiqueOS latest agent handoff

Machine-readable interface: `agent-handoffs/latest.json` (read this first).

- Task: Set up bidirectional GitHub agent-control protocol (`bidirectional-control-plane-setup-20260921`)
- Agent: claude
- Status: completed
- Generated (UTC): 2026-09-21T06:14:01Z
- Success: true

Summary: Added the ChatGPT -> GitHub -> agent inbox on main: README (both directions, branch model, agent behavior, context rule, replay safety, security), a short docs/CODEX.md pointer, a sanitized-publish/consume inbox tool with claim/cancel, and --inbox-task-id identity + replay enforcement in the completion publisher. Published one harmless test task (github-bidirectional-transport-test-20260921, status ready, unexecuted). No application, Server, Native or infrastructure change.

Detailed report: `agent-handoffs/reports/20260921T061401Z-bidirectional-control-plane-setup.md`

Protocol: `agent-handoffs/README.md`

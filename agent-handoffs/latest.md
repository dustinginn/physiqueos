# PhysiqueOS latest agent handoff

Machine-readable interface: `agent-handoffs/latest.json` (read this first).

- Task: HealthKit Sleep discovery + canonical architecture (read-only); Founder data shape needs D2 authorization (`healthkit-sleep-discovery-architecture-20260930`)
- Agent: claude
- Status: completed
- Generated (UTC): 2026-09-30T15:30:00Z
- Success: true

Summary: Read-only Sleep architecture: Native already requests Sleep read and has a dormant localOnly stream; Server has no Sleep contract or deletions. Designed sample->episode->wake-date sleep day (18:00 window) canonicalization, episode-level primary-source reconciliation, hourly background sync with activation floor + deletion/window manifest, minimal Evidence UI, privacy allow-list, phases A-E and a 24-case test matrix. Founder data shape not obtainable without a build or Founder action.

Detailed report: `agent-handoffs/reports/20260930T153000Z-healthkit-sleep-discovery-architecture.md`

Protocol: `agent-handoffs/README.md`

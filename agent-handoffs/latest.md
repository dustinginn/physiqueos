# PhysiqueOS latest agent handoff

Machine-readable interface: `agent-handoffs/latest.json` (read this first).

- Task: Evidence intermittent app-open failure audit ("Evidence could not be loaded.") + bounded Native resilience fix (`evidence-app-open-load-failure-audit-20261006`)
- Agent: claude
- Status: completed
- Generated (UTC): 2026-10-06T00:35:00Z
- Success: true

Summary: Root cause PROVEN outside the app: authoritative DNS ns66.domaincontrol.com serves a stale dustinginn.com zone (SOA 2026082000 vs ns65 2026090800) with no physiqueos CNAME, so resolvers that ask ns66 cache NXDOMAIN for up to 3600 s; every Native/web request then fails before reaching the Server (zero Server traffic 23:50-00:10Z; Server healthy, live/ready 200 via ondigitalocean host and pinned custom domain; home router 10.0.0.1 still NXDOMAIN at 00:33Z). Native defect PROVEN: Evidence root was the only tab root with a catch-all terminal failure, no Retry/pull/foreground retry, and blanked a loaded hub on refresh failure (Home hides the same outage with its last-known snapshot). Bounded fix c3d9d257: newest-load-wins guard, cancellation is non-terminal, failed refresh keeps the in-memory hub, classified copy, Try Again + pull to refresh + foreground retry when failed, bounded EvidenceHubLoad diagnostics. Batch 3 preview 9fa2428c keeps the locked design. Founder must fix GoDaddy DNS.

Detailed report: `agent-handoffs/reports/20261006T003500Z-evidence-app-open-load-failure-audit.md`

Protocol: `agent-handoffs/README.md`

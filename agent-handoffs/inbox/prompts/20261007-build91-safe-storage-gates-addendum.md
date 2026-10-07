PhysiqueOS Build 91 — mandatory safe storage gates for remaining work

This is an additive operational instruction for the current Universal Priority Skip Server/Web deployment task and all subsequently staged Build 91 Native integration and release tasks. It does not authorize any new product work or a production mutation.

Rationale: the shared Mac had approximately 10.86 GiB free after the last safe cleanup. Concurrent Codex/Claude/Xcode jobs can consume that quickly.

BEFORE substantial tests, Release builds, simulators or archives:
Record filesystem free space and identify active Xcode/test/Claude/Codex/Remote Control processes, their owned build outputs and current worktrees. Choose one dedicated DerivedData/build-product location per lane where practical, and reuse it. Estimate headroom from prior runs. Do not start a large validation job if it is likely to exhaust the disk. Pause and report if adequate room cannot be recovered safely.

DURING work:
Check free space between major gates. Avoid duplicate build products, redundant test runs and duplicate simulators. Never interrupt a live process to reclaim space. Preserve all current task gates and do not silently skip required release verification.

AFTER each completed gate, but only once its required results/acceptance evidence are captured:
Remove only that lane's clearly identified, no-longer-used, regenerable PhysiqueOS DerivedData, completed test results, temporary Release/Debug products, and temporary renderer scratch. Dedicated test simulators may be deleted only when shut down, uniquely associated with a completed lane and not used by another active session. Never delete simulator runtimes.

AFTER accepted TestFlight upload:
Retain the signed Build 91 archive and prior Builds 85–90 archives and upload receipts. Clean only regenerated intermediates and disposable lane-specific test artifacts.

NEVER delete or modify:
Git repositories or worktrees; branch/source/config/uncommitted content; handoff reports/boards; release archives and signing credentials; DigitalOcean configs or production-read tooling; Founder media; production data; active build outputs or booted simulators; SDKs/runtimes; anything ambiguous. No git clean, broad rm, cache purge, worktree prune or forced process shutdown.

If free space remains low, stop at the approved safety boundary and publish the blocker instead of risking an active lane.

At every task report include:
free space before/after, MiB/GiB reclaimed, categories removed, active/protected paths intentionally retained, whether required gates completed, and storage risks for the next lane.

Publication:
Founder authorizes publishing the task's final new timestamped report to dustinginn/physiqueos main through the installed guarded report-only publisher, adding only new files under agent-handoffs/reports/, with fresh fast-forward verification, no existing-file modifications, and latest.json/latest.md unchanged. Candidate branch pushes require exact stated candidate authority; do not use broad Git permissions.

Do not change the current Universal Skip deployment task's predeployment, deployment or rollback criteria. Apply these storage checks to its LOCAL build/test artifacts only; do not clean while jobs remain active.

Future Build 91 integration and release task authors must copy these safety gates by reference and must not depend on an unstaged conversation instruction.

STOP after the owning task's existing completion point.
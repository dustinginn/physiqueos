# Mac storage operations backlog — 2026-10-04

- Last conflict-safe cleanup: `2026-10-04T06:13:43Z`.
- Free space after cleanup and report-worktree housekeeping: **16,372,732 KiB (15.614 GiB)**.
- Net reclaimed from the pre-delete checkpoint: **2,352,644 KiB (2.244 GiB)**. Pre-existing cleanup removed only an Apple media-analysis cache and an ignored September Next.js provider-check build; the clean task-created report worktree was then removed with Git tooling after publication.
- Standing trigger: audit when free disk falls below **30 GiB**; never start or continue disk-intensive work below the existing **15 GiB hard floor**.

## Remaining Tier 3 candidates

1. Installed iOS/watchOS simulator runtimes (~19.6 GiB): retain while current Native/Watch work needs them; make a separate Founder retention decision in an inactive window.
2. Active/ambiguous `/private/tmp` PhysiqueOS design and worktree material (~4.3 GiB): reassess only after all referenced design tasks finish and Git/process checks are clean.
3. Active Codex runtimes (~1.56 GiB) and Codex/Claude session/worktree state: reassess only after the apps/tasks close; never delete session state or local-only work.
4. Power-management log history (~1.35 GiB): requires a separate diagnostic-retention decision because it is not regenerable.
5. Legacy Documents/File Provider worktree database and linked checkouts: recovery scanner returned `FAIL_SCANNER_ERROR` during active Xcode Git status; keep protected until an inactive-window audit proves dirty state, ownership, and durability for every entry.

No recurring automation was created.

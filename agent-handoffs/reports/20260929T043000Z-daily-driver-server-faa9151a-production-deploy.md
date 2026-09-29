# Production deploy: daily-driver Server `faa9151a`, deployed and verified

- **Authorization:** `agent-handoffs/inbox/decisions/20260929T052500Z-build69-accept-server-deploy-hold-native-for-codex.md`, which covers the guarded deploy of the exact candidate `faa9151a`.
- **Agent:** claude
- **Status: DEPLOYED and verified.**
  - Native Build 69 is **held**, not uploaded, waiting on Codex's records celebration.
  - No manual data repair.
  - No schema or data migration.

## Authority

| | Before | After |
|---|---|---|
| Server/Web SHA (web + worker `source_commit_hash`) | `396e750d7a2c9c4cb4971b8936c56e4476805e07` | **`faa9151a8118acf48fda6541e8e23898f1148246`** |
| App Platform deployment | `c0ad0cc9-cea7-4c54-81e5-b4861501ea73` | **`76c3d8aa-fbfd-4809-9e14-569c67af969b`** (ACTIVE 9/9 at 04:15:43Z; cause: manual force-rebuild) |
| Production branch `combined-app-platform-cutover` | `396e750d` | `faa9151a` (fast-forward; the candidate descends from production) |
| Build id (`/ready`) | `physiqueos-396e750d-20260929` | `physiqueos-faa9151a-20260929` |
| Schema | `PROVIDER_MIGRATION_000014_APPLIED` | unchanged |

**Spec change:** only the 4 stamps (`PHYSIQUEOS_GIT_SHA` and `PHYSIQUEOS_BUILD_ID` on web and worker). The automatic spec-update deployment `49fd2b60` was cancelled in favour of the force-rebuild, as in previous deploys.

## Gates, all on the exact SHA

- **Authority reverified:**
  - The production branch was at `396e750d`, with no deployment in progress or pending.
  - `/ready` was green.
  - `faa9151a` descends from `396e750d`.
- **No risky files:** the diff touches no migration, schema, dependency or infrastructure file.
- **Full regression:** 9178/9486. The 303 failures are the same environmental set as production's baseline; **0 new**.
- **Production build:** exit 0.
- **Review:** the fresh-context review approved it (Server APPROVE WITH NITS, after 3 fixes). The Founder/ChatGPT decision accepted it.

## Post-deploy verification

**Health:** `/live` and `/ready` both return 200, with all checks ready.

**Runtime:**
- Web and worker `source_commit_hash` are `faa9151a`.
- The worker's runtime log `gitSha` is `faa9151a…`.

**Code inside the running build** (`/app/.next/server`, read-only scan):

| Marker | Count |
|---|---|
| `priority.skip.v1` | 3 |
| `cross_device_cumulative_advance` | 2 |
| `coverageState` | 4 |
| `training:cardio:` (Logged Today lines) | 2 |
| "possible Logger session" (singular copy) | 2 |
| `PRIORITY_SKIP_UNSUPPORTED` | 2 |
| `createSessionPerformanceRecordsReadModel` | **0** |

The zero confirms the Codex-owned records change is **not** deployed.

**Zero unintended data drift:** read-only snapshots were taken before and after the deploy. They cover all 47 collections (count plus an `(id, version)` digest each) and every `command_receipts` type. **All identical.**

**Contracts:**
- Native reads and writes use only additive, optional fields (`lines`, `coverage`, `coverageState`, `isPartialDay`, `provisional`, `skippable`, `skipCommand`) plus one new write command, `priority.skip.v1`. Build 68 keeps working:
  - it ignores the new fields;
  - the Training row keeps the Strength session link;
  - the Activity value string carries "so far".
- No Founder read had hit the new build when this report was written. The first natural HealthKit ingest did, below.

## Sep 28: natural correction observed, no repair

The phone's first ordinary HealthKit sync after the deploy (**04:19:13Z**) sent Sep 28 revision 40 (851.4 cal, `partial_day`) under the re-paired delivery identity `01a0e8bb…`.

The new rule accepted it as a cross-device cumulative advance:
- the result was `activity_day_canonicalized` / update;
- **the canonical day went from v10 at 171.405 cal to v11 at 851.4 cal**, having been frozen since 15:32Z.

Earlier revisions 11–39 stay stored raw as superseded. Nothing was replayed or repaired.

Sep 28 will get its `complete_day` summary on the next-morning sync, as usual. That's no longer needed to unfreeze it; it just finalizes the day. I'll verify it read-only when it arrives.

## Rollback

Push `396e750d` back to the production branch, restore the 4 stamps, and force a rebuild. There is no data or schema change to undo. Canonical days advanced under the new rule stay valid under the old code: it simply stops taking cross-device updates again.

## Native integration gate

Native Build 69 (`c2b43091`) is accepted as the integration base and is **not uploaded**.

At the time of writing, no `*workout-complete-performance-record-celebration*` report from Codex is on GitHub. Per the decision, I've stopped at the Native integration gate. When the Codex report appears, I will:
1. review it against the canonical-authority rules;
2. integrate it onto `c2b43091` or reject it with reasons;
3. run the full Native suite, the Release compile and a fresh review;
4. publish the final integrated Build 69 report.

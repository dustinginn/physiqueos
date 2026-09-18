# PhysiqueOS current operations and workspace authority

Last verified: 2026-09-17 on the canonical Mac development host.

This is the starting point for a new Codex or Claude session. Historical
handoffs remain evidence, but they do not override this file.

## Canonical Mac workspace

Use this repository path as the default PhysiqueOS development environment:

```text
/Users/dustinginn/Developer/PhysiqueOS/native-production-read-foundation
```

The path name is historical. Do not rename or move it merely for aesthetics:
its Git administration is linked to the primary worktree at
`/Users/dustinginn/Developer/PhysiqueOS/server/.git`, and moving it adds risk
without changing authority.

PhysiqueOS currently has two intentionally divergent source authorities. Do
not infer that either tip contains the other:

| Authority | Commit | Durable reference | Current Mac worktree |
| --- | --- | --- | --- |
| Production server | `a191c27440f953ad05af8d1a09e9ec90d46cdc95` | `origin/combined-app-platform-cutover` and `origin/claude/server-build33-operating-plan-notifications-training` | `.tmp/server-build39-followup` |
| Native shipping build 1.0 (40) | `cda5603d2b8b0c97dd8fb1d00866b38c9d56fdec` | local `claude/build39-dismissed-evidence-replacement-native` plus the Build 40 Xcode archive/TestFlight record | repository root before the cleanup branch |

The server and Native tips diverge from merge base
`9a8cb3e133634b463cdeae013cad768ea9ac6f01` (157 server-only commits and
184 Native-only commits). Select the authority for the task; never merge,
rebase, or copy migrations across the split as an incidental cleanup step.

The production server branch owns the canonical migration ledger through
`000014`. The Native shipping branch contains only `000001` through `000011`.
Always inspect or change migrations from the production server authority, and
never rewrite an existing migration.

The Native Build 40 commit has no remote branch or tag as of this verification.
Preserve its local branch and Build 40 archive. Publishing a remote ref or tag
requires Founder approval; do not let ordinary branch pruning remove its only
Git reference.

## Worktree roles

- `native-production-read-foundation`: canonical default Mac workspace and
  Native shipping source. Cleanup work is isolated on
  `codex/project-cleanup-audit`.
- `native-production-read-foundation/.tmp/server-build39-followup`: clean,
  exact production-server source at `a191c274…`. Its `.next` directory is a
  disposable local cache; the source worktree is not.
- `server`: primary Git worktree that owns the shared `.git` object database.
  Its checked-out commit `d20c304…` is an ancestor of production. Do not delete
  this directory as though it were an ordinary linked worktree.
- `confidence-v3-shadow`: protected worktree with three commits not reachable
  from the server, Native, or `main` authorities. Do not touch it during
  cleanup.

Run `git worktree list --porcelain` and inspect every worktree's status before
changing branches or removing a worktree. Never remove unique commits or
untracked material.

## Production identity and context separation

Production metadata was freshly verified without mutation:

```text
App ID:       bf57cf56-48cc-4cd6-90e4-a23ee5381741
App name:     physiqueos-foundation-staging
Deployment:   617a707e-7a04-4031-9f57-0135a286b371 (ACTIVE)
Web source:   a191c27440f953ad05af8d1a09e9ec90d46cdc95
Worker source:a191c27440f953ad05af8d1a09e9ec90d46cdc95
```

The historical app name does not make this a disposable staging application.

Use the saved DigitalOcean contexts only for their named responsibility:

| Responsibility | Required context |
| --- | --- |
| Read-only production metadata/audit | `physiqueos-final-cutover-config` |
| Explicit production migration | `physiqueos-production-migrate` |
| Explicit production deployment | `physiqueos-production-deploy` |

Always pass `--context` explicitly. The machine's currently selected global
context was `physiqueos-deploy` during this audit; never rely on that implicit
selection and never silently fall back between contexts. Do not print tokens,
recreate PATs, broaden scopes, or place credentials in documentation.

Mac is the primary operator. The PC remains a backup/recovery operator. The
PowerShell, bounded-replica, encrypted-recovery, and Windows rollback material
is historical or rollback tooling—not evidence that Windows is still the
primary production authority. Retire it only through a separate, approved
recovery-capability decision.

## Native project and release authority

`ios/Scripts/generate_project.py` is the source-controlled Xcode project
generator. The checked-in `ios/PhysiqueOS.xcodeproj` is generated output that
must remain deterministic and committed. Release metadata is verified by:

```bash
python3 ios/Scripts/verify_release_configuration.py
```

Only increment `APP_BUILD_NUMBER` for an authorized release. Generate the
project twice and require a stable result when Native project inputs change.
Do not change signing/account state during cleanup.

The meaningful current rollback artifacts are the Build 40 archive and the
immediately preceding Build 39 archive under
`~/Library/Developer/Xcode/Archives/2026-09-17/`. Older archives require a
Founder retention decision; none are automatically disposable merely because
they are old.

## Test interpretation

Do not report the broad suite as a candidate regression without classifying
its environment and fixture dependencies.

- Tests that open `private/founder/runtime-store.json` or
  `private/founder/migration-control.json` require intentionally unavailable
  Founder-private fixtures. Do not fabricate or copy those fixtures.
- Windows runtime, scheduler, PowerShell, ACL, and replica tests are not a Mac
  product signal unless run in their intended Windows environment.
- Listener failures such as `listen EPERM 127.0.0.1` are sandbox limitations.
- Temporary roots may be spelled `/var/...` by Node and `/private/var/...` by
  Git on macOS. The embedded-repository audit now compares physical paths.
- Collection-count/package fixtures that omit new canonical collections and
  source-text tests that expect superseded selectors/helpers are obsolete test
  debt. Correct the fixture/assertion on the production server line; do not
  change product behavior to satisfy the old assertion.
- Invalid-date failures in Progress reporting need a bounded fixture/service
  diagnosis before any product change.

Use focused tests for the changed surface. Record known baseline failures and
compare them with a pre-change run instead of importing private production
state merely to make the suite green.

## Cleanup and rollback invariants

Do not delete or mutate:

- production data, schema, credentials, deployment, or migration ledger;
- migrations `000001` through `000014`;
- Native Build 40 source or archive;
- unique Confidence V3 commits;
- Founder evidence/private fixtures;
- current release, signing, or rollback material;
- Confidence V3, Narrative V3, or HealthKit behavior.

Generated caches (`.next`, DerivedData, coverage, test reports) are
reproducible. Archives, unique worktrees, operational scripts, and historical
forensics are not caches and require classification before removal.

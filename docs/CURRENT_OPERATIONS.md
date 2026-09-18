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
| Native shipping build 1.0 (40) | `cda5603d2b8b0c97dd8fb1d00866b38c9d56fdec` | annotated tag `native-v1.0-build40`, published to `origin`, plus the Build 40 Xcode archive/TestFlight record | repository root before the cleanup branch |

The server and Native tips diverge from merge base
`9a8cb3e133634b463cdeae013cad768ea9ac6f01` (157 server-only commits and
184 Native-only commits). Select the authority for the task; never merge,
rebase, or copy migrations across the split as an incidental cleanup step.

The production server branch owns the canonical migration ledger through
`000014`. The Native shipping branch contains only `000001` through `000011`.
Always inspect or change migrations from the production server authority, and
never rewrite an existing migration.

The Native Build 40 commit's durable reference is annotated tag
`native-v1.0-build40` (created and pushed to `origin` during the 2026-09-17
cleanup; peels to `cda5603d2b8b0c97dd8fb1d00866b38c9d56fdec` exactly). Do not
move this tag. Its local branch `claude/build39-dismissed-evidence-replacement-native`
and Build 40 archive remain the working checkout/rollback material; the tag
is what makes it recoverable even if that local branch is ever pruned.
Establishing a new build authority tag later requires the same "verify no
existing exact ref, then create an annotated tag on the shipping commit and
push it" pattern — do not overwrite `native-v1.0-build40`.

Local branch hygiene: on 2026-09-17, 10 branches with commits already fully
reachable from either the production server authority or the Build 40 tag
were pruned (5 by `git branch -d`, 5 by `git branch -D` after independently
verifying reachability — `-d`'s default check only compares against the
currently checked-out line and produced false "not merged" warnings for
branches that were genuinely merged into the *other* authority). See the
2026-09-17 cleanup session record for the exact list. No unique commit was
lost; no remote branch was touched.

## Worktree roles

- `native-production-read-foundation`: canonical default Mac workspace and
  Native shipping source. Cleanup work is isolated on
  `codex/project-cleanup-audit`.
- `native-production-read-foundation/.tmp/server-build39-followup`: clean,
  exact production-server source at `a191c274…`. Its `.next` directory is a
  disposable local cache; the source worktree is not. **This is a nested,
  hard-to-discover location for the current production authority.** A
  relocation to make `server` (below) the obvious home for it has been
  *designed* but not executed — see "Pending Founder decision: Server
  workspace relocation" below.
- `server`: the **main** Git worktree — it owns the real `.git` directory;
  every other worktree listed here (including the canonical root) is a
  *linked* worktree whose `.git` is a pointer file into
  `server/.git/worktrees/<name>`. Its checked-out commit `d20c304…` is an
  ancestor of production but two commits behind the exact current authority
  (which instead lives in the nested `.tmp/server-build39-followup` linked
  worktree above). Do not delete this directory or attempt `git worktree
  move` on it as though it were an ordinary linked worktree — Git does not
  support moving the main worktree that way. See the relocation design below
  for the actual safe path to make its content match its name.
- `confidence-v3-shadow`: protected worktree with three commits not reachable
  from the server, Native, or `main` authorities. Do not touch it during
  cleanup.

Run `git worktree list --porcelain` and inspect every worktree's status before
changing branches or removing a worktree. Never remove unique commits or
untracked material.

### Pending Founder decision: Server workspace relocation

`config/embedded-repository-policy.json` also lists three linked worktrees —
`.tmp/windows-deploy-264a6306`, `.tmp/incident-failed-artifact-264a6306`, and
`.tmp/windows-deploy-9c1aa80c` — that do **not** currently exist on this Mac
(confirmed absent from disk and from `git worktree list` on 2026-09-17). The
policy entries predate the 2026-09-17 cleanup (last touched 2026-08-16) and
were left untouched by it. `scripts/auditEmbeddedRepositories.mjs` only
matches policy entries against paths it actually discovers on disk, so a
dangling entry for a path that doesn't exist is inert — it causes no audit
failure and no false pass, just a stale registry entry. `HISTORICAL — pending
Founder decision`: confirm whether these three were already legitimately
retired (the `windows-deploy-9c1aa80c` entry itself says it "may be retired
via `git worktree remove` once the migration/recovery checkpoint is
accepted," and its cited commit `9c1aa80c…` is an old production authority,
not the current one) or whether they still exist elsewhere (e.g. the PC) and
these Mac policy entries are simply carried-over metadata. Do not delete or
edit these policy entries without that confirmation — the two
`264a6306`-suffixed entries are marked protected incident evidence.

The designed (not executed) relocation to make `server` hold the exact
current production authority in place, without ever moving the main
worktree's directory:

1. Preconditions: `server` clean (verified 2026-09-17); `.tmp/server-build39-followup`
   clean (verified); `package.json`/`package-lock.json` identical between
   `d20c304…` and `a191c27…` (verified — no dependency reinstall required).
2. `git -C .../native-production-read-foundation worktree remove .tmp/server-build39-followup`
   — safe only because it is clean and its commit is independently reachable
   from `origin/combined-app-platform-cutover` and
   `origin/claude/server-build33-operating-plan-notifications-training`; this
   step alone frees branch `claude/build39-weekly-monthly-dismissed-replacement`
   from being "used by a worktree" so it can be checked out elsewhere.
3. `git -C .../server fetch origin` then
   `git -C .../server checkout claude/build39-weekly-monthly-dismissed-replacement`
   — switches the **main** worktree's checkout in place; no directory move,
   no `git worktree move`, and the shared `.git` administrative directory
   that every other worktree depends on never moves.
4. Validate: `git -C .../server rev-parse HEAD` equals `a191c274…`; `git -C
   .../server status` clean; `node_modules` still valid (no lockfile drift,
   confirmed in step 1); production tooling paths that reference `server`
   still resolve.
5. Update this document's worktree table and any script defaults that assume
   `.tmp/server-build39-followup` is the production-authority path.
6. Rollback if needed: `git -C .../server checkout claude/server-build33-operating-plan-notifications-training`
   (branch untouched, trivially reversible); the removed linked worktree can
   be recreated with `git worktree add .tmp/server-build39-followup
   claude/build39-weekly-monthly-dismissed-replacement` if its exact path is
   still wanted for some other reason.

This is intentionally a branch-checkout swap inside the existing main
worktree, not a filesystem move — Git does not support directly moving a
main worktree the way it supports `git worktree move` for linked ones.

## Production identity and context separation

Production metadata was freshly verified without mutation:

```text
App ID:       bf57cf56-48cc-4cd6-90e4-a23ee5381741
App name:     physiqueos-foundation-staging
Domain:       https://physiqueos.dustinginn.com
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

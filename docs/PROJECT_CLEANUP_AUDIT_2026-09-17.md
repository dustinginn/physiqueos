# PhysiqueOS project cleanup audit — 2026-09-17

This audit followed Build 40 focused physical acceptance. It began with
inventory and classification, made no production mutation, and treated age or
temporary-looking names as insufficient evidence for deletion.

## Authority verification

- Canonical Mac repository:
  `/Users/dustinginn/Developer/PhysiqueOS/native-production-read-foundation`
- Origin: `git@github.com:dustinginn/physiqueos.git` for fetch and push.
- Production server authority:
  `a191c27440f953ad05af8d1a09e9ec90d46cdc95`.
- Production deployment:
  `617a707e-7a04-4031-9f57-0135a286b371`, freshly verified `ACTIVE` on
  2026-09-17 with explicit read-only context
  `physiqueos-final-cutover-config`.
- The deployment's web and worker both report source commit `a191c274…`.
- Remote `combined-app-platform-cutover` and
  `claude/server-build33-operating-plan-notifications-training` both freshly
  resolve to `a191c274…`.
- Native shipping authority: version 1.0 (40), commit
  `cda5603d2b8b0c97dd8fb1d00866b38c9d56fdec`.
- Build 40 exists only on a local branch (no remote ref and no tag). Its local
  branch and Xcode archive are therefore required rollback material.
- The cleanup work is isolated on `codex/project-cleanup-audit`, created from
  the unmodified Native shipping commit.

The server and Native tips are intentionally divergent: merge base
`9a8cb3e…`, 157 commits on the server side and 184 on the Native side. The
server tip owns migrations `000001`–`000014`; the Native tip contains
`000001`–`000011`. This is documented as a dual-authority source rule rather
than hidden behind a false single-branch claim.

## Worktree inventory

Sizes are approximate and were measured before the safe-cache deletion unless
otherwise noted.

| Path | Branch / HEAD | State | Relationship and unique work | Size / role | Classification |
| --- | --- | --- | --- | --- | --- |
| `/Users/dustinginn/Developer/PhysiqueOS/native-production-read-foundation` | cleanup branch from `cda5603…` | cleanup source changes only | exact Native shipping base; cleanup commit is the active workstream | about 1.1 GB before cleanup (included nested worktree/cache); canonical default Mac workspace | `AUTHORITATIVE_KEEP` |
| `/Users/dustinginn/Developer/PhysiqueOS/native-production-read-foundation/.tmp/server-build39-followup` | `claude/build39-weekly-monthly-dismissed-replacement` / `a191c274…` | clean | exact production server authority; no unique commit beyond authority | 676 MB before cleanup; about 68 MB after `.next` removal | `AUTHORITATIVE_KEEP` |
| `/Users/dustinginn/Developer/PhysiqueOS/server` | `claude/server-build33-operating-plan-notifications-training` / `d20c304…` | one untracked forensic script at inventory time | two commits behind production, zero authority-unique commits; owns the shared `.git` object database | about 1.0 GB (`node_modules` 765 MB, `.next` 148 MB, Git 70 MB) | `ROLLBACK_KEEP`; do not delete as an ordinary worktree |
| `/Users/dustinginn/Developer/PhysiqueOS/confidence-v3-shadow` | `claude/confidence-v3-shadow` / `53300b3…` | clean | three unique Confidence V3 commits | about 68 MB; last meaningful use 2026-09-13 | `AUTHORITATIVE_KEEP`; explicitly out of cleanup scope |

Total registered worktrees: **4**. Worktrees automatically safe to remove:
**0**. The nested server worktree could be retired only after deliberately
relocating the exact server authority to an obvious clean worktree. The
`server` path cannot simply be deleted because it owns the common Git metadata.

Worktrees containing unique work at inventory time:

- `confidence-v3-shadow`: three unique protected commits.
- `server`: untracked `scripts/auditDexaConfirmationFailure.mjs`; it was
  copied byte-for-byte into tracked cleanup source before any removal
  (`SHA-256 5dc1bebf…b210275`).
- the canonical root: the active cleanup changes after branching from Build 40.

## Branch inventory

### Local branches safe to prune after cleanup review (10)

Every tip below is reachable from the current server or Native authority and
is not a checked-out authority or protected unique-work branch:

- `claude/native-v1-build33-operating-plan-notifications-training`
- `claude/native-v1-build32-notifications-daily-driver`
- `combined-app-platform-cutover` (stale local tip; remote is current)
- `claude/server-build32-daily-driver`
- `codex/native-v1-build31-founder-acceptance-performance`
- `codex/native-v1-production-read-foundation`
- `codex/native-build23-server-corrections`
- `codex/native-contract-gap-closeout`
- `claude/native-energy-contract-correction-local`
- `codex/native-v1-build16-founder-corrections`

No local branch was deleted. Keep `main`, both current authority branches, the
cleanup branch, the protected Confidence V3 branch, and the checked-out
`server` branch until its worktree role is deliberately resolved.

### Remote branches proposed for Founder-reviewed pruning (22)

These are reachable from current authorities or patch-equivalent to current
server history. No remote deletion was performed.

- `origin/codex/native-contract-gap-closeout`
- `origin/codex/native-production-write-contract`
- `origin/claude/native-energy-contract-correction-local`
- `origin/codex/package7-production-read-corrections`
- `origin/codex/native-founder-pairing-bootstrap`
- `origin/codex/server-native-production-contracts`
- `origin/codex/server-package6-with-portable-provider-gate`
- `origin/codex/provider-gate-machine-independent`
- `origin/codex/server-plumbing-intelligence-lifecycle`
- `origin/codex/server-plumbing-goal-phase-priority-reconciled`
- `origin/codex/confidence-coaching-narrative-polish-20260909`
- `origin/codex/confidence-explanation-v2-implementation-20260909`
- `origin/native-v1`
- `origin/codex/native-sandbox-bootstrap-pairing`
- `origin/gate7-access-gate-4e52d3b6`
- `origin/gate4-compatibility-repair-9c1aa80c`
- `origin/gate3-compatibility-9c1aa80c`
- `origin/phase6-compatibility-release`
- `origin/phase5-cutover-readiness`
- `origin/phase4-persistence-rehearsal`
- `origin/phase3-application-boundary`
- `origin/phase2-provider-staging`

Two graph-unique remote branches are retained as `HISTORICAL_KEEP` pending a
separate content decision:

- `origin/codex/wp2c-baseline-output-atomicity-preservation`
- `origin/codex/app-wide-performance-20260907`

Keep both current production-server refs and `origin/main`.

## Source-tree and generated-artifact audit

### Safe cleanup completed

- Removed ignored `.tmp/Build38Derived`: 105,100 KiB.
- Removed ignored `.tmp/Build38DerivedHost`: 293,688 KiB.
- Removed the clean production-server worktree's generated `.next`: 622,344
  KiB.
- Exact measured removal: **1,021,132 KiB (about 997 MiB)**. APFS free-space
  display increased from 9.4 GiB to about 10 GiB immediately after deletion.
- Removed three committed zero-byte accidental shell-output files:
  `tmp-next-dev.err`, `tmp-start.err`, and `{console.error(e.message)`.
- Added a narrow root `/tmp-*.err` ignore rule.

The reported PC artifact `.next.rollback-39548/` (and equivalent committed
rollback caches) is absent from the current Mac worktrees and from objects
reachable by current local/remote refs. Existing ignore rules already reject
`.next.rollback-*`, `.next.failed-*`, `.next.release-*`, `.next.fallback-*`,
`.next.recovery-*`, and related generated families.

### Historical or operational keep

- The 42 MB tracked `screenshots/` set is historical visual-review evidence.
  New screenshots are ignored; deleting the committed set is not automatic.
- `.tmp/Build40ExportOptions.plist` is tiny release-session material and was
  left in place.
- `.tmp/digitalocean/run-read-only-app-console.mjs` enforces the audit context
  and rejects the deploy context, but app-console access can still reach a
  production runtime. It remains local and requires a separate decision before
  promotion or deletion.
- `scripts/auditDexaConfirmationFailure.mjs` is `HISTORICAL_KEEP`, not junk.
  It uses a PostgreSQL-enforced repeatable-read/read-only transaction, selects
  bounded lifecycle metadata rather than evidence payloads, and is explicitly
  cited as the safety pattern by the later tracked Training audit.

## Xcode and Native disk audit

- Xcode archives: about **985 MB**, 19 archives, builds 1, 2, 7, 16–18, and
  28–40.
- `KEEP`: Build 40 (65 MB) and immediate rollback Build 39 (65 MB).
- `SAFE_TO_DELETE`: none proven. The audit found no evidence sufficient to
  label an archive failed or redundant.
- `REQUIRES_FOUNDER_DECISION`: the other 17 archives (about 855 MB total).
- Xcode DerivedData: about **1.0 GB**, reproducible and technically safe to
  regenerate, but retained to avoid disrupting the current development state.
- iOS DeviceSupport: about **5.7 GB**, retained.
- CoreSimulator devices: about **12 GB**, retained; no device was classified
  obsolete without inspecting its use.
- No IPA/export directory or loose repository IPA was found. No signing or
  account material was changed.

## Server and Node disk audit

- Primary `server/node_modules`: about **765 MB**, retained as the one existing
  shared dependency installation.
- Primary `server/.next`: about **148 MB**, reproducible but retained because
  that primary worktree remains part of the Git/rollback environment.
- Nested production-server `.next`: about **608 MB**, removed.
- No canonical-worktree dependency tree was deleted.

Total clearly reproducible recovery identified is about **2.1 GiB** when the
executed 997 MiB is combined with retained Xcode DerivedData and the retained
primary-server `.next`. Only the 997 MiB repository-local subset was executed.

## Migration, cutover, and legacy tooling

- `AUTHORITATIVE_KEEP`: production server migrations `000001`–`000014`, the
  immutable migration ledger, current database/app composition, current app
  templates, and migration validation contracts.
- `ROLLBACK_KEEP`: combined-cutover coordinator, handoff, fence, recovery,
  Windows authority restoration, worker restoration, and encrypted recovery
  paths. They remain referenced and preserve recovery capability.
- `HISTORICAL_KEEP`: Phase 2–7 rehearsal tools, simplified/provider migration
  helpers, Founder cutover scripts, one-off migration scripts, Windows/PC
  replica tooling, and ngrok-era helpers. They are referenced by tests,
  manifests, package commands, or historical recovery documentation.
- `SAFE_TO_REMOVE`: generated rehearsal/build outputs only. No tracked
  migration/cutover tool was proven both unreferenced and operationally
  unnecessary, so no tracked tooling was deleted.

The PC remains the backup operator. Windows-specific tooling is not current
Mac production authority, but that fact alone is not proof it can be deleted.

## Documentation and production-operations hygiene

`docs/CURRENT_OPERATIONS.md` is the current runbook. `docs/README.md` now
points to it before the old framework boilerplate. The runbook explicitly
records:

- canonical Mac path and the server/Native authority split;
- production app/deployment/source identity;
- Native generator/release authority;
- migration-ledger ownership;
- Mac-primary/PC-backup roles;
- read-only, migration, and deployment DigitalOcean contexts;
- the rule to pass `--context` explicitly and never use implicit fallback;
- test environment/fixture classifications and cleanup invariants.

The global doctl selection remains legacy context `physiqueos-deploy`; it was
not changed. No token was shown, rotated, recreated, or broadened.

## Test and fixture debt classification

Production-server Package 7 selection at `a191c274…`: **299 passed / 6
failed**. Four failures require the intentionally absent private Founder
migration-control fixture; two are the known invalid-date fixture/service
path.

Broad unit inventory at `a191c274…`: **6,960 passed / 305 failed / 5 skipped
out of 7,270 tests**. This is a debt inventory, not a candidate-regression
result. Failures classify as:

- `INTENTIONAL_UNAVAILABLE_PRIVATE_FIXTURE`: direct reads of Founder runtime,
  migration control, historical backup, and exact production records.
- `ENVIRONMENT_PORTABILITY`: `/var` versus `/private/var`, Windows-only
  PowerShell/runtime/ACL assumptions, and sandbox `listen EPERM` restrictions.
- `OBSOLETE_ASSERTION_OR_FIXTURE`: 39-versus-current collection inventories,
  missing `myLibraryMemberships` in synthetic exports, old source-text route
  helpers, and superseded Photos/selector expectations.
- `REAL_TEST_DEFECT_WORTH_CORRECTING`: the macOS physical-path comparison in
  `auditEmbeddedRepositories.mjs`; fixed in this cleanup. Its focused
  embedded-repository and backup-completeness selection now passes **20/20**.
- `REQUIRES_BOUNDED_DIAGNOSIS`: invalid-date RangeErrors and any residual
  failure that remains after supplying the intended synthetic fixture and
  environment. No product defect is inferred from the broad run.

No private Founder fixture was fabricated, copied, or mutated.

## Bounded dead-code/reference audit

No tracked runtime code was confidently proven dead enough to remove safely.
The combined-cutover, recovery, migration, ngrok, Windows, Evidence,
notification, and Logger paths all retain source, test, package, manifest, or
recovery-document references. Runtime-impacting deletion was therefore
deferred.

Confidently dead generated/source artifacts were limited to the three
zero-byte files and the exact caches listed above. Deprecated or potentially
historical runtime code remains `DEFERRED_UNCERTAIN_CODE` for a separately
scoped product/reference audit.

## Safety record

- Remote branches deleted: **NO**
- Xcode archives deleted: **NO**
- Production data mutated: **NO**
- Production schema mutated: **NO**
- Migration ledger mutated: **NO**
- Deployment performed: **NO**
- Build bumped: **NO**
- TestFlight uploaded: **NO**
- Product semantics changed: **NO**
- Incremental recurring cost: **$0**
- Confidence V3 touched: **NO**
- Narrative V3 touched: **NO**
- HealthKit behavior touched: **NO**

## Founder decisions still required

1. Publish a durable remote branch or tag for Native Build 40.
2. Approve or reject the 10 local and 22 remote branch-pruning proposals.
3. Choose retention for 17 older Xcode archives; no archive is pre-authorized
   for deletion by this audit.
4. Decide whether the obvious `/server` path should be advanced to the current
   server authority and the nested `.tmp` server worktree later retired.
5. Decide when historical ngrok, Windows-primary, migration/cutover, and
   one-off forensic tooling may move to an explicit archive or be removed.
6. Decide whether to prune Xcode DerivedData/Simulator/device-support state in
   a separate Native disk-cleanup pass.

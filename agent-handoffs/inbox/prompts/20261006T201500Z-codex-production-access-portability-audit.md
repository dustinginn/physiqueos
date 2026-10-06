PhysiqueOS operational access portability audit — Mac + PC parity

Continue in this current Codex conversation and current provided work environment.

Do NOT create or delegate to sub-chats, child tasks, additional Codex sessions, or additional worktrees.

TASK TYPE

READ-ONLY RESEARCH / OPERATIONAL AUDIT ONLY.

Do not modify DigitalOcean credentials.
Do not log in interactively.
Do not copy tokens between machines.
Do not change production.
Do not deploy.
Do not change the current progression candidate.

CONTEXT

PhysiqueOS already has an approved PC production read-only mechanism documented in:
agent-handoffs/PRODUCTION_READONLY_ACCESS.md

Known PC pattern:
C:\Users\dusti\Documents\GitHub\physiqueos
runner:
.tmp/digitalocean/run-app-console-context-gzip-source-on-open.mjs
saved doctl context:
physiqueos-final-cutover-config

The runner executes bounded Node inside the DigitalOcean App Platform production component and consumes existing PHYSIQUEOS_DATABASE_URL/CA bindings internally.

Database credentials must never be pasted, printed, exported, stored in .env/source/history, manually decrypted, or copied between hosts.

Every SQL audit requires:
BEGIN READ ONLY / REPEATABLE READ READ ONLY as appropriate;
verify transaction_read_only = on;
bounded owner-scoped SELECTs;
explicit rollback;
sanitized output.

Current problem:
a Mac-hosted Codex progression deployment-readiness task stopped because the runbook still declares Founder-data production reads PC-only, even though we want authorized Codex/Claude sessions on either authorized Mac or PC to have equivalent safe operational capability.

GOAL

Determine exactly what is missing to make the established production read-only mechanism portable across authorized Mac and PC hosts without weakening safety.

Do not implement the remediation yet.

AUDIT 1 — REPOSITORY VS MACHINE-LOCAL COMPONENTS

Inventory the existing PC mechanism and classify each dependency:

A. committed/repository-owned;
B. generated but reproducible;
C. .tmp/machine-local;
D. DigitalOcean account/context state;
E. OS credential/keychain state;
F. shell/runtime dependency;
G. host-specific path/PowerShell assumption;
H. security boundary/documentation-only restriction.

Inspect:
- PRODUCTION_READONLY_ACCESS.md;
- runner source;
- helper scripts;
- doctl wrappers;
- app-console helpers;
- saved-context assumptions;
- gzip/base64 payload logic;
- Node requirements;
- PowerShell-specific invocation;
- macOS equivalents already present;
- deployment tooling that solves similar portability problems;
- Claude Remote Control/Codex host environment assumptions.

Do not expose secrets while inspecting configuration.

AUDIT 2 — CURRENT MAC CAPABILITY

Without authenticating or changing anything, determine what is already available on this Mac:

- doctl installed/version;
- existing named contexts, but NEVER print token values;
- whether physiqueos-final-cutover-config exists;
- whether it can perform harmless non-data account/app metadata calls;
- Node version;
- runner/helper availability;
- path compatibility;
- repository state;
- whether production console execution itself is technically available;
- whether the only blocker is policy/runbook;
- whether control-plane auth is absent;
- whether interactive login/device authorization would be required.

If a harmless auth check would expose no Founder data and uses an already-existing credential, it may be run.
Do not trigger a new login/authorization prompt.
Do not modify contexts.

AUDIT 3 — CLAUDE VS CODEX ACCESS MODEL

Determine whether any difference exists between:
- Codex on Mac;
- Claude Remote Control on Mac;
- Codex on PC;
- Claude on PC;

with respect to:
- local executable access;
- repository runner access;
- doctl context visibility;
- secure credential storage;
- environment inheritance;
- worktree isolation.

Goal:
make capability depend on authorized HOST + explicit task authorization, not on chat/worktree.

Do not grant new permissions in this task.

AUDIT 4 — CROSS-PLATFORM DESIGN

Recommend the safest target architecture.

Preferred direction:
- promote the runner/safety wrapper from PC-specific .tmp machinery into a repository-owned cross-platform operational tool if appropriate;
- one Node implementation;
- thin shell/PowerShell entry points only if needed;
- current app/component discovery rather than stale hard-coded IDs;
- expected source/deployment verification;
- strict read-only transaction assertion;
- bounded owner-scope requirement;
- sanitized output;
- explicit rollback;
- no DB credentials outside production component;
- local DigitalOcean control-plane credential stored through each host's normal secure mechanism;
- read and deploy capabilities remain separately authorized;
- no automatic deploy permission from read access.

Assess whether repo ownership creates any new risk and how to keep secrets out of source.

AUDIT 5 — SELF-TEST / DOCTOR

Design a non-sensitive command such as:
production-access doctor

It should verify, without reading Founder records:
- required binaries;
- current host support;
- DigitalOcean context existence/auth health;
- current app/component discovery;
- console access;
- runtime binding presence without printing values;
- ability to enter a read-only transaction;
- transaction_read_only = on;
- rollback;
- public health/source authority.

It must not emit credentials or Founder data.

AUDIT 6 — USER ACTIONS REQUIRED

Produce an exact checklist split into:

Can Codex implement later without Founder interaction.

Requires Founder at Mac Terminal.

Requires DigitalOcean web-console/account action.

Requires one-time macOS credential/keychain authorization.

Requires PC action.

Ideally minimize all manual steps.

If the Mac merely needs an authorized doctl context, identify the safest supported way to establish it later WITHOUT copying the PC token manually.

Do not perform those steps now.

AUDIT 7 — RUNBOOK CHANGES

Recommend how PRODUCTION_READONLY_ACCESS.md should change from PC-only to authorized-host semantics.

Define:
- authorized host;
- required doctor pass;
- task-level authorization;
- read-only SQL invariants;
- stop conditions;
- Claude/Codex usage;
- no secret portability;
- revocation/rotation considerations.

OUTPUT

Publish a main-visible report-only handoff.

Report:
- exact current PC architecture;
- exact Mac gap(s);
- whether Mac is technically ready already;
- whether DO/account work is required;
- whether Mac Terminal work is required;
- whether user interaction is required;
- proposed repo/tool changes;
- security analysis;
- doctor design;
- exact remediation sequence;
- estimated effort;
- what can be completed remotely vs must wait for Founder Mac access.

Do not implement.

Status:
Production access portability audit complete — remediation plan ready.

STOP.

END TASK.
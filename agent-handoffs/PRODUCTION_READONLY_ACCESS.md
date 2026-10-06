# PhysiqueOS production read-only access for agents

## Purpose

This is the standing discovery pointer for Claude and Codex when an explicitly authorized PhysiqueOS task needs bounded production inspection. It documents the approved repository-owned path. It does not grant production access or production-write authority and contains no credentials.

## Authorized-host requirement

An **authorized host** is a Founder-controlled Mac or PC with all of the following:

1. a separately authenticated least-privilege doctl context named `physiqueos-final-cutover-config`;
2. the repo-owned runner at reviewed repository authority;
3. a passing `local` and `control-plane` production-access doctor;
4. a recorded zero-data `console` doctor acceptance;
5. explicit task-level authorization for the production inspection being attempted.

Host authorization is necessary but never sufficient. A clone, chat, Remote Control session, worktree, or cloud-hosted session is not authorized merely because it can read this repository. Credentials never move with Git, chat, Remote Control, reports, or worktrees.

## Repository-owned path

Primary runner:

`scripts/operations/runAppConsoleContextGzipSourceOnOpen.mjs`

Guarded file wrapper:

`scripts/operations/runAppConsoleContextGzipFile.mjs`

Shared safety primitives:

`scripts/operations/productionAccessSafety.mjs`

Doctor:

```text
npm run ops:production-access -- local
npm run ops:production-access -- control-plane --expected-sha <verified-production-sha>
npm run ops:production-access -- console --expected-sha <verified-production-sha>
```

`console` is never implied by a prior local/control-plane pass. It needs separate explicit authorization. A doctor pass proves host plumbing and the transaction fence, not the safety of an arbitrary task payload.

The runner is one Node implementation supporting Windows, macOS, and Linux doctl config discovery. It does not require PowerShell, a local PostgreSQL client, a local database credential, or a local raw TTY.

## Credential boundary

Each host has its own provider-issued least-privilege context. Never copy a token or doctl config between hosts. Never pass a PAT/token as a CLI argument or environment-variable shortcut.

The read context must have only the approved App Platform read/console scopes. It must remain separate from deployment, migration, database-credential, and other write contexts. The tooling accepts only `physiqueos-final-cutover-config` and never falls back to another context after failure.

Never paste, print, export, decrypt, log, commit, or store production database credentials, CA material, DigitalOcean tokens, or secret environment values. The production component consumes its existing database bindings internally; only binding-presence booleans may be reported.

## Before every real audit

The task must explicitly authorize production inspection and define the exact owner/data bounds. Then:

1. independently reverify the intended application, active deployment, component, Web SHA, worker SHA, and public health/source identity;
2. require Web/worker agreement and no in-progress deployment;
3. verify runtime `PHYSIQUEOS_GIT_SHA` before database access;
4. require the exact approved owner scope for Founder-data audits;
5. use only the repo-owned reviewed runner/wrapper and shared safety primitives;
6. keep output schema-bounded and sanitized.

Historical application, deployment, component, SHA, schema, and owner values are hints only. Never treat them as current authority.

## Mandatory SQL safety contract

Every production SQL audit must:

1. open one bounded PostgreSQL connection with a task-specific application name and statement timeout;
2. execute `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`;
3. execute `SHOW transaction_read_only` and require `on` before substantive queries;
4. use parameterized, bounded, owner-scoped `SELECT` operations only;
5. avoid side-effecting functions invoked through `SELECT`;
6. avoid bulk exports and unrelated records;
7. execute an explicit `ROLLBACK` on success and attempt rollback in `finally`;
8. release the connection and close the pool;
9. emit only sanitized schema-bounded output after rollback;
10. emit the unique success marker exactly once, only after rollback.

The DigitalOcean console transport is powerful and is **not** database-read-only. The runtime component has write-capable bindings. Transaction fencing, owner scoping, reviewed payload code, bounded output, and explicit task authorization remain mandatory.

## PTY output acceptance boundary

DigitalOcean supplies a provider-owned interactive PTY rather than a raw exec stream. Bytes outside the exact task frame can vary by provider/host and are not audit authority. The shared safety parser must discard that outside material after enforcing the total-output bound and raw credential-shape scan; it must never parse it as JSON or return it in the decoded report.

Audit success is determined only by exactly one canonical length-declared base64 frame, the schema-bounded decoded report, exactly one post-rollback success marker, exactly one later zero remote-exit control, and successful transport closure. Additional sentinel/marker/exit tokens, explicit `PHYSIQUEOS_*FAILED` controls, invalid ordering, malformed/truncated frames, credential-shaped output, or size-limit violations fail closed. Prompt/banner/command-echo classification may be retained for sanitized diagnostics, but it is not an authorization or acceptance control.

## Stop conditions

Stop immediately, without retrying another context, PAT, component, console mechanism, or credential, on:

- failed doctor or unsupported host;
- HTTP 401 or 403;
- missing/ambiguous doctl config or context;
- wrong application/component or a changing/inactive deployment;
- Web/worker source mismatch or runtime/control-plane SHA drift;
- invalid WSS URL, WebSocket failure, timeout, truncation, or unexpected closure;
- missing database binding or owner mismatch;
- `transaction_read_only` not equal to `on`;
- non-SELECT requirement, SQL error, rollback/resource-close failure;
- credential-shaped or oversized output;
- malformed/duplicate frame controls, reserved-marker ambiguity, explicit failure controls, or invalid marker/exit ordering;
- missing/duplicate success marker;
- any requirement for mutation.

Read-only access is not permission to repair, replay, confirm, dismiss, enqueue, regenerate, deploy, alter outbox state, change evidence, or perform any production write. Mutation requires separate explicit authorization and a separate guarded path.

## Claude and Codex host behavior

Claude and Codex use the same repo-owned command on the selected local authorized host, subject to that agent's filesystem/network approval policy. Local executable/PATH inheritance may differ between GUI and terminal sessions; use the doctor rather than improvising a credential path.

A worktree carries repository code, not the host's credential. A host credential does not authorize every chat or task. Cloud-hosted sessions remain unauthorized unless a separate Founder-approved host and credential design is established.

## Issuance, revocation, and rotation

- Issue a distinct least-privilege PAT per authorized host through the provider account.
- Authenticate it only at that host's interactive terminal with `doctl auth init --context physiqueos-final-cutover-config`.
- Never copy another host's token/config.
- Record scope names, host, owner, issuance/revocation responsibility, and acceptance result—never token contents.
- Rotate only on expiry, compromise evidence, scope correction, or host retirement; then rerun all doctor stages.
- A failed context is a stop condition, not permission to use a deploy/migration context.

## Agent startup rule

Read this file before attempting production access. The current GitHub task may narrow or forbid access and always wins. If task authority is missing, continue source/local analysis, mark production-dependent conclusions unproven, and stop the affected diagnosis.

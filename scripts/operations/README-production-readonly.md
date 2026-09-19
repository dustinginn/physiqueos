# PhysiqueOS production read-only console audits

These tools transport a task-specific Node.js audit program into the existing PhysiqueOS DigitalOcean App Platform `web` component. They do not make the transported program or its SQL read-only. Every operator and every task payload must independently enforce the safety contract below.

## Tools

Primary runner argument contract:

```text
node scripts/operations/runAppConsoleContextGzipSourceOnOpen.mjs <saved-context> <app-id> <component-name> <gzip-base64-node-source> [--doctl-config <path>]
```

File wrapper argument contract:

```text
node scripts/operations/runAppConsoleContextGzipFile.mjs <saved-context> <app-id> <component-name> <task-node-file> [--doctl-config <path>]
```

The primary runner reads only the explicitly named doctl context, requests the App Platform component exec endpoint, requires a `wss://` URL, and drives the remote PTY over WebSocket. It does not invoke `doctl apps console` and does not need a local raw TTY or pseudo-terminal.

The file wrapper gzip-compresses and base64-encodes the task program. The remote shell disables echo and runs the decoded program with Node. The primary runner requires a zero remote process status. The wrapper additionally requires a unique, exact success marker declared by the task program:

```js
// PHYSIQUEOS_AUDIT_SUCCESS_MARKER: PHYSIQUEOS_EXAMPLE_READONLY_SUCCESS_20260919
```

The task must emit that exact marker as a standalone line only after its explicit rollback succeeds. A normal WebSocket closure, zero local process status, or partial output is not audit success. Missing or duplicate markers, non-zero remote status, stderr, timeout, output truncation, or unexpected closure fail closed.

## doctl configuration discovery

The runner supports:

- Windows: `%APPDATA%\doctl\config.yaml` and `%USERPROFILE%\AppData\Roaming\doctl\config.yaml`
- macOS: `$HOME/Library/Application Support/doctl/config.yaml`
- macOS/Linux alternative: `$XDG_CONFIG_HOME/doctl/config.yaml` or `$HOME/.config/doctl/config.yaml`
- Explicit path: `--doctl-config <path>`

If automatic discovery finds no configuration or more than one distinct existing candidate, it stops. Use the explicit non-secret path option to resolve ambiguity. The runner never accepts a PAT as an argument or environment variable, never copies contexts, and never prints configuration or token values.

## Mac bootstrap

Required locally:

- Node.js 24.x
- current `doctl`
- Git
- the PhysiqueOS repository and installed package dependencies
- outbound HTTPS to the DigitalOcean API
- outbound WSS to the returned App Platform exec endpoint
- a separately authenticated context named `physiqueos-final-cutover-config`

No local PostgreSQL client, production database credential, database CA, PowerShell, local raw TTY, or deployment credential is required.

The Mac PAT must have exactly the minimum App Platform read/console scopes:

- `app:access_console`
- `app:read`
- `regions:read`
- `sizes:read`
- `actions:read`

It must not include `app:update`, `app:create`, `app:delete`, `api:write`, `database:view_credentials`, or another unnecessary write/credential scope.

Create the context locally from an interactive Mac terminal:

```sh
doctl auth init --context physiqueos-final-cutover-config
```

Enter the PAT only at doctl's interactive prompt. Never put it in a command argument, environment variable, chat, source, Git, `.env`, documentation, or an audit payload. Do not copy the Windows doctl configuration to the Mac.

Before opening a console, use that exact context and `--http-retry-max 0` to read and sanitize the application/deployment identity. Verify the intended application, component, active deployment, Web SHA, and worker SHA. Never print the full app spec or secret environment values.

## Mandatory task-payload safety contract

Every production audit payload must:

1. Compare the independently established control-plane source SHA with runtime `PHYSIQUEOS_GIT_SHA` before database access.
2. Require `PHYSIQUEOS_CANONICAL_OWNER_USER_ID === "user_founder_001"`.
3. Consume `PHYSIQUEOS_DATABASE_URL` and the configured CA only inside the App Platform component.
4. Never print, return, export, or persist either database binding.
5. Open one bounded PostgreSQL connection with a task-specific application name and statement timeout.
6. Execute `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`.
7. Execute `SHOW transaction_read_only` and require `on` before substantive queries.
8. Use only parameterized, bounded, Founder-owner-scoped `SELECT` statements.
9. Never invoke a side-effecting function through `SELECT`.
10. Execute an explicit `ROLLBACK` on success.
11. Attempt rollback in `finally` whenever a transaction may still be open.
12. Release the connection and close the pool.
13. Emit only bounded, sanitized results.
14. Emit the declared unique success marker only after successful rollback.

A task payload must not execute `INSERT`, `UPDATE`, `DELETE`, `UPSERT`, DDL, schema changes, advisory mutation, repair, reconciliation, command replay, canonical disposition, fixture import, PI/OpenAI execution, or another mutation.

The DigitalOcean `app:access_console` scope is powerful: the component already owns its runtime database bindings. The scope does not itself enforce read-only SQL. Transaction fencing, owner scoping, source authority, reviewed code, and rollback are mandatory.

## Stop and no-retry conditions

Stop immediately, without trying another context, PAT, component, console mechanism, or credential, on:

- HTTP 401
- HTTP 403
- missing or ambiguous doctl configuration
- missing named context
- scope mismatch
- wrong application
- wrong component
- inactive or changing deployment
- Web/worker source mismatch
- runtime/control-plane SHA mismatch
- invalid WebSocket URL
- WebSocket failure
- unexpected closure
- timeout or truncated output
- missing database binding
- Founder-owner mismatch
- `transaction_read_only` not equal to `on`
- SQL error
- rollback failure
- missing or duplicate success marker
- unexpected mutation capability
- platform/tool safety restriction

Never automatically switch to a deployment context, a different audit context, an alternate PAT, direct database access, or `doctl apps console`.

## Zero-write equivalence acceptance

Mac enablement is complete only after a separately authorized, zero-write acceptance proves in order:

1. Repository and runner authority are exact.
2. The named context is present with the approved scope record.
3. Application ID and `web` component are independently reverified.
4. Current Web and worker source SHAs are read and agree.
5. The component console opens through this runner.
6. Runtime `PHYSIQUEOS_GIT_SHA` equals the control-plane SHA.
7. No production binding is printed or exported.
8. A bounded payload begins `REPEATABLE READ READ ONLY`.
9. `transaction_read_only` is `on`.
10. One harmless, parameterized, bounded query for `user_founder_001` succeeds.
11. The transaction explicitly rolls back.
12. The unique success marker is observed exactly once.
13. The console closes successfully.
14. Follow-up control-plane and health reads show no production state change.
15. The PAT scope record proves `app:update` and other write scopes are absent; do not attempt a test update.

Production investigation defaults to this read-only authority. Deployment always requires a separate context and explicit Founder authorization.

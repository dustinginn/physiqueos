# Production access portability audit — Mac + PC parity

Task: `codex-production-access-portability-audit-20261006`

Generated: 2026-10-06T20:09:28Z

Status: **Production access portability audit complete — remediation plan ready.**

Repository: `dustinginn/physiqueos`

## Executive result

The approved PhysiqueOS production-read path is host-specific today for **distribution and policy reasons, not because the underlying runner is Windows-only**.

- `origin/main` documents only the Founder's PC path and points to an ignored `.tmp` file.
- The authoritative runner, wrapper, tests, dependency change, and cross-platform contract exist only in historical commit `4025f17560e926b7e33a1cad6757a06716b16d24` on `origin/codex/production-readonly-mac-bootstrap-handoff`.
- The runner itself already supports Windows, macOS, and Linux doctl configuration discovery and does not require PowerShell, a local PTY, a local PostgreSQL client, or local database credentials.
- This Mac already has the named least-privilege context, working control-plane authorization, Node, doctl, and an ignored byte-identical runner copy.
- A main-visible 2026-10-02 acceptance report proves that this same Mac/context/runner opened the production `web` console and ran a constant-plus-Node-version smoke payload with zero SQL and zero production-data reads. No new console session was opened in this audit.

Therefore, the Mac is **technically capable and already provider-authorized**. The present blocker is the standing PC-only runbook plus the absence of durable tooling on `main`, not missing DigitalOcean authentication. No credential rotation, new PAT, interactive login, or Founder Mac Terminal action is currently required.

The immediate remediation should be a reportable repository change that promotes and hardens the established implementation, adds a non-sensitive doctor, and changes the runbook from “PC-only” to “authorized host + explicit task authorization.” It must not grant deploy authority or copy credentials between hosts.

## Evidence and boundaries

This was research only. No credentials were changed or printed; no login prompt was triggered; no App Platform console was opened; no SQL ran; no Founder record was read; no deployment or production mutation occurred.

Evidence used:

- current `origin/main` and its handoff/report history;
- the authoritative portable implementation at commit `4025f175`;
- local binary paths/versions, named-context presence, and config-file metadata only;
- harmless DigitalOcean app/instance metadata reads through the existing approved context;
- official [DigitalOcean `doctl auth init` documentation](https://docs.digitalocean.com/reference/doctl/reference/auth/init/), [App Platform console documentation](https://docs.digitalocean.com/reference/doctl/reference/apps/console/), and [`app:access_console` permission documentation](https://docs.digitalocean.com/platform/teams/roles/permissions/app/access_console/);
- official [OpenAI self-hosted environment documentation](https://developers.openai.com/api/docs/guides/agents-api/environments/self-hosted) and [Claude Code Desktop documentation](https://code.claude.com/docs/en/desktop) for host/environment behavior.

## 1. Exact current architecture

### Durable authority on `main`

`origin/main` contains:

- `agent-handoffs/PRODUCTION_READONLY_ACCESS.md` — safety rules and a PC-only discovery pointer;
- DigitalOcean infrastructure documentation/template/renderer under `infra/digitalocean/`;
- historical reports proving the bounded audit pattern and the 2026-10-02 Mac acceptance.

`origin/main` does **not** contain the production-read runner, its file wrapper, its tests, or its `js-yaml` dependency.

### Authoritative implementation off main

Commit `4025f175` adds:

- `scripts/operations/runAppConsoleContextGzipSourceOnOpen.mjs`;
- `scripts/operations/runAppConsoleContextGzipFile.mjs`;
- `scripts/operations/productionReadonlyRunner.test.mjs`;
- `scripts/operations/README-production-readonly.md`;
- `js-yaml@^4.1.0` in `package.json`/lockfile.

The primary runner:

1. discovers the per-user doctl config cross-platform or accepts an explicit non-secret config path;
2. reads only the exact named context in memory;
3. requests a DigitalOcean App Platform exec URL;
4. requires `wss://`;
5. opens the remote PTY over WebSocket;
6. disables echo and runs gzip/base64-decoded Node source inside the selected component;
7. bounds timeout/output and requires exactly one zero remote exit status.

The file wrapper requires one declared success marker, zero runner stderr, a zero exit, and exactly one standalone marker. Tests cover Windows/macOS config discovery, exact-context selection, non-disclosure of token text, WSS validation, timeout/error/closure behavior, remote non-zero exit, and success-marker failure modes.

Important limitation: the transport can run arbitrary Node inside the component. It does not parse SQL or make a payload read-only. Safety currently comes from reviewed task code, current authority checks, a `REPEATABLE READ READ ONLY` transaction, `transaction_read_only = on`, bounded parameterized owner-scoped `SELECT`s, explicit rollback, sanitized output, and task authorization.

### Machine-local PC layer

The standing main runbook points agents to:

`C:\Users\dusti\Documents\GitHub\physiqueos\.tmp\digitalocean\run-app-console-context-gzip-source-on-open.mjs`

That file is ignored by `.gitignore`. A PC must therefore retain or reconstruct a particular scratch file in a particular checkout. The saved doctl context is also per-user machine state. The PC path is a discovery convention, not a requirement of the Node runner.

## 2. Dependency classification

| Class | Current dependency | Portability implication |
|---|---|---|
| A. Repository-owned | Main safety pointer and historical reports; portable runner/wrapper/tests/README and `js-yaml` change at `4025f175` | Implementation is Git-reproducible but not present on current `main` |
| B. Generated/reproducible | Task-specific Node audit source; gzip/base64 payload; current app/deployment/component/SHA discovery; unique success marker | Must be regenerated from reviewed source and current authority, never treated as durable credential state |
| C. `.tmp`/machine-local | PC runner copy, this Mac's restored runner, historical task payloads/helpers | Can disappear during cleanup/restart and does not follow a clone/worktree |
| D. DigitalOcean state | Per-host `physiqueos-final-cutover-config` context, PAT/team role/scopes, current app/deployment/component | Must be established independently on each authorized host; no token portability |
| E. OS credential state | doctl config under the user's application-data directory, mode `0600` on this Mac | Current doctl path is a protected per-user YAML file, not macOS Keychain; never copy or inspect token values |
| F. Runtime/shell | Node with WebSocket support, current/tested doctl, Git, installed packages, outbound HTTPS/WSS; remote component has Node, `gzip`, and `base64` | One Node implementation is sufficient; no local PostgreSQL client or DB credential is needed |
| G. Host-specific assumptions | PC-only absolute path in main docs; legacy PowerShell deployment tooling elsewhere in repo | The production-read runner itself has no PowerShell dependency and already resolves Windows/macOS/Linux config paths |
| H. Security/docs boundary | Explicit task authorization; owner scoping; transaction fence; rollback; sanitized output; stop-on-mismatch rules; separate deploy context | Main currently converts this into a PC-only policy even though Mac acceptance already exists |

## 3. Current Mac capability

Observed without reading token contents:

- macOS Darwin 25.6.0, arm64, shell `/bin/zsh`;
- Node `v22.23.2`, npm `10.9.8`;
- doctl `1.168.0-release` at `/Users/dustinginn/.local/bin/doctl`;
- `gzip`, `base64`, and OpenSSL present; PowerShell absent and unnecessary;
- doctl config at `~/Library/Application Support/doctl/config.yaml`, owned by the current user with mode `0600`;
- named contexts include `physiqueos-final-cutover-config`; context names only were listed;
- ignored local runner at `.tmp/digitalocean/run-app-console-context-gzip-source-on-open.mjs`;
- local runner SHA-256 `aa2d3247917184199b718d5e7558a74cc8dcf46bf34713b3f73b8e506816a608`, byte-identical to the authoritative `4025f175` source;
- current control-plane read succeeded for app `bf57cf56-48cc-4cd6-90e4-a23ee5381741`, active deployment `6fa4e887-8849-450b-b068-5bdb11b90009`, with current `web` service and `worker` instances;
- no in-progress deployment was reported.

The 2026-10-02 main-visible report `20261002T025604Z-mac-do-console-pat-maintenance-final.md` already proves this Mac's existing context has working `app:access_console`: the approved runner opened `web`, printed only a constant and remote Node version, and exited successfully. It also records that the PAT was not broadened or rotated and that no further Founder credential work was required.

Conclusion: **the Mac is already technically ready at the credential/transport level.** Its Node 22 runtime successfully ran the accepted runner even though the historical README specified Node 24. Remediation should either set the documented minimum to the actually tested feature floor or standardize both hosts on Node 24; this is a tooling policy decision, not a current authentication blocker.

## 4. Why capability varies by agent/session

Capability follows the selected **host environment**, not the chat identity:

| Session | Executables/files | doctl context | Main portability gap |
|---|---|---|---|
| Codex on Mac | Mac filesystem and binaries, subject to Codex sandbox/approval policy | Visible only if the session is allowed to read the current user's doctl config and use network | Runner absent from main; PC-only runbook stops otherwise capable sessions |
| Claude local/Remote Control on Mac | The local Claude process remains on the Mac; Desktop PATH/environment inheritance may differ from an interactive shell | Same per-user Mac context when local permissions and paths allow it | Use absolute/tool-resolved paths and a doctor; Remote Control does not move credentials to the controller |
| Codex on PC | PC filesystem/binaries, subject to its sandbox/approval policy | PC user's independently authenticated context | Current runbook happens to point here, but `.tmp` can disappear and is checkout-specific |
| Claude on PC | Local PC session uses PC files/executables | PC user's independently authenticated context | Same `.tmp` and environment-discovery fragility |

A worktree changes repository files, not the host's per-user doctl configuration. Conversely, a repo-owned runner follows all clones/worktrees after update but does not grant credentials. Cloud-hosted sessions are not equivalent authorized hosts merely because they can clone the repository; they have no approved local context and must not receive a copied PAT.

## 5. Recommended target architecture

### Stage 1 — restore established cross-host parity

1. Port the four operational files and the explicit `js-yaml` dependency from `4025f175` onto current `main`; re-review rather than blindly cherry-pick because main has advanced.
2. Expose one Node entry point such as `npm run production-access -- doctor ...`; do not add PowerShell-specific logic unless only as a thin argument-forwarding convenience.
3. Discover current app, component, active deployment, and Web/worker SHAs with the exact read context; never rely on stale IDs from a handoff.
4. Separate commands into `doctor local`, `doctor control-plane`, and explicitly authorized `doctor console` so harmless checks do not silently open a console.
5. Require audited task payloads to use a shared safety library for exact runtime SHA, canonical owner scope, one bounded connection, statement timeout, read-only transaction assertion, parameterized bounded selects, rollback/finally, and schema-bounded sanitized output.
6. Fail closed on any extra stdout/stderr, credential-shaped output, unexpected field, identity mismatch, 401/403, retry temptation, or missing/duplicate post-rollback marker.
7. Keep the read PAT per host in the normal doctl config, and keep deploy/migration contexts separate and unavailable to the read command. The tool must never accept a PAT argument or environment variable.
8. Update the standing runbook to authorized-host semantics only after tests and the doctor acceptance pass.

Repository ownership makes the transport easier to discover and review but does not place a secret in Git or grant access. It does modestly increase the visibility of a powerful console mechanism. Mitigate that with explicit context allowlisting, no deploy-context fallback, a wrapper-first documented interface, tests, bounded output, task authorization, and code review. Do not describe `app:access_console` as database-read-only—it is not.

### Stage 2 — stronger enforcement, separately authorized

The existing component owns write-capable runtime database bindings, so a malicious or defective console payload could bypass the transaction convention. The strongest design is a dedicated audit component/local broker backed by a database role that is read-only at the database level and exposes only typed, bounded diagnostics. That would turn policy into an infrastructure boundary, but it requires provider/database design, a deployment, cost/security review, and Founder authorization. It is not required to restore the already-accepted Mac/PC parity and must not be bundled into the Stage 1 documentation change without separate approval.

## 6. `production-access doctor` design

The doctor should emit one bounded JSON document plus an exact marker and never print environment values, token text, full provider specs, or Founder data.

### `doctor local` — no network

- identify OS/architecture and repository root;
- verify Node/doctl/Git versions and WebSocket support;
- verify runner/wrapper/test file hashes against the current commit;
- resolve exactly one doctl config path;
- verify owner-only file permissions and exact context-name presence without reading/printing token values;
- verify required package resolution;
- reject deploy/migration contexts and ambiguous config paths.

### `doctor control-plane` — harmless metadata only

- use the explicit approved context and retries disabled;
- discover the intended app and current `web`/`worker` components;
- require an active, stable deployment and Web/worker source agreement;
- compare public health/source authority without printing specs or environment data;
- stop on 401/403 or ambiguity; never try another context.

### `doctor console` — separate explicit authorization

- open only the verified current component;
- compare runtime `PHYSIQUEOS_GIT_SHA` with control-plane authority;
- report only booleans for required binding presence;
- open one bounded connection and execute `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`;
- require `SHOW transaction_read_only = on`;
- execute only `SELECT 1` (no Founder/owner table query is needed for a doctor);
- explicitly `ROLLBACK`, close resources, then emit the exact marker once;
- recheck control-plane identity/public health after closure.

Passing the doctor proves host plumbing and the transaction fence. It does not authorize a task or prove an arbitrary audit payload safe.

## 7. Exact remediation checklist

### Codex can implement later without Founder interaction

- port and re-review `4025f175` onto current main;
- add package scripts, shared payload safety primitives, redaction/output-schema guards, and the three doctor modes;
- add Windows/macOS/Linux path, version, context-name, no-secret-output, authority, rollback, and failure-path tests;
- rewrite `PRODUCTION_READONLY_ACCESS.md` as proposed below;
- run local tests and non-sensitive control-plane doctor checks on already-authorized hosts;
- publish a report-only acceptance package. Console-doctor execution still needs explicit task authorization.

Estimated engineering effort: **0.5–1 day** for the Stage 1 port, hardening, tests, doctor, and docs; **15–30 minutes per already-authorized host** for acceptance. Stage 2 is a separate **1–2 day** design/implementation effort plus provider review.

### Requires Founder at Mac Terminal

**Nothing for the current Mac credential.** The context and accepted console capability already exist. A later operator may choose to standardize Node to 24 or update doctl, but neither is evidence of a current auth gap. If Desktop environment discovery fails, the Founder may need to launch from a shell or configure the documented absolute binary paths; do not reauthenticate as the first response.

### Requires DigitalOcean web/account action

**Nothing now.** Existing evidence says the Mac PAT is least-privilege and accepted; preserve it. Provider action is needed only if the context later returns 401/403, its recorded scopes cannot be attested, the host is replaced, or Stage 2 is approved.

For a genuinely new authorized host, the Founder should create a distinct host-specific PAT with only `app:access_console`, `app:read`, `regions:read`, `sizes:read`, and `actions:read`, excluding app write/delete/create, API write, database credential view, deploy, and migration capabilities. Never reuse or copy the PC token.

### Requires one-time macOS credential/keychain authorization

**Nothing now.** Current doctl stores its context in the protected per-user config file, not Keychain. If a future design explicitly introduces a Keychain-backed broker, its one-time Keychain prompt is Founder-only. Do not claim Keychain protection for the current YAML-based mechanism.

### Requires PC action

- after Stage 1 merges, update the normal PC checkout and run `doctor local`/`control-plane`;
- run the authorized zero-data `doctor console` once and compare the structured result with Mac;
- retain the independent PC context; do not copy either host's config;
- delete/retire the ignored `.tmp` runner only after the repo-owned command is accepted and rollback instructions are recorded.

### If a new Mac/host context is ever required

1. Founder creates a distinct least-privilege PAT in the DigitalOcean account UI.
2. At that host's own terminal, run `doctl auth init --context physiqueos-final-cutover-config`.
3. Enter the PAT only at doctl's interactive prompt.
4. Run local/control-plane doctor, then a separately authorized zero-data console doctor.
5. Record only scope names, tool versions, commit/hash, structured pass/fail, and revocation owner—never the token or config contents.

This is the supported safe bootstrap. Copying the PC token/config is prohibited.

## 8. Runbook rewrite

Replace “Founder's PC” with an **authorized host** definition:

> An authorized host is a Founder-controlled Mac or PC with a separately authenticated, least-privilege `physiqueos-final-cutover-config` context; the repo-owned runner at the reviewed main commit; a passing local and control-plane doctor; a recorded zero-data console acceptance; and current task-level authorization.

The runbook should state:

- host authorization is necessary but never sufficient for a production audit;
- each task must explicitly authorize production inspection and define its data/owner bounds;
- all existing SHA, owner, read-only transaction, select-only, rollback, sanitation, and marker invariants remain mandatory;
- Claude and Codex use the same repo command on the selected local host, subject to that agent's filesystem/network approval policy;
- repo/worktree presence does not imply credential presence or authorization;
- credentials never move with Git, chat, Remote Control, reports, or worktrees;
- stop on failed doctor, 401/403, identity drift, missing bindings, unexpected output, transaction fence failure, rollback failure, or any need to mutate;
- never fall back to a deploy/migration context or another PAT;
- maintain separate per-host issuance/revocation records and rotate only on evidence/expiry/host retirement, then rerun acceptance;
- the `doctor console` and every real audit require explicit authorization even when prior acceptance exists.

## Recommendation

**REMEDIATE, then enable authorized-host semantics.** The current Mac does not need new provider or credential work. Port and harden the already-accepted implementation onto main, add the doctor, update the runbook, and run one zero-data parity acceptance on Mac and PC. Until that change is reviewed and merged, agents must continue obeying the current PC-only standing runbook despite the Mac's proven technical capability.

Do not deploy or modify production as part of this remediation.

## Safety flags

- CONTAINS_SECRETS: NO
- CONTAINS_CREDENTIALS: NO
- CONTAINS_PRODUCTION_EXPORTS: NO
- CONTAINS_FOUNDER_EVIDENCE: NO
- SAFE_FOR_CHATGPT_RETRIEVAL: YES

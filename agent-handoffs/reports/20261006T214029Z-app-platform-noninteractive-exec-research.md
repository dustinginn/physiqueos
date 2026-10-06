# App Platform non-interactive execution research

Task: `codex-do-app-platform-noninteractive-exec-research-20261006`

Generated: 2026-10-06T21:40:29Z

Status: **Production access transport research complete — next safe path identified.**

Conclusion: **DigitalOcean App Platform does not currently expose a supported non-interactive, no-PTY, raw-command, or separated stdout/stderr exec mode for an existing running component. Do not authorize another production zero-data proof on the current PTY path yet.**

This report supersedes the transport recommendation in `agent-handoffs/reports/20261006T213343Z-outside-frame-classification-blocked.md` (`fb3ae3afb6f64223c2d3219499126a66d3c8f780`).

## Scope and unchanged state

This task was research and design only.

- Production console calls: **0**
- Founder production reads: **0**
- Production data writes: **0**
- Server deployments or app-spec mutations: **0**
- Credential changes, logins, or rotations: **0**
- Alternate DigitalOcean contexts: **0**
- Native Build 89/90 changes: **0**
- Progression candidate changes: **0**
- Additional worktrees, chats, or delegated tasks: **0**

The approved context was not used for a network console or data operation.

## Current authorities

- Research task: `694e6c7a31baaa43f0c27f42fb42676a56ed28e6`
- Operational candidate, unchanged: `ec9f28dffb48d0822849a2ecf9958b71988dd16c`
- Operational branch: `codex/production-access-portability-stage1`
- Progression candidate, unchanged and separate: `999a225a38ced9ddb16a65bbe840896472265468`
- Last verified production Server authority: `b7eb1e397f0238df9ae904fd182ddbb51602e8d8`

No new operational candidate was created because the provider exposes no supported raw-exec mode and no safe materially different PTY transport was found to prototype.

## Authoritative provider finding

### App Platform exec is a terminal console

DigitalOcean describes App Platform console access as an in-browser command-line terminal in a running component container and explicitly compares it to interactive `docker exec -it`. The documented API is a `GET` to the component `exec` endpoint and returns a console WebSocket URL. [DigitalOcean App Platform console documentation](https://docs.digitalocean.com/products/app-platform/how-to/console/)

The current App Platform API reference, generated 2026-10-06, documents only one exec query parameter, `instance_name`. Its response schema contains only `url`, described as a WebSocket for console input/output. It exposes no request body, command field, `tty=false`, `pty=false`, raw mode, shell selection, environment override, separate channel metadata, or WebSocket subprotocol selection. [DigitalOcean Apps API — Retrieve Exec URL](https://docs.digitalocean.com/reference/api/reference/apps/)

The console endpoint requires the `app:access_console` scope. There is no separate least-privilege raw-exec scope or read-only command scope. [DigitalOcean App Platform console scope](https://docs.digitalocean.com/reference/api/scopes/app/)

### Current `doctl` exposes no hidden raw mode

The current `doctl apps console` reference, generated 2026-10-06 from `doctl v1.178.0`, exposes only `--deployment` and `--instance-name`; there is no command, no-PTY, non-interactive, raw-output, no-echo, or stream-separation flag. [Current `doctl apps console` reference](https://docs.digitalocean.com/reference/doctl/reference/apps/console/)

The Mac's installed `doctl v1.168.0-release` reports the same two console-specific flags. Its global `--interactive` flag controls CLI prompting behavior; it does not change App Platform console allocation or add a remote command mode.

The current official `doctl` source was pinned at `72fb00657112ca6dd8060bcce7c3ee5a7ec579cc` for this review. `RunAppsConsole`:

1. calls `GetExecWithOpts` with deployment and instance selection only;
2. parses the returned URL;
3. opens raw local terminal input;
4. monitors terminal resize events;
5. sends only WebSocket `stdin` and `resize` operations;
6. reads a single incoming JSON `data` string.

There is no command invocation branch or non-PTY capability negotiation. [Pinned official `doctl` console implementation](https://github.com/digitalocean/doctl/blob/72fb00657112ca6dd8060bcce7c3ee5a7ec579cc/commands/apps.go#L871-L983)

The current official `godo` source was pinned at `490893bcc6760d9a64705fdd8c097e77059bbbeb`. `AppExec` contains only `URL`; `AppGetExecOptions` contains only deployment and instance names; `GetExecWithOpts` issues an HTTP `GET` and adds only `instance_name` to the query. [Pinned official `godo` App Platform client](https://github.com/digitalocean/godo/blob/490893bcc6760d9a64705fdd8c097e77059bbbeb/apps.go)

### No applicable one-shot job mechanism

App Platform jobs are app-spec components that run during deployment or on a schedule. The documented API can list, inspect, cancel, and read logs for invocations, but does not expose an endpoint to create an ad hoc invocation with an arbitrary command inside an existing service or worker instance. [DigitalOcean App Platform jobs documentation](https://docs.digitalocean.com/products/app-platform/how-to/manage-jobs/), [App specification reference](https://docs.digitalocean.com/products/app-platform/reference/app-spec/)

Adding a job or changing its command requires an app-spec update and deployment. It runs as a job component, not as a non-interactive exec inside the already-running production web component. Job output is retrieved through logs, which is not an ephemeral private result channel for Founder data.

### Adjacent DigitalOcean products do not apply

- Droplets support an SSH command option, but that targets a Droplet over SSH, not an App Platform component or its runtime bindings. [DigitalOcean `doctl compute ssh` reference](https://docs.digitalocean.com/reference/doctl/reference/compute/ssh/)
- Kubernetes `exec` semantics belong to a DigitalOcean Kubernetes cluster and its pods. This app is not a DOKS workload accessible through a cluster kubeconfig.
- Deployment hooks/jobs require a deployment and are not on-demand existing-component execution.
- Internal or undocumented endpoints were not considered acceptable provider contracts.

## Current PhysiqueOS runner trace

The repository runner at candidate `ec9f28df` exactly mirrors the documented App Platform console behavior:

1. `requestExecUrl` sends a bearer-authenticated `GET` to `/v2/apps/{app}/components/{component}/exec` with no request body or mode query.
2. It accepts only a `wss://` URL from the response and ignores no documented capability fields because the provider response contains only `url`.
3. `runRemoteConsole` opens the WebSocket with no requested subprotocol and sets binary handling only for client decoding.
4. On open it sends a terminal resize operation.
5. It then sends shell input: echo suppression, a base64/gzip/Node pipeline, bounded payload chunks, a remote status marker, and shell exit.
6. Incoming messages are reduced to the single provider `data` string and accumulated as one combined terminal stream.
7. Cursor-position terminal queries are answered so the console can initialize.
8. The runner bounds total output, timeout, close status, and remote exit status.

Relevant source: [`runAppConsoleContextGzipSourceOnOpen.mjs`](https://github.com/dustinginn/physiqueos/blob/ec9f28dffb48d0822849a2ecf9958b71988dd16c/scripts/operations/runAppConsoleContextGzipSourceOnOpen.mjs)

The runner does not itself request a PTY; the provider's App Platform exec endpoint supplies an interactive terminal. There is no overlooked response mode, query option, WebSocket operation, or channel identifier in the documented provider contract or current official clients.

## PTY alternatives investigated

### Earlier echo suppression is not available

The remote terminal starts with echo enabled. Disabling echo requires sending a command through that same terminal, so the first command is exposed to terminal rendering before it can change terminal state. The provider WebSocket supports only terminal `stdin` and `resize`; it provides no terminal-mode operation comparable to a direct `tcsetattr` call.

ANSI concealment, carriage returns, prompt clearing, or alternate-screen sequences can change visual rendering but do not remove bytes from the provider's raw combined `data` stream. They therefore cannot establish a trustworthy raw channel.

### Minimal shells do not remove the provider wrapper

Launching `sh` or `bash` with no-profile/no-rc flags can reduce child-shell noise only after the provider's initial interactive shell and PTY have already emitted framing. Replacing the shell with `exec` may reduce post-command prompt noise but cannot eliminate provider terminal initialization, the first command echo, or provider close rendering. It is not a separate output channel.

### File descriptors are still attached to the PTY

Redirecting application output to another local file descriptor does not help because the provider exposes only one combined terminal `data` stream. Any descriptor eventually copied back to the client is rendered through the same PTY. There is no channel ID for stdout versus stderr.

### Temporary files do not solve retrieval

A zero-data result could be written to an ephemeral file, but retrieving it still requires printing it through the same PTY. This adds cleanup and stale-file risk without removing terminal framing. Persisting Founder evidence to a component filesystem is not acceptable, even if the container is ephemeral.

### App logs are not a private result channel

Redirecting results to service or job logs would persist them in provider log infrastructure, mix them with unrelated output, and weaken confidentiality and exact-run correlation. It is unsuitable for Founder data and does not meet the rollback-before-output boundary.

### Network callbacks or diagnostic endpoints are materially different systems

An outbound callback or a deployed diagnostic HTTP endpoint could provide deterministic HTTP response semantics, but would require new authentication, replay protection, egress/ingress policy, a deployment, and a persistent attack surface. It is not an in-place transport correction and should not be introduced implicitly under this task.

## Mock/prototype decision

No non-interactive provider mode exists, so no raw-exec mock implementation was created.

No PTY alternative met all of these requirements simultaneously:

- distinct provider-supported data channel;
- existing component runtime and bindings;
- no deployment or app-spec mutation;
- no persistent Founder evidence;
- strict rejection of arbitrary outside output;
- deterministic cross-platform behavior.

Mocking an undocumented mode would create false confidence and an unsupported production dependency. Teaching the parser to ignore the four unknown PTY lines was explicitly rejected.

The existing operational candidate remains `ec9f28dffb48d0822849a2ecf9958b71988dd16c`. No repository files changed in this research task.

## Verification

- Installed `doctl apps console --help`: inspected; no raw/no-PTY/command flags.
- Current official `doctl` source: inspected and revision-pinned.
- Current official `godo` source: inspected and revision-pinned.
- Current App Platform API and console docs: inspected.
- App Platform job docs/spec/API surface: inspected.
- Repository request, WebSocket, terminal, and safety flow: traced.
- Existing production-access suite rerun: **46/46 passed**, 11 suites.
- Worktree: clean.
- Production network console/data calls: **0**.

## Security comparison

| Option | Credential isolation | Existing bindings | Output determinism | Prompt/echo | Injection surface | Cleanup/persistence | Provider support | Mac/PC + agent usability | Decision |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| Supported App Platform raw exec | Would be strong | Yes | High | None | Bounded command | Ephemeral | **Not available** | Ideal | Cannot use |
| Current App Platform PTY console | Token remains local; runtime secrets stay remote | Yes | Low | Unavoidable combined terminal stream | Interactive shell | Ephemeral container, but shell/history semantics | Official | Rendering varies by PTY/host | Keep fail-closed; not accepted |
| App Platform job | App token local; job gets configured bindings | Separate job component | Medium through logs | None | App-spec command | Logs persist; deployment/schedule lifecycle | Official | Cross-platform API | Reject for this read path |
| PTY temporary file / extra FD | Secrets stay remote | Yes | Retrieval still PTY | Still present | Shell plus file operations | Cleanup/stale-file risk | Shell behavior only | Cross-platform runner, nondeterministic terminal | Reject |
| App logs as result channel | Secrets can stay remote | Yes | Mixed/asynchronous | None at retrieval | Logging path | Provider persistence | Official logs, not private RPC | Cross-platform | Reject for Founder evidence |
| Repository-owned diagnostic HTTP endpoint | Can be designed, but requires new auth | Yes | High | None | Persistent network surface | No local file required | Application-owned | Strong cross-platform client story | Only as separately reviewed architecture |
| Droplet SSH / Kubernetes exec | Different credentials and resources | No | Potentially high | Product-specific | Different control plane | Product-specific | Official for other products | Irrelevant | Do not cross-apply |
| Undocumented/internal App Platform API | Unknown | Possibly | Unknown | Unknown | Unknown | Unknown | Unsupported | Fragile | Prohibited |

## Safest recommended architecture

The immediate safe path is provider clarification, not another parser or production retry.

1. Ask DigitalOcean Support for a written, supported answer on whether App Platform has a non-interactive/no-PTY component exec mode, a raw command request, or separated output channels not yet represented in the public API, `godo`, and `doctl`.
2. Do not use undocumented parameters or internal endpoints if support cannot cite a public contract.
3. If DigitalOcean confirms there is no supported raw mode, make an explicit Founder architecture decision between:
   - retaining the current PC-only approved path until provider support changes; or
   - designing a repository-owned, narrowly authenticated, one-shot read-only diagnostic endpoint with replay protection, exact schema, hard output bounds, transaction fencing, audit logging without data, and automatic disablement.
4. Treat that endpoint as a separate Server security feature requiring threat modeling, code review, staging acceptance, and an explicit deployment authorization. It must never be added as an incidental workaround.

The application-owned endpoint is the only identified design that can provide deterministic non-PTY response semantics while preserving runtime bindings. It also has the largest persistent attack surface, so it is a fallback architecture—not an automatic recommendation to implement.

## Zero-data proof recommendation

**Do not authorize another production zero-data proof yet.**

There is no materially different, provider-supported transport candidate to prove. Another attempt would reuse the same PTY channel that has already failed strict outside-frame validation.

A future zero-data proof should be authorized only after one of these conditions is met:

- DigitalOcean supplies a documented raw/no-PTY mechanism and a mock-covered candidate implements it without PTY fallback; or
- the Founder separately authorizes a reviewed application-level diagnostic architecture and its staging acceptance is green.

For a provider raw-exec candidate, the exact proof scope should remain:

1. current authority and health recheck;
2. exact approved context only;
3. runtime SHA and required binding-presence booleans only;
4. one bounded DB connection;
5. `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`;
6. `transaction_read_only=on`;
7. `SELECT 1`;
8. explicit `ROLLBACK`, resource close, exact structured result and remote exit;
9. post-exec authority/health recheck;
10. no Founder tables or records.

It must fail rather than fall back to interactive PTY.

## Exact next action / prompt

Founder action:

> Obtain written DigitalOcean confirmation, with public documentation if available, on whether App Platform component exec supports non-interactive/no-PTY command execution or separated stdout/stderr. If DigitalOcean provides a supported mechanism, stage a new continuation authorizing a mocks-only implementation and review before any production proof. If DigitalOcean confirms console-only PTY, decide whether to retain the existing PC-only path or commission a separately threat-modeled application-level read-only diagnostic endpoint. Do not authorize another PTY console retry from the current candidate.

## Progression status

The progression candidate `999a225a38ced9ddb16a65bbe840896472265468` remains unchanged and blocked pending an accepted production-read transport. No Founder progression verification or deployment decision was performed in this task.

## Safety flags

- CONTAINS_SECRETS: NO
- CONTAINS_CREDENTIALS: NO
- CONTAINS_PRODUCTION_EXPORTS: NO
- CONTAINS_FOUNDER_EVIDENCE: NO
- SAFE_FOR_CHATGPT_RETRIEVAL: YES

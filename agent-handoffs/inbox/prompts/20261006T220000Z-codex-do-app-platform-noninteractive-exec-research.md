PhysiqueOS production access portability — research non-interactive DigitalOcean App Platform execution

Continue in this current Mac Codex conversation and current provided work environment.

Do NOT create or delegate to sub-chats, child tasks, additional Codex sessions, or additional worktrees.

Current operational candidate:
ec9f28dffb48d0822849a2ecf9958b71988dd16c

Latest report:
fb3ae3afb6f64223c2d3219499126a66d3c8f780

Progression candidate remains separate:
999a225a38ced9ddb16a65bbe840896472265468

TASK TYPE

RESEARCH / DESIGN FIRST.

Do not make another production console call in the research phase.

Do not deploy.
Do not access Founder data.

GOAL

Determine whether DigitalOcean App Platform currently provides an authoritative non-interactive, non-PTY, or no-echo execution mechanism suitable for bounded production read-only diagnostics.

Prefer eliminating interactive terminal wrapper noise over teaching our strict parser to tolerate more PTY output.

PART 1 — AUTHORITATIVE PROVIDER RESEARCH

Inspect current authoritative DigitalOcean documentation, doctl behavior/source/help, and the API behavior already used by the runner.

Determine whether App Platform supports any of:

- non-interactive exec;
- command execution without PTY;
- exec endpoint with tty=false / pty=false;
- one-shot command invocation;
- stdin/stdout stream separate from terminal rendering;
- console URL options controlling terminal allocation;
- WebSocket subprotocol or request parameter for raw execution;
- component job/run mechanism suitable for a bounded ephemeral diagnostic;
- other officially supported mechanism that executes inside the existing component with its runtime environment/bindings but avoids interactive terminal framing.

Distinguish:
- App Platform console;
- Apps exec;
- Droplet exec;
- Kubernetes exec;
- Jobs;
- deployment hooks;
- unsupported/internal APIs.

Do not assume similarly named APIs from other DigitalOcean products apply to App Platform.

Cite exact authoritative docs/API/tool source in the report.

PART 2 — INSPECT CURRENT RUNNER

Trace:
- how the App Platform console URL is requested;
- request payload/query parameters;
- returned metadata;
- WebSocket setup;
- terminal resize;
- stdin;
- shell/PTY assumptions;
- whether the current implementation requests a PTY explicitly or the provider always supplies one;
- whether doctl exposes flags not currently used;
- whether provider response contains a mode/capability we ignore.

Do not print tokens/URLs containing credentials.

PART 3 — LOCAL / MOCKED EXPERIMENTS

If a non-interactive mode exists:

Implement it first against mocks/fixtures only.

Requirements:
- same exact approved context allowlist;
- same current authority checks;
- no credential exposure;
- bounded command;
- bounded stdout/stderr;
- exact remote exit;
- strict structured frame;
- no interactive prompt;
- no shell history;
- no arbitrary fallback to PTY if raw exec fails.

Add comprehensive mocked tests.

Do NOT call production yet in this task unless Part 5 explicitly becomes authorized by the conditions below.

If no non-interactive mode exists:
do not broaden the current parser.
Proceed to Part 4.

PART 4 — SAFEST PTY ALTERNATIVE

If provider offers only interactive PTY:

Investigate whether we can eliminate the four unknown outside lines by changing controlled transport behavior rather than accepting them.

Examples to investigate:
- launch a minimal shell mode;
- shell flags that suppress prompt/profile/echo;
- exec a child process after initial PTY setup with stdout framed predictably;
- redirect controlled result through a dedicated file descriptor if supported;
- disable echo earlier through terminal control available from provider;
- use a temporary in-component file for result transport followed by one controlled read, provided it contains NO credentials and is securely removed;
- another deterministic mechanism that keeps unknown PTY output outside the accepted data channel.

Do not implement a mechanism that persists Founder data to disk.

For zero-data doctor experiments, temporary non-sensitive output may be considered only if safely cleaned and provider/runtime semantics support it.

Prefer a distinct data channel over parser tolerance.

PART 5 — OPTIONAL ZERO-DATA PROOF

Do NOT automatically perform a new production attempt.

At the end of research, determine whether you have found a materially different transport mechanism that:
- avoids the previously failing outside-frame PTY path;
- is covered by local/mocked tests;
- preserves all safety boundaries.

If YES:
publish the candidate and report first, with the exact proposed zero-data proof command/mode, and STOP for Founder authorization.

If NO:
publish that no supported non-interactive path exists and recommend the safest next PTY diagnostic/architecture. STOP.

Do not consume another zero-data production attempt in this task.

PART 6 — SECURITY COMPARISON

Compare options on:
- credential isolation;
- runtime binding access;
- read-only DB enforcement;
- stdout/stderr determinism;
- prompt/echo exposure;
- command injection surface;
- ability to bound output;
- cleanup;
- auditability;
- cross-platform Mac/PC behavior;
- Claude/Codex usability;
- provider support/stability.

Do not trade safety for convenience.

PART 7 — PROGRESSION

Do not run the Founder progression read in this task.

The progression candidate remains blocked pending an accepted production-read transport.

No change to 999a225a.

REPORTING

Publish a main-visible report-only handoff.

Report:
- whether official non-interactive App Platform execution exists;
- exact evidence;
- current runner findings;
- mocked prototype/candidate SHA if applicable;
- tests;
- safest recommended architecture;
- whether another zero-data proof should be authorized;
- exact next prompt/action;
- no production console call;
- no Founder read;
- no deployment/mutation.

Status:
Production access transport research complete — next safe path identified.

Do not create sub-chats/worktrees.
STOP.

END TASK.
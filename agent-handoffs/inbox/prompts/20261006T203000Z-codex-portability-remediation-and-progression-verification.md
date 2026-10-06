PhysiqueOS production access portability — Stage 1 remediation + progression verification

Continue in this current Mac Codex conversation and current provided work environment.

Do NOT create or delegate to sub-chats, child tasks, additional Codex sessions, or additional worktrees.

TASK TYPE

Implement the already-audited Stage 1 cross-platform production-read remediation, validate it on this already-authorized Mac with zero Founder data first, then use the newly authoritative read-only path to complete the previously blocked Training progression production verification.

STOP before any Server deployment.

AUTHORITIES

Portability audit report:
d2c34b1213888fb8950a588c2ffda05b6b874d9f

Previously accepted portable implementation source:
4025f17560e926b7e33a1cad6757a06716b16d24
on origin/codex/production-readonly-mac-bootstrap-handoff

Current main has advanced since that implementation. Re-review and port semantically; do NOT blindly cherry-pick.

Progression candidate:
999a225a38ced9ddb16a65bbe840896472265468

Progression audit:
e6c10085e12da4223e6430bc1f47a9e0b6c4aa84

Progression readiness:
3a83c291271a65ae04eaba40b3ae878634b86565

PC blocked verification:
240861a53d1fdeb6701ad57ba4bfdaa340df23fb

Current production Server expected:
b7eb1e397f0238df9ae904fd182ddbb51602e8d8

Mac audit already established:
- doctl installed;
- Node available;
- named physiqueos-final-cutover-config exists;
- current Mac control-plane auth works;
- ignored local runner is byte-identical to accepted implementation;
- historical zero-data Mac console smoke passed;
- no new credential/login/Founder Terminal action is currently required.

Do not reauthenticate or rotate credentials.

PART 1 — PORTABLE TOOLING ON CURRENT MAIN

Re-review the accepted implementation from 4025f175 against current main.

Promote the appropriate operational tooling into durable repository-owned paths, expected to include equivalents of:

scripts/operations/runAppConsoleContextGzipSourceOnOpen.mjs
scripts/operations/runAppConsoleContextGzipFile.mjs
scripts/operations/productionReadonlyRunner.test.mjs
scripts/operations/README-production-readonly.md
required explicit package dependency changes

Preserve cross-platform Windows/macOS/Linux doctl config discovery.

Do not introduce PowerShell as a requirement.

Do not accept PAT/token values as CLI arguments or environment-variable shortcuts.

Do not print credential/config contents.

Re-review all dependency versions against current package state rather than blindly restoring an old lockfile.

PART 2 — SHARED SAFETY PRIMITIVES

Harden the repo-owned path so real audit payloads can reuse explicit safety primitives/patterns for:

- current app/component/deployment discovery;
- expected Web/worker source authority;
- runtime PHYSIQUEOS_GIT_SHA verification;
- exact approved context allowlisting;
- no deploy/migration context fallback;
- bounded output;
- strict success marker;
- zero unexpected stderr where required;
- owner-scope requirement for Founder-data audits;
- one bounded DB connection;
- statement timeout;
- BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
- SHOW transaction_read_only and require on;
- parameterized SELECT-only operations;
- explicit ROLLBACK in finally;
- resource closure;
- sanitized schema-bounded output after rollback;
- stop on 401/403, identity drift, missing bindings, unexpected output, transaction fence failure, rollback failure, or any need to mutate.

Do not claim the DigitalOcean console transport itself is database-read-only. The runtime component has write-capable bindings; the transaction/payload discipline remains essential.

PART 3 — PRODUCTION-ACCESS DOCTOR

Implement a repo-owned doctor interface with three explicit modes.

A. local
No network/data.
Verify:
- supported OS/arch;
- repository root;
- Node/doctl/Git;
- required package resolution;
- repo-owned runner/wrapper hashes/current commit;
- exactly one doctl config path;
- owner-only config permissions where applicable;
- exact approved context-name presence WITHOUT token output;
- reject deploy/migration contexts;
- no ambiguous config.

B. control-plane
Harmless provider metadata only.
Using explicit approved read context:
- discover intended app;
- active deployment;
- no transitional deployment;
- Web/worker components;
- source branch/SHA agreement;
- public health/source authority;
- no full provider spec/env output.
Stop on 401/403 or ambiguity.
Never try another context automatically.

C. console
SEPARATELY EXPLICITLY AUTHORIZED in this task for ZERO-DATA ACCEPTANCE ONLY.
- open only verified current component;
- verify runtime source SHA;
- report required binding PRESENCE as booleans only, never values;
- open one bounded DB connection;
- BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
- require transaction_read_only=on;
- SELECT 1 only;
- no Founder/owner table reads;
- ROLLBACK;
- close resources;
- emit exact success marker once;
- recheck control-plane identity/public health after closure.

Passing doctor proves host plumbing and transaction fence, not arbitrary payload safety.

PART 4 — RUNBOOK

Update agent-handoffs/PRODUCTION_READONLY_ACCESS.md from PC-only to AUTHORIZED-HOST semantics.

Define an authorized host as a Founder-controlled Mac or PC with:
- separately authenticated least-privilege physiqueos-final-cutover-config context;
- repo-owned runner at reviewed authority;
- passing local/control-plane doctor;
- recorded zero-data console acceptance;
- explicit task-level authorization.

Preserve:
- credentials never move with Git/chat/Remote Control/worktrees;
- host authorization is necessary but not sufficient for a production audit;
- every real task must explicitly authorize production inspection and define owner/data bounds;
- all SHA/owner/read-only/SELECT-only/rollback/sanitization invariants;
- stop conditions;
- no deploy-context fallback;
- separate read vs deploy authority;
- per-host issuance/revocation/rotation guidance.

Do not authorize cloud-hosted sessions merely because they can clone the repo.

PART 5 — TEST PORTABILITY TOOLING

Run:
- runner/wrapper unit tests;
- Windows/macOS/Linux path-discovery fixtures;
- exact-context selection;
- no-secret-output tests;
- WSS validation;
- timeout/non-zero/closure tests;
- marker validation;
- doctor local tests;
- doctor control-plane mocked tests;
- doctor console mocked transaction/rollback/failure tests;
- lint;
- git diff --check.

Do not access Founder data yet.

PART 6 — MAC ZERO-DATA ACCEPTANCE

This task explicitly authorizes:
doctor local;
doctor control-plane;
doctor console ZERO-DATA mode.

Use only the already-existing Mac physiqueos-final-cutover-config.

Do not login/reauthenticate.
Do not rotate credential.
Do not use another context.

Require:
- local pass;
- control-plane pass;
- current production authority coherent;
- console pass;
- runtime SHA expected;
- required DB binding presence true without values;
- transaction_read_only=on;
- SELECT 1;
- rollback;
- no Founder record/table query;
- sanitized marker.

If ANY doctor stage fails:
STOP.
Do not proceed to Founder data.
Publish failure.

PART 7 — COMPLETE PROGRESSION PRODUCTION VERIFICATION

ONLY if Parts 1–6 are green, this task explicitly authorizes one bounded Founder-owner production READ using the newly repo-authoritative path.

Use the same safety contract:
one REPEATABLE READ READ ONLY transaction;
transaction_read_only=on;
bounded parameterized SELECTs;
explicit rollback;
sanitized output after rollback.

Retrieve ONLY:

A. Active Training Strategy/protocol/version needed for:
- progression rule type;
- condition;
- action;
- successfulSessionsRequired;
- minimumExposureDays if present;
- exactly-one-active-authority status.

B. cable_machine_front_raise recent finalized/non-superseded occurrences required to establish:
- exact exercise identity;
- variant;
- relationship context;
- current load/prescription run;
- completed working-set profile;
- qualifying successes;
- first qualifying success;
- target increment provenance if supported.

C. one minimal expected-Maintain control and one expected-Progression-Opportunity control if readily available.

Do not broaden the query indefinitely to find a control.

Do not emit owner identifiers or unrelated training history.

PART 8 — CURRENT VS CANDIDATE SHADOW

Using exact same sanitized rows, calculate:

Current production b7eb1e39:
- state;
- action;
- prescription;
- reason;
- current cadence anchor.

Candidate 999a225a:
- state;
- action;
- target if safely supported;
- qualifyingSuccessfulSessions;
- successfulSessionsRequired;
- exposureStartDate;
- exposureDays;
- minimumExposureDays;
- count gate;
- exposure gate;
- exact context;
- target availability/provenance;
- reason code.

Explicitly answer:
Would candidate 999a225a classify Cable Machine Front Raises as progression-eligible now?

If eligible but no safe increment:
progression_opportunity + consider_progression + target unavailable.
Never invent a load.

Run same shadow for bounded controls.

PART 9 — DEPLOYMENT DECISION

Combine real production shadow with existing candidate gates:
- progression focused 128/128;
- Phase 6 Training 167/167;
- clean three-commit fast-forward from b7eb1e39;
- no migration/backfill;
- backward-compatible Native contract;
- deployment tooling previously green.

Publish explicit:
DEPLOY
or
DO NOT DEPLOY.

DO NOT ACTUALLY DEPLOY in this task.

PART 10 — SOURCE / REPORTING BOUNDARY

The portability tooling/runbook change may be committed to an isolated operational branch/candidate and published for review.

Do NOT merge operational tooling into main product authority unless the established workflow for this repository explicitly permits this task to publish that operational-only change. Prefer:
- isolated candidate SHA for tooling;
- main-visible report-only handoff;
- exact recommended merge step.

Do not mix the progression Server candidate into the portability-tooling commit.

Publish one main-visible report that contains:
- portability candidate SHA;
- files added/changed;
- tooling tests;
- Mac doctor results;
- current production authority;
- progression production-read result;
- Cable current vs candidate;
- controls;
- deployment recommendation;
- exact next action;
- confirmation no Server deployment or production mutation.

If tooling is green and progression is DEPLOY:
Status:
Production access portability verified on Mac; Training progression production shadow green; awaiting Founder deployment authorization.

If tooling green but progression is not:
state exact blocker.

STOP.

Do not deploy.
Do not touch Native Build 89/90.
Do not create sub-chats/worktrees.

END TASK.
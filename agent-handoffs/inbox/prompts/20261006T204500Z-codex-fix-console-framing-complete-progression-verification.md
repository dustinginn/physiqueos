PhysiqueOS production access portability — fix console framing and complete progression verification

Continue in this current Mac Codex conversation and current provided work environment.

Do NOT create or delegate to sub-chats, child tasks, additional Codex sessions, or additional worktrees.

Continue from operational candidate:
f1b5b330f119a3506a55aa1a9d96246d83f0f71c

Previous report:
055c9104f6f8e977b35d43085ce52a621e3be9d6

Progression candidate remains:
999a225a38ced9ddb16a65bbe840896472265468

TASK

Fix ONLY the real-console structured-output framing/parsing defect identified by the failed zero-data Mac console doctor, revalidate the operational tooling, retry the explicitly authorized zero-data console doctor once the local gates pass, and—only if all doctor stages are green—complete the already-authorized bounded Training progression production verification.

Do NOT deploy production.

PART 1 — DIAGNOSE WITHOUT EXPOSING RAW SENSITIVE OUTPUT

The prior console transport:
- opened successfully;
- returned the exact success marker;
- passed output bounds and credential-shape checks;
- failed only because structured JSON was not found: AUDIT_JSON_MISSING.

Most likely cause:
real App Platform PTY output may contain ANSI/control sequences, carriage-return behavior, prompt fragments, or chunk splitting around the structured JSON prefix.

Audit the runner/parser path.

Do not print raw console output from a production session to diagnose this.

Use synthetic/replayed fixtures to reproduce realistic PTY framing.

PART 2 — NARROW PARSER/FRAMING FIX

Make the smallest robust correction.

Preferred properties:
- strip/normalize only well-defined terminal ANSI/control framing required for parsing;
- normalize CRLF/carriage-return behavior safely;
- tolerate structured prefix split across WebSocket chunks after transport reassembly;
- locate exactly one explicitly framed structured result;
- preserve exact success-marker requirement;
- reject zero structured frames;
- reject multiple structured frames;
- reject malformed JSON;
- reject unexpected trailing/leading application payload beyond allowed PTY/prompt framing;
- preserve credential-shape/output-bound guards;
- never broadly scrape arbitrary JSON from console text.

If stronger explicit begin/end framing is safer than prefix parsing, use it and test it.

Do not weaken fail-closed behavior merely to make the real console pass.

PART 3 — TESTS

Add realistic fixtures for:
- ANSI prefix/suffix;
- CRLF;
- carriage-return overwrite behavior if relevant;
- prompt noise;
- structured prefix split across chunks;
- marker split across chunks;
- malformed frame;
- duplicate frame;
- missing frame;
- unexpected payload;
- credential-shaped output rejection;
- non-zero remote exit;
- timeout/closure.

Run all production-access tests, lint, syntax, package-lock consistency and git diff check.

Require all green before real console retry.

PART 4 — EXPLICIT ZERO-DATA MAC DOCTOR RETRY

This task explicitly authorizes ONE new zero-data console doctor attempt after local/control-plane doctors pass.

Use only existing Mac:
physiqueos-final-cutover-config

No login.
No reauthentication.
No token rotation.
No alternate context.

Run in order:
1. doctor local;
2. doctor control-plane;
3. doctor console.

Console doctor may perform only:
- verified runtime SHA;
- required binding presence booleans, never values;
- one bounded DB connection;
- BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
- SHOW transaction_read_only and require on;
- SELECT 1;
- explicit ROLLBACK;
- close;
- exact structured frame + marker;
- post-console authority/health recheck.

No Founder table/record reads in doctor.

If console doctor fails again:
STOP.
Publish exact sanitized failure.
Do not attempt Founder data.
Do not retry repeatedly.

PART 5 — PROGRESSION PRODUCTION VERIFICATION

ONLY IF all three doctors PASS, continue under the production-read authorization already established by task 71ff9fbc.

Perform one bounded Founder-owner REPEATABLE READ READ ONLY transaction.

Retrieve only:

A. Exact active Training Strategy/protocol/version progression authority:
- rule type;
- condition;
- action;
- successfulSessionsRequired;
- minimumExposureDays if present;
- exactly-one-active-authority status.

B. cable_machine_front_raise:
only recent finalized/non-superseded occurrences needed for exact current exercise/variant/relationship/load/prescription run, completed working-set profile, qualifying-success count, first qualifying success, and safe target-increment provenance.

C. one minimal expected-Maintain control and one expected-Progression-Opportunity control if readily available.

No broad history dump.
No owner identifiers in report.
No writes.

Require transaction_read_only=on before application SELECTs and explicit rollback before sanitized output.

PART 6 — SHADOW CURRENT VS CANDIDATE

Using identical sanitized rows, calculate:

Current production b7eb1e39 recommendation.

Candidate 999a225a recommendation.

For Cable Machine Front Raises report:
- current state/action;
- candidate state/action;
- qualifyingSuccessfulSessions;
- successfulSessionsRequired;
- exposureStartDate;
- exposureDays;
- minimumExposureDays;
- count gate;
- exposure gate;
- exact comparison context;
- target availability/provenance;
- whether candidate says progression-eligible NOW.

If eligible but increment unsupported:
progression_opportunity + consider_progression + target unavailable.

Never invent load.

Shadow bounded controls as well.

PART 7 — DECISION

Combine production evidence with existing candidate gates:
- 128/128 focused progression;
- 167/167 Phase 6 Training;
- clean three-commit fast-forward;
- no migration/backfill;
- backward-compatible Native contract.

Publish explicit:
DEPLOY
or
DO NOT DEPLOY.

Do NOT actually deploy.

PART 8 — OPERATIONAL CANDIDATE STATUS

If the real console doctor passes:
- update operational candidate SHA;
- mark Stage 1 Mac acceptance green;
- publish exact tooling tests and doctor results;
- recommend merge of the operational tooling/runbook through normal review;
- note PC parity doctor remains needed after its expired/401 context is restored, but PC failure must not invalidate a separately accepted Mac authorized host.

If doctor fails:
- operational candidate remains not merge-ready.

REPORTING

Publish one main-visible report-only handoff superseding 055c9104.

Include:
- parser root cause;
- fix;
- tests;
- operational candidate SHA;
- doctor local/control-plane/console results;
- current production authority;
- whether Founder read occurred;
- progression shadow if authorized;
- controls;
- DEPLOY/DO NOT DEPLOY;
- exact next action;
- no Server deploy / no production mutation.

Do not touch Native Build 89/90.
Do not deploy.
Do not create sub-chats/worktrees.

STOP.

END TASK.
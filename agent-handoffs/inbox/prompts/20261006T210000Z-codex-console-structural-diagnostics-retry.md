PhysiqueOS production access portability — non-content console diagnostics + one zero-data retry

Continue in this current Mac Codex conversation and current provided work environment.

Do NOT create or delegate to sub-chats, child tasks, additional Codex sessions, or additional worktrees.

Continue from operational candidate:
d84973a894e2900fc5609d77c623dff22b7a7d19

Previous report:
44378fab3ac07c924d069b91d8bfa29ab3a34b4a

Progression candidate remains separate and untouched:
999a225a38ced9ddb16a65bbe840896472265468

TASK

Add strictly NON-CONTENT diagnostics at the real-console transport/parser boundary, use synthetic fixtures to validate them, then perform ONE explicitly authorized zero-data Mac console-doctor retry.

If and only if all doctor stages pass, complete the already-authorized bounded Training progression production verification and publish the deployment recommendation.

Do NOT deploy production.

DIAGNOSTIC SAFETY BOUNDARY

Diagnostics may reveal ONLY bounded structural metadata about the console stream.

Allowed:
- total raw output byte count, capped/rounded if useful;
- total normalized output byte count;
- WebSocket chunk count;
- normalized line count;
- begin-sentinel occurrence count;
- end-sentinel occurrence count;
- success-marker occurrence count;
- zero-exit-marker occurrence count;
- whether begin appears before end;
- whether end appears before success marker;
- whether marker ordering is valid;
- whether begin/end tokens appear contiguously after normalization;
- whether expected base64-frame line position exists structurally;
- count of recognized ANSI/OSC/control sequences removed;
- count of carriage-return/backspace normalization events;
- parser stage reached;
- sanitized error code.

Not allowed:
- raw console text;
- raw bytes;
- substrings;
- prompt text;
- decoded JSON;
- base64 payload;
- database values;
- environment values;
- binding values;
- credential/token text;
- hashes/fingerprints of sensitive output;
- arbitrary character samples;
- Founder data;
- SQL result content.

Diagnostics must themselves pass credential-shape and bounded-output safety review.

IMPLEMENTATION

Add a small fail-closed diagnostic structure to the parser/doctor failure path.

It should be emitted only when explicitly requested by the doctor diagnostic mode, not by normal production audit runs.

Do not weaken parsing acceptance.

The console doctor still passes only when:
- exactly one valid structured frame is parsed;
- exact marker requirements pass;
- transaction fence passes;
- zero-data payload succeeds;
- post-console authority remains coherent.

A diagnostic result is never a PASS by itself.

SYNTHETIC TESTS

Add fixtures that distinguish at least:
- no begin token;
- begin only;
- begin + end but malformed frame;
- full frame without success marker;
- marker without frame;
- duplicated frame;
- reversed ordering;
- prompt/ANSI/control wrapping;
- split begin/end/marker across chunks;
- CR overwrite;
- unexpected application payload.

Assert diagnostics contain structural metadata only.

Add a negative test proving no fixture payload text/JSON/base64/credential-shaped content can appear in diagnostics.

Run all production-access tests, lint, syntax, npm lock consistency and git diff check.

MAC DOCTOR RETRY AUTHORIZATION

This task explicitly authorizes ONE additional zero-data Mac console-doctor attempt after:
- local doctor passes;
- control-plane doctor passes;
- all local/synthetic tests pass.

Use only existing:
physiqueos-final-cutover-config

No login.
No reauthentication.
No rotation.
No alternate context.

Console scope remains ONLY:
- verified runtime SHA;
- required binding PRESENCE booleans;
- one bounded DB connection;
- REPEATABLE READ READ ONLY;
- transaction_read_only=on;
- SELECT 1;
- ROLLBACK;
- close;
- structured frame/marker;
- post-console authority check.

No Founder table/record read in doctor.

IF RETRY FAILS

STOP immediately.

Publish:
- sanitized error code;
- allowed structural diagnostic fields;
- exact next engineering hypothesis;
- no Founder read.

Do not perform another retry.

IF RETRY PASSES

Proceed immediately to the already-authorized bounded Founder production verification.

PROGRESSION PRODUCTION VERIFICATION

Use one Founder-owner REPEATABLE READ READ ONLY transaction with transaction_read_only=on and explicit rollback.

Retrieve only:

A. active Training Strategy/protocol/version progression authority:
rule type, condition, action, successfulSessionsRequired, minimumExposureDays if present, exactly-one-active status.

B. cable_machine_front_raise recent finalized/non-superseded occurrences needed for exact exercise/variant/relationship/current-load run, working-set profile, qualifying successes, first qualifying success, and safe target provenance.

C. one minimal expected-Maintain and one expected-Progression-Opportunity control if readily available.

No broad history.
No owner identifiers in report.
No writes.

SHADOW

Using identical sanitized rows compare:

Current production b7eb1e39 recommendation.

Candidate 999a225a recommendation.

For Cable report:
- current state/action;
- candidate state/action;
- qualifyingSuccessfulSessions;
- successfulSessionsRequired;
- exposureStartDate;
- exposureDays;
- minimumExposureDays;
- count gate;
- exposure gate;
- exact context;
- target availability/provenance;
- progression-eligible NOW yes/no.

Never invent a load.

Run bounded controls.

DECISION

Combine with existing candidate gates:
128/128 focused;
167/167 Phase 6 Training;
clean fast-forward;
no migration/backfill;
backward-compatible Native contract.

Publish explicit DEPLOY or DO NOT DEPLOY.

Do NOT deploy.

OPERATIONAL CANDIDATE

If console doctor passes:
- publish updated operational candidate SHA;
- mark Mac Stage 1 acceptance green;
- recommend operational tooling/runbook merge through normal review;
- PC parity remains a later separate acceptance after PC context restoration.

If console doctor fails:
- keep operational candidate not merge-ready.

REPORTING

Publish one main-visible report-only handoff superseding 44378fab.

Include:
- diagnostic implementation;
- tests;
- updated operational SHA;
- doctor results;
- structural diagnostics if failure;
- progression production shadow if authorized;
- DEPLOY/DO NOT DEPLOY;
- exact next action;
- no Server deployment;
- no production mutation;
- no Native Build 89/90 change.

Do not create sub-chats/worktrees.
STOP.

END TASK.
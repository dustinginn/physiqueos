PhysiqueOS production access — compare historical successful audit contract vs new strict doctor

Continue in this current Mac Codex conversation and current provided work environment.

Do NOT create or delegate to sub-chats, child tasks, additional Codex sessions, or additional worktrees.

TASK TYPE

READ-ONLY SOURCE / HISTORY / SECURITY CONTRACT AUDIT FIRST.

Do NOT make another production console call in this task.
Do NOT access Founder production data.
Do NOT deploy.
Do NOT change progression candidate 999a225a.

CONTEXT

Current portability candidate:
ec9f28dffb48d0822849a2ecf9958b71988dd16c

Current strict doctor lineage also includes later diagnostic candidates through:
b147cbfd66061a5f0e6367a011a08117f6e6e3f5
and
ec9f28dffb48d0822849a2ecf9958b71988dd16c

Latest transport research report:
5c705b43ab01a3326bbe757d15502cb23abe0390

The research established that DigitalOcean App Platform provides only an interactive PTY console for existing running components; no supported raw/no-PTY exec exists.

However, PhysiqueOS has successfully performed approved bounded production audits in the past through this same App Platform console family.

Before inventing a new application-level diagnostic endpoint, determine exactly why the historical approved audits succeeded and whether the new doctor has imposed a materially stricter outside-PTY-output requirement than the previously accepted security boundary.

GOAL

Compare:

A. historical known-successful production-read runner/payload/output-validation contracts;

versus

B. the new Stage 1 doctor/parser contract.

Determine whether we can safely restore the ESTABLISHED accepted security boundary without weakening actual protections around:
- credentials;
- production authority;
- owner scope;
- read-only transaction;
- SELECT-only bounded queries;
- rollback;
- sanitized result;
- remote exit;
- exact success marker;
- output bounds.

Do not assume stricter equals safer if the strictness applies only to irrelevant provider PTY wrapper noise.

PART 1 — IDENTIFY KNOWN-SUCCESSFUL AUDITS

Search repository history/reports for production reads that were actually completed successfully using the approved console runner.

At minimum inspect:
- the 2026-10-02 Mac console acceptance;
- earlier PC production SQL audits;
- DEXA/HealthKit/Training/briefing or other production audits that used the bounded runner;
- commit 4025f175 and its tests;
- the pre-portability .tmp runner contract where reconstructable from Git/history/reports.

For each representative successful audit record:
- exact runner version/commit if recoverable;
- wrapper behavior;
- payload framing;
- success marker;
- remote exit handling;
- stderr handling;
- output bounds;
- transaction enforcement;
- rollback;
- sanitization;
- what PTY noise was tolerated;
- what conditions caused failure.

Do not expose historical Founder data while reviewing reports.

PART 2 — SECURITY BOUNDARY COMPARISON

Build a matrix:

Historical accepted contract
vs
New strict doctor contract.

Separate controls into:

ESSENTIAL DATA/SAFETY CONTROLS:
- exact approved context;
- current app/component/deployment/SHA;
- no credential output;
- bounded remote command;
- bounded output;
- exact remote exit;
- transaction READ ONLY;
- transaction_read_only=on;
- parameterized SELECT-only;
- owner scope;
- rollback/finally;
- schema-bounded sanitized result;
- explicit success marker.

TRANSPORT-HYGIENE CONTROLS:
- every PTY line must match allowlist;
- prompt text classification;
- connection-banner classification;
- command-echo classification;
- no unknown outside-frame lines.

Determine which transport-hygiene controls were actually part of prior accepted authority and whether they protect any sensitive property once the structured result itself is cryptographically/structurally bounded, credential-shaped output is rejected, total output is bounded, remote exit is exact, and transaction safety is proven.

Do not characterize a control as unnecessary without threat analysis.

PART 3 — THREAT MODEL

For unknown PTY wrapper output outside the controlled result frame, evaluate:

Could it:
- contain database credentials?
- contain environment values?
- contain Founder data?
- spoof the structured result?
- spoof the success marker?
- hide a failed remote exit?
- inject a second result?
- indicate command injection?
- indicate shell/profile compromise?
- leak the command itself?
- leak encoded payload source?

For each risk, identify which existing guard catches it.

Specifically evaluate whether the current:
- raw credential-shape scan;
- bounded total output;
- exactly-one structured frame;
- canonical encoded frame;
- declared length;
- exactly-one success marker;
- zero-exit marker;
- remote close/exit status;
- schema-bounded decoded result;
- transaction fence;
- rollback;
- authority checks

are sufficient to permit IGNORING provider-generated outside-frame PTY noise as non-authoritative transport framing.

If not sufficient, identify the exact missing guard.

PART 4 — DETERMINE SAFE CONTRACT

Choose one:

OPTION A — Restore historical accepted boundary.
Outside-frame PTY noise is ignored as non-authoritative transport framing after bounded credential/output checks, while only the exact controlled structured frame + marker + exit determine audit success.

OPTION B — Restore historical boundary plus one/two additional guards.
Example: reject outside-frame content if it contains credential-shaped patterns, another frame sentinel, another success marker, exceeds strict size/line bounds, or violates remote exit ordering; otherwise do not classify prompt text.

OPTION C — Strict outside-line allowlisting is materially necessary.
If so, prove why prior successful audits were safe and why their contract is no longer adequate.

Do not choose based on convenience.

Prefer the simplest contract that preserves all material security properties.

PART 5 — MOCKED IMPLEMENTATION ONLY IF JUSTIFIED

If Option A or B is justified:

Implement the minimal contract change on the operational branch, but DO NOT call production.

Requirements:
- keep exactly-one canonical frame;
- keep frame length/canonical encoding/schema validation;
- keep exactly-one success marker and remote zero exit;
- keep raw output size bounds;
- keep raw credential-shape rejection;
- reject additional frame/sentinel/marker injection;
- keep transaction/rollback guards inside payload;
- keep authority pre/post checks;
- treat unrecognized outside-frame PTY bytes as non-authoritative ONLY within explicit total bounds and only after the above guards pass;
- do not parse arbitrary JSON outside frame;
- do not surface outside content.

Add tests for malicious outside content:
- credential-shaped text;
- duplicate sentinel;
- duplicate marker;
- fake JSON;
- oversized noise;
- command injection-like extra marker;
- non-zero exit;
- truncated frame;
- frame after failure;
- Founder-like arbitrary text outside frame must never enter decoded result/report.

If Option C:
do not change implementation.

PART 6 — NO PRODUCTION RETRY YET

Even if implementation/tests are green:
DO NOT perform another zero-data production attempt in this task.

Publish the comparison, threat model, chosen contract, candidate SHA/tests, and exact recommended proof.

STOP for Founder authorization.

PART 7 — PROGRESSION

Do not run Founder progression verification.
Do not deploy 999a225a.

REPORTING

Publish a main-visible report-only handoff.

Include:
- representative historical successful audit contracts;
- exact differences from new doctor;
- essential vs transport-hygiene controls;
- threat model;
- selected Option A/B/C;
- implementation candidate if changed;
- tests;
- whether the change restores established authority or weakens it;
- exact next zero-data proof scope;
- recommendation whether to proceed;
- no production call/data/deploy/mutation.

Status:
Production access contract comparison complete — safe acceptance boundary identified.

Do not create sub-chats/worktrees.
STOP.

END TASK.
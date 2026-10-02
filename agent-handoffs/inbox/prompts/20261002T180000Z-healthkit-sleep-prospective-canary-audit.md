HealthKit Sleep — prospective canary audit and Recovery shadow-readiness decision

TASK TYPE

Claude read-only production audit + evidence-based recommendation.

Do NOT mutate Sleep data.
Do NOT import historical Sleep.
Do NOT enable strategic Sleep.
Do NOT wire Recovery into published Briefings.
Do NOT change Goal Confidence, Strategy Confidence, Narrative V3, recommendations, or historical artifacts.
Do NOT deploy anything unless a separately identified correctness defect is found and Founder later authorizes a patch.

READ FIRST

Durable backlog:
agent-handoffs/backlog/PHYSIQUEOS_PRODUCT_BACKLOG.md

Sleep closeout:
agent-handoffs/reports/20261001T203806Z-healthkit-sleep-server-midnight-window-closeout.md

Recovery visual/shadow work:
agent-handoffs/reports/20261001T224516Z-recovery-briefing-v1-shadow-assessment.md

Find/read the relevant HealthKit Sleep canonicalization, Evidence UI, Oura preference, background delivery, historical import and strategic-leakage reports/handoffs.

Standing GH protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

CURRENT PRODUCT STATE

Sleep Evidence UI: accepted.
Historical Sleep canonical/read architecture: accepted for current scope.
Prospective canary start: 2026-10-02.
Mode: validation_only.
Strategic Sleep: OFF.
Recovery Briefing V1 visual design: accepted.
Recovery shadow assessment engine: implemented candidate but intentionally unwired/un-deployed.

Founder now wants to inspect whether enough prospective Sleep has naturally arrived and whether the pipeline is ready to move into Recovery shadow calibration.

A. REVERIFY PRODUCTION AUTHORITY

Before querying:
- fetch origin/main;
- identify current production Server SHA/deployment from current handoffs/control plane;
- verify web/worker authority;
- use the approved least-privilege DigitalOcean production-read path/context;
- bounded owner-scoped SELECTs only;
- BEGIN READ ONLY / verify transaction_read_only=on;
- no writes;
- no credentials printed;
- no raw PHYSIQUEOS_DATABASE_URL;
- stop on 401/403 or read-only verification failure.

B. DEFINE PROSPECTIVE WINDOW

Canary boundary is 2026-10-02 local Founder timezone.

Audit ONLY naturally arriving prospective Sleep observations/night records on or after the boundary for acceptance.

Historical pre-boundary Sleep may be read only when needed to:
- establish prior baseline/context;
- verify no historical mutation;
- compare source/canonicalization behavior.

Do not count pre-boundary historical imports as prospective acceptance nights.

C. PROSPECTIVE NIGHT INVENTORY

For each prospective local sleep day/night currently available, produce a sanitized matrix containing:
- local sleep date;
- source(s) observed;
- preferred source selected;
- canonical night identity;
- asleep duration;
- sleep-window start/end availability;
- stage availability/coverage;
- awake/continuity availability;
- timezone provenance/reliability;
- ingestion timestamps;
- late-arriving updates/revisions;
- whether canonical record changed after first arrival;
- Evidence availability;
- strategic eligibility/state;
- any anomaly.

Do not publish sensitive raw sample payloads.

D. OURA SOURCE PREFERENCE

Verify actual prospective behavior.

Expected:
- Oura-preferred data wins where the accepted source policy says it should;
- Apple Health duplicate/overlapping observations do not create two canonical nights;
- fallback behavior works when Oura is absent/incomplete;
- provenance remains visible/traceable;
- source preference does not silently discard materially unique stage/continuity information contrary to current policy.

If source policy differs from this summary, use the exact accepted policy and document it.

E. BACKGROUND DELIVERY

Determine whether prospective Sleep arrived without requiring the Founder to open the Log/Sleep screen.

Audit:
- HealthKit/background ingestion events;
- app foreground/open events if available;
- ingestion timestamps;
- evidence creation/update timestamps.

Goal:
prove the pipeline is not dependent on Log-tab visitation.

Do not overclaim if telemetry cannot establish causality; state exactly what can be proven.

F. ONE CANONICAL NIGHT / DAY

For every prospective night:
- exactly one canonical Sleep night/day;
- no midnight split;
- no duplicate Oura + Watch nights;
- correct local-day assignment;
- midnight-safe window math;
- no duplicate Evidence entry.

Check edge cases if naturally present:
- sleep crosses midnight;
- late morning sleep;
- naps if current policy distinguishes/excludes them;
- timezone offset changes.

G. LATE UPDATE / RECONCILIATION

Look for any naturally arriving late updates.

If present:
- prove same canonical night is updated/reconciled rather than duplicated;
- stage/continuity fields improve/replace according to policy;
- Evidence updates coherently;
- no historical briefing/confidence rewrite.

If no late update occurred naturally:
- mark this gate unobserved rather than failed;
- rely on deterministic tests only as secondary evidence.

H. STAGES / CONTINUITY

For prospective nights assess:
- stage totals/coverage;
- awake-in-window;
- longest continuous sleep;
- reliable clock times;
- uncertain/faded-time semantics where relevant;
- whether the data is sufficient for Recovery V1 inputs.

Do not create a new Sleep score.

I. EVIDENCE UI / READ MODEL

Verify each prospective canonical night is reflected correctly in the existing Sleep Evidence read path:
- latest night;
- rolling average;
- trends;
- sleep window;
- recent nights;
- source/provenance as designed.

No UI patch unless a correctness defect is proven; this task is audit first.

J. STRATEGIC LEAKAGE — HARD GATE

Prove Sleep remains strategically OFF.

Audit artifacts generated after 2026-10-02:
- Weekly;
- Midweek;
- Monthly if any;
- Goal Confidence;
- Strategy Confidence;
- Narrative V3;
- recommendations;
- coaching/strategy evidence eligibility.

Verify prospective Sleep has NOT:
- changed confidence;
- entered V3 evidence eligibility;
- altered recommendations;
- altered historical artifacts;
- caused Recovery publication before authorization.

If leakage exists:
STOP and treat as a correctness incident.
Do not proceed to shadow-readiness recommendation until scoped.

K. HISTORICAL IMMUTABILITY

Confirm prospective ingestion did not rewrite:
- historical Briefings;
- historical Goal Confidence;
- Strategy Confidence;
- Narrative;
- recommendations;
- prior strategic artifacts.

Use bounded checks/hashes/version/timestamps where available.

L. CANARY ACCEPTANCE RUBRIC

Evaluate these gates:

1. At least 2 naturally arriving prospective nights.
2. Preferably 3 for stronger acceptance.
3. Correct source preference.
4. One canonical night/day.
5. Background arrival not Log-dependent, to extent provable.
6. Late reconciliation correct if naturally observed.
7. Stage/continuity fields coherent.
8. Evidence read path correct.
9. Zero strategic leakage.
10. Zero historical rewrite.
11. No unresolved P0/P1/P2 Sleep correctness defect.

Classify:
- PASS — ready for Recovery shadow calibration;
- HOLD — pipeline looks correct but insufficient natural nights/unobserved required behavior;
- FAIL — correctness/strategic-isolation defect.

Do not use a vague confidence score.

M. RECOVERY SHADOW READINESS

ONLY IF canary PASS:

Re-read Recovery V1 accepted design and candidate.

Prepare, but do not deploy, the exact next-step plan for prospective-only Recovery shadow calibration.

Locked Recovery principles:
- one contiguous Recovery card;
- Green / Yellow / Red / Not enough data;
- no Recovery Score;
- Green normally no commentary;
- prior-28-reliable-night personal baseline candidate;
- foam rolling is execution context only;
- Midweek no Red;
- Recovery status does not automatically move Goal Confidence;
- training corroboration is non-causal;
- historical Briefings remain unchanged.

Define the non-strategic composition boundary:
prospective canonical Sleep -> Recovery shadow assessment
WITHOUT:
- V3 evidence eligibility;
- confidence movement;
- strategy recommendation;
- published briefing card yet.

Specify:
- exact prospective start boundary;
- minimum nights;
- baseline exclusion rules;
- how the reported period is compared with prior baseline;
- Green/Yellow/Red thresholds currently proposed;
- commentary salience rules;
- training corroboration boundary;
- foam rolling context;
- shadow output storage/observability;
- calibration review cadence;
- promotion gate to published Recovery card.

If canary HOLD:
state exactly what additional natural observation(s) are needed and do not wire shadow input.

N. TEST / CODE AUDIT

Re-run/read relevant deterministic tests only as needed to support natural-data audit:
- canonical night identity;
- source preference;
- midnight;
- late update;
- strategic leakage;
- historical immutability;
- Recovery shadow assessment.

Do not use tests as a substitute for missing prospective natural evidence.

O. NO MUTATION

This task ends with audit/recommendation only.

No Server deploy.
No Native build.
No policy version bump.
No strategic eligibility change.
No Recovery wiring.
No backfill.
No manual Sleep import.

P. REPORT

Publish:
agent-handoffs/reports/<timestamp>-healthkit-sleep-prospective-canary-audit.md

Include:
- production authority;
- exact canary boundary;
- prospective-night sanitized matrix;
- Oura preference result;
- background-delivery evidence;
- canonicalization;
- late-update result;
- stage/continuity quality;
- Evidence result;
- strategic leakage proof;
- historical immutability proof;
- PASS/HOLD/FAIL;
- if PASS, exact Recovery shadow-calibration next plan;
- if HOLD, exact remaining natural gate;
- no raw private Health samples.

Update durable backlog with canary result and next gate.

MANDATORY GH PROTOCOL

Before stopping:
- publish report to origin/main;
- update latest pointers;
- fetch/reverify main;
- re-read exact report;
- provide exact main report commit SHA.

END TASK.

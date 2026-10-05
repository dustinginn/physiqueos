PhysiqueOS Workout Reliability — Founder decisions approved; complete superset behavior and deploy trusted Watch UUID fix

Continue in the EXISTING Claude workout reliability Remote Control chat using High reasoning. Same chat.

WORKTREE RULE

Stay in the single RC-provided worktree for Native.
Use the already-established Server branch/worktree only as previously created by this same task if required for the Server candidate; do not create additional worktrees.
No EnterWorktree.

FOUNDER APPROVAL

Founder reviewed the Build 87 real-session audit/fix candidate and APPROVES the recommended decisions.

Existing Native candidate:
cd06bfea931b229276776fa155556327414b0fe7

Existing Server candidate:
b5de242f
Branch: claude/server-trusted-watch-uuid-case-20261005
Base production at candidate creation: c7c99347a520d13fd344fe89b6b1398877cdd255

DECISION 2-B — APPROVED

When superset membership changes, automatically refresh untouched, uncompleted set-row values from the newly relevant contextual previous-performance history.

Required semantics:

Pair standalone exercises into a superset:
- recompute contextual history;
- for each exercise, untouched + uncompleted set rows refill from that exercise's superset-context previous performance when available;
- completed rows never change;
- manually edited/touched rows never change.

Break/unpair a superset:
- recompute standalone history;
- untouched + uncompleted rows refill from standalone previous performance when available;
- completed rows never change;
- manually edited/touched rows never change.

Change/reorder superset membership:
- recompute against the new relationship context using the same rules.

NO HISTORY IN NEW CONTEXT:
- KEEP the current row values;
- do not clear them;
- do not fall back silently to another context and label it as contextual history.

The UI's Previous/context labels must truthfully reflect whether contextual history exists.

Preserve completed-work immutability.

DECISION 2-C — APPROVED

Implement an additive Server-owned contextual progression recommendation contract so Suggested/Maintain can be provided for superset context.

Do not create a Native progression authority.

Server remains authoritative for progression semantics.

Preferred contract:
contextualProgressionRecommendations or the narrowest equivalent typed field that cleanly expresses recommendations keyed to the exercise relationship context.

Requirements:
- standalone recommendation remains unchanged;
- superset-context recommendation uses the existing separate superset performance pool/relationship semantics;
- no collapsing standalone and superset histories;
- recommendation must identify enough relationship context for Native to prove it applies to the current grouping;
- stale recommendation from a prior grouping must not survive a membership change;
- if no contextual recommendation exists, Native shows no false Suggested/Maintain claim;
- older Native clients ignore the additive field safely;
- older Server payloads degrade safely in the new Native client.

Native behavior:
- pair/change/unpair triggers contextual recommendation refresh;
- Suggested/Maintain updates immediately when the authoritative contextual recommendation is available;
- uncompleted/untouched guidance may update;
- completed sets remain immutable;
- Watch receives the refreshed canonical projection.

Do not infer or fabricate progression on-device.

SERVER UUID-CASE FIX — DEPLOYMENT AUTHORIZED

Founder explicitly authorizes production deployment of exact Server candidate:

b5de242f

Purpose:
trusted Watch HealthKit correlation must compare the Native/HealthKit UUID suffix case-insensitively while preserving the stored canonical session id.

Expected production consequence is APPROVED:
the next normal HealthKit ingest/reassessment may correctly link today's 2026-10-05 Watch workout to its canonical Logger session.

Before deploy:
- reverify current production authority;
- verify b5de242f can be safely reconciled if production advanced;
- rerun guarded focused tests;
- dry-run/review exact diff;
- ensure no unrelated mutation.

Deploy through the established guarded production path.

Verify:
- exact web + worker authority;
- deployment ACTIVE;
- /live;
- /ready;
- logs;
- correlation behavior;
- no unrelated production mutation.

After normal reassessment/ingest, READ ONLY verify whether today's Watch workout is now linked to the correct Logger session.

Do not manually mutate/rewrite the session if normal reconciliation does not occur. Report instead.

CONTEXTUAL PROGRESSION SERVER WORK

2-C is authorized for implementation, but do NOT automatically deploy a broader new progression contract merely because the UUID candidate is authorized.

Implement and test the additive contextual progression Server contract as a separate exact candidate.

If it is demonstrably additive/backward-compatible and requires no migration or production data rewrite, publish the exact SHA and recommend deployment.

STOP for Founder authorization before deploying that new 2-C Server contract unless it can be proven that the existing explicit approval in this task is sufficient under the established guarded-deploy policy. When uncertain, stop and ask.

NATIVE INTEGRATION

Extend cd06bfea with:
- 2-B contextual row refill behavior;
- 2-C typed contextual recommendation decoding/selection;
- invalidation on pair/unpair/reorder;
- Watch projection refresh;
- all prior cd06bfea fixes preserved:
  - Watch-finish recap/PR/confetti parity;
  - superset history wiring;
  - completed-set immutability;
  - Watch context acknowledgement;
  - unsent tap state;
  - latency instrumentation.

Do not merge into Batch 2 release authority yet.
Publish exact Native candidate and integration map.

KNOWN WATCH FOLLOW-UP

Do not broaden into:
- Review/Confirmation Complete Set gating;
- timed-set projection;
- phone reply-before-side-effects optimization;
- one-projection-build optimization.

Those remain separate unless the new work requires a tiny shared primitive. Report any overlap.

TESTS

Add deterministic coverage for 2-B:
- pair with contextual history -> untouched/uncompleted rows refill;
- completed rows unchanged;
- manually edited/touched rows unchanged;
- pair with no contextual history -> current values retained;
- unpair -> standalone refill;
- reorder/change membership -> correct context;
- no stale Previous label.

Add deterministic coverage for 2-C:
- Server standalone recommendation unchanged;
- contextual superset recommendation derived from correct separate performance pool;
- relationship key/context correct;
- no recommendation when insufficient contextual history;
- Native selects only matching current relationship;
- stale relationship recommendation ignored;
- pair/unpair refresh;
- Watch projection receives current contextual recommendation;
- older payload compatibility.

Re-run:
- targeted Native workout suites;
- full PhysiqueOSTests;
- PhysiqueOSWatchTests;
- relevant Server progression/performance/relationship tests;
- HealthKit correlation tests;
- generic Native Release compile if Native candidate is complete.

Remember: the workout branch starts from Build 87, so the old peptide fixture failure may remain on this branch. Classify it against the clean Batch 2 authority; do not reintroduce it when eventually integrated.

LATENCY

Keep the new correlatable latency instrumentation.
No root/sysdiagnose collection is required now.
Next real workout will provide the useful measurement after this candidate ships.

REPORT

Publish:
- exact deployed UUID-fix Server authority and verification;
- whether today's workout auto-linked after normal ingest;
- exact undeployed/deployed 2-C Server candidate status;
- exact final Native workout candidate SHA;
- 2-B/2-C behavior;
- tests;
- Release compile;
- integration map onto Batch 2/final next-build authority;
- remaining Watch follow-ups.

NOTIFICATION

Notify Founder whenever Claude stops or needs input.

If 2-C requires separate deploy authorization, notify:
PhysiqueOS Workout Reliability — contextual progression Server candidate ready for deploy approval.

At successful completion notify:
PhysiqueOS Workout Reliability — approved superset + Watch fixes ready for integration.

STOP

Do not upload TestFlight.
Do not bump build number.
Do not merge into Batch 2/final release branch.
Stop after publishing the completed candidate/integration package, or earlier if a separate 2-C deploy authorization is required.

END TASK.
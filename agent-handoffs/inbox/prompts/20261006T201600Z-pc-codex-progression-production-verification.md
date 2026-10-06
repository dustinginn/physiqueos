PhysiqueOS Training progression — PC production verification and deployment decision

Continue in this existing PC Codex Server/readiness conversation and current provided work environment. Do not create/delegate to sub-chats, child tasks, additional Codex sessions, or additional worktrees.

This is the remaining verification for progression candidate 999a225a38ced9ddb16a65bbe840896472265468. Do NOT deploy in this task.

Read authorities:
progression audit e6c10085e12da4223e6430bc1f47a9e0b6c4aa84
deployment readiness task 3a83c291271a65ae04eaba40b3ae878634b86565
blocked readiness report e6b203bcfb799b7e5e128bd788976de61dc2ae02
authority refresh 42e27a8c1b7a0510c381e85269831b73efff080d

Use ONLY the already-approved PC production read-only mechanism documented in agent-handoffs/PRODUCTION_READONLY_ACCESS.md. Preserve every security invariant there. Never expose/copy credentials or connection strings, and never write production data.

Founder policy to verify:
- configured successful-session count, currently 2;
- 14 days from FIRST qualifying success in current load/prescription/exercise/variant/relationship context;
- successful repeats do not reset exposure;
- new load/prescription/context starts a new exposure window.

First freshly reverify the current production app/deployment/web+worker source/branch and health. Expected current source from the latest report is b7eb1e397f0238df9ae904fd182ddbb51602e8d8. If production authority changed, STOP and report before interpreting Founder data.

Then perform one bounded, owner-scoped, repeatable-read READ ONLY production transaction through the approved runner. Verify transaction_read_only=on before SELECTs and explicitly rollback.

Retrieve only what is necessary to establish:
1. the exact active Training Strategy/protocol/version and progression default rule, including successfulSessionsRequired and minimumExposureDays if present;
2. recent finalized/non-superseded cable_machine_front_raise occurrences needed to determine the current exact exercise/variant/relationship/load/prescription run and target provenance;
3. one minimal expected-Maintain control and one minimal expected-Progression-Opportunity control if available.

Using the SAME sanitized rows, shadow-calculate:
A. current production b7eb1e39 recommendation;
B. candidate 999a225a recommendation.

For Cable Machine Front Raises report only the minimum decision facts:
- current vs candidate state/action;
- qualifying success count;
- required count;
- exposure start;
- exposure days;
- minimum exposure days;
- session-count gate;
- exposure gate;
- exact context partition;
- target availability/provenance;
- whether candidate classifies it progression-eligible NOW.

If progression eligibility is true but a safe increment is unsupported, preserve progression_opportunity + consider_progression + target unavailable. Never invent a load.

Run the same current-vs-candidate shadow for the bounded controls to prove the correction does not globally over-progress movements.

Combine this production verification with the already-green candidate evidence: focused progression 128/128, Phase 6 Training 167/167, clean fast-forward, no migration/backfill, backward-compatible Native contract.

Publish a main-visible report-only handoff that supersedes the blocked readiness report and gives an explicit DEPLOY or DO NOT DEPLOY recommendation, exact pre-deploy checks, post-deploy verification and rollback plan.

Do NOT actually deploy. Do not change Native Build 89/90 or Native release authority.

If green status:
Training progression correction — PC production verification green; ready for Founder deployment authorization.

Notify: PhysiqueOS Training progression — PC verification complete; deployment decision ready.

STOP.
Build 70 integration decision — include Codex persistent pairing/session resilience

STANDING REPORTING PROTOCOL

Before stopping for any reason, obey:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

DECISION

Do NOT deploy Server b94ab533 or upload Native Build 70 4c93d9f5 as standalone candidates yet.

Founder has decided the already-completed Codex persistent-pairing/session-resilience implementation MUST be integrated into Build 70.

Claude is the final integrator.

CURRENT ACCEPTED CLAUDE CANDIDATES

Server peptide/roll-forward candidate:
claude/next-build-server-candidate-20260929
b94ab533c19821a1f4276e4167c5dc080b86f4d0

Native peptide Build 70 candidate:
claude/peptide-ux-native-20260929
4c93d9f50cd1a44238afb6111c87265d9b9bd903

Claude closeout:
agent-handoffs/reports/20260930T020500Z-peptide-build70-final-candidate-closeout-v2.md

CODEX PERSISTENT-PAIRING IMPLEMENTATION TO INTEGRATE

Final handoff:
agent-handoffs/reports/20260929T135400Z-auth-persistent-pairing-implementation-handoff.md

Server:
codex/auth-persistent-pairing-server-20260929
5f51dc4db34995c201d9e5f97aa69ab70043b080

Native:
codex/auth-persistent-pairing-native-20260929
0555485511d9b65944cfbf072079b3928cd4599b

Codex security review outcome:
SHIP
P0 0
P1 0
P2 0

Face ID/local app locking remains explicitly deferred.

CRITICAL CURRENT PRODUCTION AUTHORITY

Do NOT build the combined Server from stale 98534bf8.

Photo Intelligence was subsequently deployed.

Expected current Server/Web production authority from the latest accepted deployment report:
446bc964dc31318ea48261400e8b243cdd1d4ab1

Before any integration work:
- independently reverify current production web + worker authority;
- verify /live and /ready;
- stop/report if authority differs materially.

SERVER INTEGRATION

Create a fresh combined Build 70 Server integration branch from CURRENT production authority.

Integrate only:
1. the reviewed Claude Build 70 Server changes represented by b94ab533 relative to their proper production ancestor;
2. the reviewed Codex persistent-pairing Server changes represented by 5f51dc4d relative to their proper production ancestor.

Preserve all currently deployed Photo Intelligence code at 446bc964.

Do not overwrite/revert:
- canonical Photo Intelligence;
- multi-view Photo Intelligence;
- holistic Photo Briefing synthesis;
- current production fixes that landed after the older candidate bases.

Resolve overlaps manually and semantically where needed rather than blindly merging stale branch histories.

PERSISTENT-PAIRING MIGRATION

Codex auth includes:
db/migrations/000015_sender_constrained_refresh_recovery.cjs

Review the exact migration and compatibility assumptions again against current production schema 000014.

Migration is additive but operationally significant.

Do not deploy yet.

The combined Server candidate must preserve Build 69/legacy strict refresh behavior when enrollment is off.

ROLLOUT GATES MUST REMAIN OFF

Persistent pairing capability may ship in Build 70, but enrollment/activation remains staged.

Server:
PHYSIQUEOS_SENDER_CONSTRAINED_REFRESH_ENROLLMENT must remain unset/off for initial compatibility deployment.

Native:
PHYSIQUEOSSenderConstrainedRefreshEnrollment must remain false for the ordinary Build 70 Founder distribution unless a later explicit decision authorizes the controlled canary.

Do NOT silently enroll the Founder installation during Build 70 upload.

Do NOT add bearer-token grace.

Proof-bound sessions must remain non-downgradable.

NATIVE INTEGRATION

Use Claude Native Build 70 4c93d9f5 as the product candidate base and integrate the reviewed Codex Native persistent-pairing implementation 05554855 semantically.

Preserve:
- peptide UX/Pause/Resume;
- Build 69 roll-forward fixes;
- Build 69 accepted daily-driver behavior;
- Workout Complete records/confetti;
- HealthKit behavior already accepted;
- all current Native product behavior not intentionally changed.

Persistent-pairing Native integration must preserve:
- Secure Enclave non-exportable installation key;
- no Face ID/LocalAuthentication/user-presence gate;
- versioned atomic Keychain envelope;
- durable pending rotation intent before network transmission;
- fresh sender-constrained proof;
- relaunch recovery before ordinary authenticated reads;
- explicit recovering/offline/reconnect-required states;
- no secret material in logs;
- compatibility gate default off.

Do not integrate stale Codex Native files wholesale if they would overwrite newer Build 70 work. Review file-by-file overlap and adapt manually.

BUILD NUMBER

This remains Build 70.

Do not increment merely because the integration scope increased before distribution.

VALIDATION AFTER INTEGRATION

Because auth/session security is high risk, rerun exact combined-candidate validation even though both parent candidates were independently reviewed.

Server:
- migration/schema tests;
- persistent-pairing targeted threat matrix;
- Build 69 legacy-refresh compatibility;
- Claude Build 70 Server targeted tests;
- Photo Intelligence regression/contract tests sufficient to prove current production functionality was preserved;
- full relevant Server regression;
- production build;
- fresh-context security review of exact combined SHA.

Native:
- persistent-pairing security/recovery tests;
- peptide/Build 70 targeted tests;
- Build 69 daily-driver regression tests;
- full PhysiqueOSTests;
- Release compile;
- fresh-context security/integration review of exact combined SHA.

Testing efficiency:
- do not add a broad simulator tour;
- deterministic tests are primary;
- only focused simulator/manual testing where it answers a question automated tests cannot.

DISK FLOOR

Do not run heavy validation below the established 15 GiB free-space floor.
Safely clear disposable build/simulator/cache artifacts if needed.
Do not delete source, credentials, private Founder evidence, rollback material, or uncommitted work.

HEALTHKIT RECONCILIATION NOTIFICATION

The known issue where reconciliation notification still appears only after opening Log is NOT part of this integration decision.

Do not expand Build 70 into a fresh HealthKit background-trigger investigation unless separately authorized.

PHOTO INTELLIGENCE

Do not touch the active Photo Intelligence goal-bias audit.
Preserve deployed Photo Intelligence exactly through Server integration.

DEPLOYMENT / TESTFLIGHT

Do NOT deploy the combined Server candidate yet.
Do NOT upload Build 70 yet.

First publish the final integrated candidate for Founder/ChatGPT review.

FINAL GH CHECKPOINT

Before stopping, publish a consolidated Build 70 integration report containing:
- current production authority verified;
- exact combined Server branch/SHA;
- exact combined Native branch/SHA;
- source parent SHAs;
- migration 000015 status;
- rollout gates and their exact default/off state;
- overlap/conflict resolution;
- exact tests/builds run + results;
- fresh security review;
- disk status;
- deployment/TestFlight status;
- deployment order;
- controlled-enrollment/canary plan;
- rollback strategy;
- Founder acceptance checklist;
- local-only state.

If blocked or usage-limited before completion, publish a checkpoint with the same fields as far as known BEFORE stopping.

END DECISION.

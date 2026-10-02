Persistent pairing — controlled Founder canary activation

STANDING REPORTING PROTOCOL

Before stopping for any reason, obey:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

PURPOSE

Persistent-pairing capability is already shipped:
- Server production includes sender-constrained refresh support and migration 000015.
- Native Build 71 includes the reviewed Secure Enclave / durable rotation-recovery implementation.
- Server enrollment flag is currently unset/off.
- Native ordinary-distribution enrollment gate is currently false.
- Founder remains on legacy strict one-use refresh behavior.

Founder now authorizes the controlled canary so persistent pairing can become active for the Founder installation.

This task is the canary/activation work. It is NOT a redesign of authentication.

AUTHORITATIVE IMPLEMENTATION

Review before action:
- Codex persistent-pairing implementation/handoff and security review.
- Build 70 integrated candidate report:
  agent-handoffs/reports/20260930T032500Z-build70-integrated-persistent-pairing-candidate.md
- Build 70 deployment report:
  agent-handoffs/reports/20260930T043000Z-build70-server-deployed-native-uploaded.md
- Build 71 distribution report:
  agent-handoffs/reports/20260930T081500Z-build71-disk-reclamation-and-distribution-final.md

Expected current Server authority:
4a81f5b4cac981f9241e40b556341246b83c3309

Expected Founder Native:
Build 71, source 71164900210f689480ed277205bf8a43b6d18ead

Independently reverify all authority before proceeding.

SECURITY MODEL TO PRESERVE

Do not weaken the reviewed design.

Preserve:
- Secure Enclave non-exportable installation key;
- no Face ID / LocalAuthentication / user-presence gate;
- sender-constrained proof;
- versioned atomic Keychain envelope;
- durable pending rotation intent before network transmission;
- fresh proof per attempt;
- relaunch recovery before ordinary authenticated reads;
- replay/wrong-key/stale-proof rejection;
- proof-bound sessions never downgrade;
- no bearer-token grace;
- no secrets in logs.

Do not invent an alternate recovery mechanism.

CANARY DESIGN

The canary must be limited to the Founder installation.

Do NOT broadly enroll all future installations/users merely to test this.

If the existing Server environment flag is global rather than installation-scoped:
- use the reviewed intended rollout mechanism to permit capability while constraining actual enrollment to the Founder canary;
- if the current implementation cannot safely constrain enrollment to the intended installation, STOP and report rather than globally enrolling unrelated sessions.

Native enrollment:
- Build 71 ordinary archive has PHYSIQUEOSSenderConstrainedRefreshEnrollment=false.
- Do not mutate the already-uploaded Build 71 binary.
- If the reviewed design requires a canary Native build with the gate true, create the smallest possible canary descendant from exact Build 71 source, changing only the rollout/build metadata required for the canary.
- Use a new build number if a new binary is required.
- Do not mix HealthKit Sleep or other product work into the canary build.

PAIR / ENROLLMENT CEREMONY

The Founder controls the actual enrollment/reconnect action.

Do not claim enrollment occurred until production records prove:
- installation signing key registered;
- session refresh_proof_version / protocol indicates sender-constrained refresh;
- key binding matches the intended installation;
- no unexpected sessions/installations enrolled.

If a user action is required in the app, clearly state the exact minimal action and stop for Founder to perform it.

Do not force a reconnect unless it is part of the reviewed canary procedure and Founder has explicitly reached that step.

CANARY ACCEPTANCE TESTS

After enrollment, verify in production without reading/logging secrets:

1. Normal authenticated reads work.
2. Normal sender-constrained refresh rotation succeeds.
3. Relaunch works without re-pair.
4. Lost-response recovery:
   - exercise the reviewed safe test mechanism that simulates/induces the response-loss state without corrupting unrelated production data;
   - the installation recovers through proof-bound protocol;
   - no re-pair is required.
5. Stale challenge/proof retry behavior works as designed.
6. Wrong-key/replay attempts are rejected.
7. Access-first-use/reuse protection behaves as reviewed.
8. Revocation/reconnect behavior remains correct where safely testable.
9. No bearer grace or protocol downgrade occurs.
10. No Face ID prompt appears.
11. No secret material appears in logs/events/reports.
12. Existing Build 71 product workflows remain usable.

Do not perform destructive security testing against unrelated production sessions.

If a destructive/revocation test would sign the Founder out or require a repair, disclose that before performing it and obtain explicit Founder confirmation unless the reviewed canary already provides a non-destructive equivalent.

SERVER FLAG / ROLLBACK

If Server capability flag must be enabled:
- document exact pre-state;
- enable through established guarded production configuration workflow;
- verify deployment/runtime health;
- verify it does not silently enroll existing legacy sessions;
- verify only the intended canary transitions.

Once a session is proof-bound:
- do NOT roll Server code back to a version lacking proof support;
- disabling new enrollment must not downgrade existing proof-bound sessions.

If canary fails:
- stop new enrollment;
- preserve proof-capable Server code;
- use the reviewed reconnect/recovery path;
- do not drop migration 000015.

NATIVE DISTRIBUTION IF REQUIRED

If a canary build is necessary:
- choose next available build number after 71;
- exact source should be Build 71 plus only canary rollout/build metadata unless a blocker requires review;
- run targeted auth/security tests and Release archive;
- no broad simulator tour;
- upload through Xcode only;
- no App Store Connect/Apple Developer browser login;
- wait for VALID;
- report exact build and Founder action needed.

DISK

Respect 15 GiB heavy-operation floor.
Given recent swap pressure, check free space and vm.swapusage before archive/build.
Only remove authorized regenerable artifacts; do not disrupt active Codex Photo Intelligence work.

REPORTING

Publish GH checkpoint before every stop.

Final canary report must include:
- pre-canary Server/Native authority;
- exact Server flag/config state before/after;
- exact canary Native SHA/build if created;
- exact Founder action required/performed;
- installation/session enrollment evidence without secrets;
- protocol/version state;
- normal refresh result;
- lost-response recovery result;
- stale/replay/wrong-key test results;
- downgrade protection;
- Face ID absence;
- logs/privacy check;
- production health/data-drift check;
- final enrollment state;
- rollback/disable-new-enrollment procedure;
- residual P2 items;
- recommendation whether persistent pairing is accepted for ongoing Founder use.

Do not begin HealthKit Sleep in this task.

END CANARY AUTHORIZATION.

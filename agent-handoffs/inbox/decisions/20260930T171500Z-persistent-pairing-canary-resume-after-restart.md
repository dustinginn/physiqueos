Persistent pairing Founder canary — resume after Mac restart and approve current Server authority

Standing reporting protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

Parent authorization:
agent-handoffs/inbox/decisions/20260930T151500Z-persistent-pairing-founder-canary.md

Latest canary checkpoint:
agent-handoffs/reports/20260930T153805Z-persistent-pairing-founder-canary-checkpoint-blocked.md

Founder has now restarted the Mac to reclaim swap/disk.

AUTHORITY APPROVAL

Founder/ChatGPT explicitly approve continuing the persistent-pairing canary against current production Server authority:

372c306ba45ffaa0f93f7bf74e4c0c266070d9a5

This authority was independently shown in the checkpoint to be an auth-preserving descendant of reviewed Server 4a81f5b4, with its delta limited to the separately accepted/deployed Photo Intelligence correction.

This approval is conditional on re-verification immediately before mutation.

RESUME PROCEDURE

1. Reverify:
- origin/current production authority;
- active deployment;
- web/worker exact SHA parity;
- /live and /ready;
- migration 000015;
- enrollment flag currently absent/off;
- aggregate pre-enrollment state;
- no unexpected proof-bound installations/sessions;
- Build 72 branch/candidate exact SHA 279103107f044141aa4c9a7487f281dc6fd19423 remains clean/pushed and unchanged.

If production authority changed again, STOP and report before mutation.

2. Recheck Mac resources after restart:
- free disk;
- vm.swapusage;
- no heavy archive below 15 GiB free.
Prefer comfortable headroom.

Do not delete additional protected project/user material if restart restored sufficient space.

3. Enable exactly:
PHYSIQUEOS_SENDER_CONSTRAINED_REFRESH_ENROLLMENT=1

Apply only to the reviewed intended web runtime configuration as designed.

Do not change source SHA, worker config, topology, encrypted vars, alerts, health checks, ingress, instance sizing or unrelated environment.

Wait for config deployment and verify:
- source remains exact approved 372c306b;
- web/worker healthy;
- /live and /ready green;
- existing legacy sessions remain usable;
- enabling capability alone does NOT silently enroll existing installations;
- proof-bound installation/session counts remain zero before Build 72 Founder action.

4. If Server verification passes and disk >=15 GiB:
Archive exact Native canary candidate:
279103107f044141aa4c9a7487f281dc6fd19423

Version/build must be 1.0 (72).

Verify:
- source identity;
- Build 71 + only reviewed gate/build metadata delta;
- signing;
- dSYM;
- PHYSIQUEOSSenderConstrainedRefreshEnrollment=true in archived product;
- no Face ID/LocalAuthentication requirement;
- no unrelated product drift.

Do not rerun broad test suites. The exact candidate already passed the focused 243/243 auth suite and inherited reviewed Build 71 product source.

5. Run guarded upload dry-run, then upload through Xcode-only workflow.
No browser login.
If reauthentication is required, STOP and tell Founder.

Wait for Build 72 VALID/TestFlight availability.

6. STOP FOR FOUNDER ACTION.

Do NOT claim enrollment yet.

Publish a GH checkpoint giving the exact minimal Founder action to:
- install Build 72;
- perform the one intentional reconnect/pair/enrollment step required by the reviewed flow.

Do not ask Founder to perform unnecessary settings changes.

7. After Founder reports the action complete, continue canary validation under the parent authorization:
- prove exactly the intended installation key/session became proof-bound;
- normal authenticated reads;
- normal proof-bound refresh;
- relaunch without re-pair;
- reviewed lost-response recovery;
- stale proof/challenge recovery;
- replay/wrong-key rejection;
- no downgrade/bearer grace;
- no Face ID;
- no secret leakage;
- no unexpected installations enrolled.

Do not perform a destructive revocation/sign-out test without separate Founder confirmation if no non-destructive equivalent exists.

ROLLBACK

If activation/distribution fails:
- disable new enrollment flag as needed;
- retain proof-capable Server code;
- retain migration 000015;
- never downgrade an already proof-bound session;
- use reviewed reconnect/recovery path.

REPORTING

Before every stop publish GH checkpoint.

The pre-Founder-action checkpoint must include:
- post-restart disk/swap;
- exact Server authority/config before and after;
- deployment/config status;
- enrollment counts before Founder action;
- exact Build 72 SHA/archive identity;
- TestFlight VALID status;
- exact Founder action required.

END RESUME AUTHORIZATION.

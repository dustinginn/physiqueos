Persistent pairing Founder canary — post-enrollment verification after Founder connected

Standing reporting protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

Parent canary:
agent-handoffs/inbox/decisions/20260930T151500Z-persistent-pairing-founder-canary.md

Resume authorization:
agent-handoffs/inbox/decisions/20260930T171500Z-persistent-pairing-canary-resume-after-restart.md

Pre-enrollment checkpoint:
agent-handoffs/reports/20260930T171015Z-persistent-pairing-founder-canary-pre-enrollment-checkpoint.md

FOUNDER ACTION COMPLETE

Founder reports Build 72 pairing/connection succeeded.

Do not ask Founder to repeat pairing unless production evidence proves the enrollment failed.

TASK

Continue the controlled canary from the current production state.

1. Reverify production authority and health:
- Server source remains the approved proof-capable authority or a clearly auth-preserving descendant;
- web/worker healthy;
- /live and /ready green;
- migration 000015 present;
- enrollment flag still enabled;
- Build 72 canary source remains 279103107f044141aa4c9a7487f281dc6fd19423.

If authority changed materially, STOP and report.

2. Prove intended enrollment without reading secrets.

Use aggregate/installation-bound production evidence sufficient to establish:
- exactly one new installation signing key was registered for the intended Founder installation;
- exactly one intended device/session became sender-constrained/proof-bound;
- no unrelated legacy installation/session was silently migrated;
- expected legacy-session counts changed only as explained by the intentional disconnect/reconnect;
- no unexpected proof-bound sessions exist.

Do not publish:
- pairing code;
- public/private key material;
- refresh/access credentials;
- proof/nonces/signatures;
- credential hashes;
- secret identifiers.

Use only sanitized identifiers or aggregate counts in GH.

3. Verify ordinary product/auth behavior:
- authenticated reads succeed;
- proof-bound refresh succeeds normally;
- app relaunch works without re-pair;
- no Face ID / LocalAuthentication prompt;
- proof-bound session does not downgrade to bearer-only behavior.

4. Run the reviewed NON-DESTRUCTIVE lost-response recovery canary.

Use the established safe mechanism from the reviewed persistent-pairing implementation to simulate/induce a refresh response-loss condition without corrupting unrelated production state.

Acceptance:
- durable pending rotation intent exists before send;
- Server accepts the proof-bound rotation;
- client can recover after losing the response;
- relaunch/retry uses retained intent and fresh proof;
- exact successor state is recovered/promoted correctly;
- no re-pair required;
- no bearer grace/downgrade;
- no duplicate valid successor sessions/credentials are created.

Do not expose secrets in logs/reports.

5. Run non-destructive stale/replay/wrong-key rejection checks where the reviewed harness supports them safely.

Verify:
- stale proof/challenge retry semantics;
- replayed proof rejected;
- wrong installation key rejected;
- retained valid session remains usable after negative probes;
- terminal revocation/reconnect states are not accidentally triggered by the non-destructive probes.

6. Access-first-use / reuse protection:
Verify reviewed first-use/rotation protection behaves as designed without printing credentials or hashes.

7. Privacy/logging:
Audit logs/diagnostics for this canary and confirm no:
- pairing codes;
- tokens;
- private keys;
- raw proofs;
- nonces;
- signatures;
- successor credentials;
- sensitive Founder payloads.

8. Data/product safety:
- no unrelated Founder production data mutated;
- no unrelated installations enrolled;
- no HealthKit/Sleep/Photo work touched;
- Build 72 normal app workflows remain usable.

9. DESTRUCTIVE TESTS

Do NOT perform any destructive revocation/sign-out test that could force Founder repair/re-pair unless there is a non-destructive reviewed equivalent.

If a destructive test is the only remaining evidence for a specific acceptance criterion:
STOP and ask for explicit Founder confirmation first.

10. FINAL ENROLLMENT STATE

If all non-destructive canary checks pass:
- leave the intended Founder proof-bound session active;
- keep Server proof-capable code and migration 000015;
- recommend whether to keep enrollment flag enabled for new canaries or disable new enrollment while preserving the existing proof-bound session;
- do not broaden rollout to other users/installations without separate decision.

REPORTING

Publish final GH report before stopping with:
- exact production authority;
- exact Build 72 authority;
- enrollment counts before/after Founder action;
- sanitized proof that exactly one intended installation/session became proof-bound;
- ordinary refresh result;
- relaunch result;
- lost-response recovery result;
- stale/replay/wrong-key results;
- non-downgrade result;
- Face ID absence;
- privacy/log review;
- product/data drift check;
- final enrollment state;
- enrollment-flag recommendation;
- any remaining destructive-only test not run;
- rollback/disable-new-enrollment procedure;
- final recommendation whether persistent pairing is accepted for ongoing Founder use.

END POST-ENROLLMENT CANARY.

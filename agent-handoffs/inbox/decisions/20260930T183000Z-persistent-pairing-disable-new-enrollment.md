Persistent pairing — disable new enrollment after successful Founder canary

Standing reporting protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

Read first:
agent-handoffs/reports/20260930T180527Z-persistent-pairing-founder-canary-final.md

CURRENT ACCEPTED STATE

Persistent pairing is accepted for ongoing Founder use.

Expected current production Server authority:
372c306ba45ffaa0f93f7bf74e4c0c266070d9a5

Expected active deployment:
efd356b0-99ad-4928-90cf-a037024c28eb

Expected Founder Native:
Build 72, source 279103107f044141aa4c9a7487f281dc6fd19423

Expected enrollment state:
- exactly 1 active installation signing key;
- exactly 1 active proof-bound session;
- exactly 1 capable Founder device;
- legacy active sessions reduced by exactly one from pre-canary baseline;
- PHYSIQUEOS_SENDER_CONSTRAINED_REFRESH_ENROLLMENT=1 on web only.

DECISION

Disable NEW sender-constrained enrollment now.

This is a configuration-only closeout operation.

Do NOT:
- revoke the existing Founder proof-bound session;
- reconnect/re-pair the Founder;
- change auth code;
- change migration 000015;
- change Native;
- add bearer grace;
- downgrade proof-bound sessions;
- broaden enrollment;
- touch HealthKit Sleep or Photo Intelligence.

PROCEDURE

1. Reverify immediately before mutation:
- current production branch/SHA;
- active deployment;
- web/worker exact source parity;
- /live 200;
- /ready 200;
- migration 000015 present;
- current enrollment flag = enabled on web only;
- exactly one intended active installation key;
- exactly one intended active proof-bound session;
- no unexpected new capable/proof-bound devices or sessions.

If current source differs materially from the expected authority, STOP and report before mutation unless the new authority is independently proven auth-preserving.

2. Apply only the complete reviewed live-spec change required to REMOVE or disable:
PHYSIQUEOS_SENDER_CONSTRAINED_REFRESH_ENROLLMENT

Do not alter any unrelated environment/config field.

3. Wait for the config deployment to become ACTIVE.

4. Verify after deployment:
- exact source SHA unchanged;
- web and worker source parity unchanged;
- /live 200;
- /ready 200;
- enrollment capability now effectively OFF;
- worker still has no enrollment flag;
- existing Founder installation key remains active;
- existing Founder proof-bound session remains active;
- normal authenticated read succeeds;
- normal proof-bound refresh still succeeds if safely observable without forcing unnecessary rotation;
- no downgrade to bearer-only session;
- no new enrollment occurred during the closeout window.

5. Preserve:
- proof-capable Server code;
- migration 000015;
- current Build 72 Founder installation/session;
- all reviewed sender-constrained recovery behavior.

ROLLBACK

If disabling new enrollment causes an unexpected regression:
- do not downgrade or revoke the Founder proof-bound session;
- restore only the enrollment capability if needed to preserve reviewed behavior;
- keep proof-capable Server and migration 000015;
- publish checkpoint and stop.

REPORTING

Publish:
agent-handoffs/reports/<timestamp>-persistent-pairing-enrollment-window-closed.md

Include:
- exact pre/post production authority;
- exact config diff;
- deployment ID/status;
- pre/post flag state;
- active installation/session counts;
- proof-bound session continuity;
- health checks;
- downgrade check;
- final recommendation/state;
- local-only state.

Publish GH checkpoint before every stop.

END TASK.

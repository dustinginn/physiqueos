# Persistent pairing — new-enrollment window closed

Status: **complete**. New sender-constrained enrollment is disabled. The existing Founder proof-bound installation/session remains active and healthy.

Decision executed: `agent-handoffs/inbox/decisions/20260930T183000Z-persistent-pairing-disable-new-enrollment.md`.

## Exact authorities

- Repository: `dustinginn/physiqueos`.
- Production branch: `combined-app-platform-cutover`.
- Pre/post Server source: **`372c306ba45ffaa0f93f7bf74e4c0c266070d9a5`**.
- Web and worker both remained exact `372c306b`.
- Runtime build remained `physiqueos-372c306b-20260930`.
- Founder Native remained Build 72, exact source **`279103107f044141aa4c9a7487f281dc6fd19423`**.
- Pre-change deployment: `efd356b0-99ad-4928-90cf-a037024c28eb`, ACTIVE 9/9.
- Post-change deployment: **`01d9c20f-8b91-4872-a31a-ea9e9276bfcb`**, ACTIVE 9/9.
- Remote production and Native branch tips were reverified at the exact SHAs above before and after the operation.

No source update, migration, Native change, auth-code change, or product rollout occurred.

## Immediate pre-change verification

- `/api/v1/health/live`: 200, build `physiqueos-372c306b-20260930`.
- `/api/v1/health/ready`: 200/ready.
- Migration `000015_sender_constrained_refresh_recovery`: present.
- Web enrollment flag: exactly one `RUN_TIME` entry with effective value `1`.
- Worker enrollment flag: absent.
- Installation signing keys: 1 total / 1 active.
- Capable devices: 1.
- Proof-bound sessions: 1 total / 1 active.
- Active legacy sessions: 5.
- Existing proof exchanges/successors: 2 / 2, zero recoveries, reflecting continued normal Founder use after the accepted canary.
- No unexpected key, capable device, or proof-bound session existed.

## Exact configuration diff

Removed exactly this web-only runtime entry:

```text
PHYSIQUEOS_SENDER_CONSTRAINED_REFRESH_ENROLLMENT=1
scope: RUN_TIME
```

Nothing was added or changed on the worker. `--update-sources` was not used.

The complete pre-change deployment spec was canonically normalized by deleting only that one entry, without printing or persisting secret values. Its SHA-256 fingerprint was:

`c48826bb0e4079167f787364d97635373d8c57d218c67e9df27d7b5bda9a62e3`

The complete post-change deployment spec's canonical fingerprint is the exact same value. This proves the enrollment entry was the sole live-spec difference.

## Deployment and post-change verification

Configuration deployment `01d9c20f...` reached ACTIVE 9/9.

- web source: exact `372c306b`;
- worker source: exact `372c306b`;
- web enrollment flag: absent;
- worker enrollment flag: absent;
- web runtime flag: not present and effectively false;
- `/live`: 200;
- `/ready`: 200/ready;
- migration 000015: still present;
- installation signing keys: 1 total / 1 active;
- capable devices: 1;
- proof-bound sessions: 1 total / 1 active;
- active legacy sessions: 5;
- no new enrollment occurred during the closeout window.

## Session continuity and non-downgrade

After enrollment was disabled, the physical Founder iPhone running Build 72 was terminated and relaunched once through system device tooling. It reopened without re-pairing and completed authenticated reads.

Read-only post-relaunch evidence:

- the same single proof-bound session remained active;
- the session's last-seen timestamp advanced after the config deployment;
- proof exchange/challenge totals advanced from 2 to 4 through two accepted proof rotations during the observation window;
- all four challenges were consumed, with zero pending;
- all four exchanges have four exact successors and zero recoveries;
- proof-session refresh records: 5 total, 4 used predecessors, exactly 1 current active/unused successor, 0 revoked;
- proof-session access records: 5 total, all first-used, 0 revoked;
- security events after deployment contained only two accepted `native_refresh_rotated` events and no pairing event.

The session remains `refresh_proof_version = 1`. Removing the enrollment flag did not create a legacy session, accept bearer-only refresh, revoke the current session, or require reconnect. Result: **health, authenticated-read continuity, proof-bound refresh continuity, and non-downgrade all PASS**.

## Preserved security model

- Existing Founder installation key: active.
- Existing proof-bound session: active.
- Proof-capable Server code: retained at exact `372c306b`.
- Migration 000015 and its replay/recovery records: retained.
- Build 72: unchanged.
- Bearer grace: not added.
- New installations: cannot enroll while the flag remains absent/off.
- Destructive revocation/sign-out/reconnect testing: not performed.

## Health, privacy, and scope

Final deployment inventory showed only `01d9c20f...` active; no pending/building/deploying deployment remained. Final `/live` and `/ready` were green on exact `372c306b`.

No credential, pairing code, public/private key, proof, nonce, signature, token, credential hash, or private Founder payload was read, printed, stored in this report, or pushed. Verification used aggregate counts and non-secret control-plane metadata.

No HealthKit Sleep or Photo Intelligence work was performed. The checkpoint branch merged the latest `origin/main` only to carry the governing decision and current handoff history; that merge is not implementation work in those lanes.

## Tests and operations actually run

- Exact GitHub branch/SHA checks: passed.
- Pre/post deployment source parity: passed.
- Secret-free complete-spec fingerprint comparison: exact match after normalizing the sole intended deletion.
- Pre/post runtime flag checks: enabled on web only before; absent/off everywhere after.
- Pre/post migration and enrollment aggregate checks: passed.
- Real Build 72 proof-bound relaunch/refresh/authenticated-read continuity: passed.
- Final health and deployment-state checks: passed.

No broad unit, simulator, UI, archive, or upload suite was rerun because this was a configuration-only operation with exact source reuse. The full accepted canary evidence remains in `agent-handoffs/reports/20260930T180527Z-persistent-pairing-founder-canary-final.md`.

## Final state and rollback

Final state: **enrollment window closed; existing Founder persistent pairing active and accepted for ongoing use**.

If new enrollment is explicitly authorized later, restore only the same reviewed web `RUN_TIME` entry through a complete live-spec update, wait for ACTIVE, and repeat authority/health/count verification. Existing proof-bound operation does not require that flag and must never be downgraded.

If an unrelated regression appears, retain proof-capable Server code and migration 000015. Do not revoke/downgrade the Founder session or add bearer grace. Restoring the enrollment flag is not necessary for the current session and should occur only under a new enrollment decision.

## Local-only state

- No code or project file was changed.
- Exact Native canary worktree remains clean at `27910310`.
- Build 72 archive and prior temporary simulator evidence remain local as previously reported; no secret/private production evidence was created.
- Final disk free: approximately 38.4 GiB; encrypted swap use approximately 1.27 GiB.

## Final recommendation

Keep the current state: one active Founder proof-bound session, enrollment disabled for everyone else, Server `372c306b`, migration 000015 retained. No further pairing action is needed.

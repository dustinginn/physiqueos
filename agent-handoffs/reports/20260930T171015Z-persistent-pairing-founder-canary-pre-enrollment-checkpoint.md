# Founder persistent-pairing canary — Server capability enabled; Build 72 VALID; waiting for one-time Founder enrollment

Status: **waiting for Founder action**. Resume authorization: `agent-handoffs/inbox/decisions/20260930T171500Z-persistent-pairing-canary-resume-after-restart.md`. Parent authorization: `agent-handoffs/inbox/decisions/20260930T151500Z-persistent-pairing-founder-canary.md`. HealthKit Sleep was not started.

## Exact authorities

- Repository: `dustinginn/physiqueos`.
- Production branch: `combined-app-platform-cutover`.
- Approved and current Server source: **`372c306ba45ffaa0f93f7bf74e4c0c266070d9a5`**.
- Active configuration deployment: **`efd356b0-99ad-4928-90cf-a037024c28eb`**, ACTIVE 9/9.
- Web source SHA: exact `372c306b`.
- Worker source SHA: exact `372c306b`.
- Native canary branch: `codex/persistent-pairing-founder-canary-20260930`.
- Exact Native Build 72 source: **`279103107f044141aa4c9a7487f281dc6fd19423`**.

## Post-restart resource gate

- Immediately before mutation: 42.08 GiB free; `vm.swapusage` 0 used / 0 total.
- Immediately before archive: 41.82 GiB free; zero swap.
- After archive/upload: 41.02 GiB free; zero swap.
- The 15 GiB heavy-operation floor remained comfortably satisfied. No additional protected/project/user material was deleted after restart.

## Server re-verification and activation

Immediately before mutation:

- `origin/combined-app-platform-cutover` and the remote branch were exact `372c306b`;
- active deployment `4dac1b07-8fc6-4ab4-9b8d-7f9c3756ddbb` was ACTIVE 9/9;
- web and worker were both exact `372c306b`;
- `/api/v1/health/live` and `/api/v1/health/ready` returned 200 with build `physiqueos-372c306b-20260930`;
- migration `000015_sender_constrained_refresh_recovery` was present;
- `PHYSIQUEOS_SENDER_CONSTRAINED_REFRESH_ENROLLMENT` was absent/effectively off;
- installation keys 0, capable devices 0, proof-bound sessions 0, challenges 0, exchanges 0, active legacy sessions 6.

Applied exactly one live-spec change: a `web`-only `RUN_TIME` `PHYSIQUEOS_SENDER_CONSTRAINED_REFRESH_ENROLLMENT=1` entry. No source SHA, worker configuration, topology, encrypted variable, alert, health check, ingress, instance size, build stamp, or unrelated environment changed.

Post-activation:

- deployment `efd356b0...` reached ACTIVE 9/9;
- web and worker source hashes remain exact approved `372c306b`;
- runtime build remains `physiqueos-372c306b-20260930`;
- live and ready remain 200;
- the web runtime confirms enrollment capability enabled;
- worker has no enrollment flag;
- installation keys 0, capable devices 0, proof-bound sessions 0, challenges 0, exchanges 0;
- active legacy sessions remain 6;
- a legacy installation used access and updated last-seen state after the new deployment became active, proving capability enablement did not break or silently migrate the legacy path.

**No Founder installation is enrolled yet.**

## Exact Build 72 archive

- Source worktree was detached at exact clean `27910310`; remote branch resolved to the same SHA before archive.
- Diff from Build 71 `71164900210f689480ed277205bf8a43b6d18ead`: exactly four rollout/build-metadata files, 5 insertions / 5 deletions; no auth or product implementation change.
- Project generation was deterministic and left the worktree clean.
- Release configuration verification passed.
- Archive: `PhysiqueOS-Build72.xcarchive`, version **1.0 (72)**.
- Bundle: `com.physiqueos.native.dev`; team `33GMTRM6G9`; arm64.
- Xcode result: **ARCHIVE SUCCEEDED**; no interactive reauthentication.
- Deep strict code-sign verification: passed.
- App/dSYM UUID: **`B58F355F-9E37-3314-B0DF-8F0B03860BCC`**, exact match.
- Archived `PHYSIQUEOSSenderConstrainedRefreshEnrollment`: **true**.
- Archived `NSFaceIDUsageDescription`: absent. Source contains no LocalAuthentication gate; Secure Enclave proof remains unattended as reviewed.

## Tests and validation

Already run on exact candidate `27910310` before restart:

- `FounderServerAPITests`: **243 passed, 0 failed, 0 unexpected**;
- deterministic generation, release configuration, plist lint, diff/whitespace audit: passed.

This resume correctly did **not** rerun broad suites. Build 72 inherits unchanged Build 71 product source, whose reviewed full suite was 1,590/1,590. No broad simulator tour was run.

## Upload / VALID

Guarded dry run passed every authentication, archive identity, bundle/version/build/team, embedded-version, signature, dSYM, and upload-eligibility check. Build 72 was greater than last uploaded Build 71 and had no previous upload receipt.

Uploaded only through the established Xcode `-exportArchive` workflow using the App Store Connect API key; no browser login and no interactive Apple/Xcode account authentication.

- Xcode: **Upload succeeded / EXPORT SUCCEEDED**.
- Delivery: **`f7839d88-005b-47ef-89bf-0bcecd35adf4`**.
- Independent status: **build VALID, import VALID, on App Store Connect true**.
- Uploaded: 2026-09-30 10:05:34 AM PDT.

## Exact one-time Founder action now required

1. Install **PhysiqueOS Build 72** from TestFlight.
2. In the PhysiqueOS web app, open **You** and use **Pair Native Device → Generate Pairing Code**. The code is one-time and expires after 10 minutes.
3. On the iPhone in Build 72, open **You → Founder device connection**.
4. Tap **Disconnect this production session** once. This intentionally retires the existing legacy app session so enrollment cannot occur silently.
5. Enter the new 43-character code in **10-minute production pairing credential**, then tap **Connect to Founder Production** once.
6. Stop there and report that the connection succeeded (or the exact non-secret error text). Do not paste the pairing code into chat or logs.

No Settings change, Face ID approval, biometric prompt, app reinstall, or repeated pairing attempt is required. If any unexpected prompt/error appears, stop without retrying and report it.

## Not yet tested / not claimed

Until the Founder completes the action above, this task does **not** claim:

- installation key registration;
- a proof-bound session;
- sender-constrained normal refresh;
- relaunch or lost-response recovery;
- stale/replay/wrong-key rejection against the enrolled Founder session;
- final non-downgrade acceptance.

Those production canary gates remain for the continuation after Founder confirmation. No destructive revocation/security test against an enrolled session is authorized without separate confirmation when no non-destructive equivalent exists.

## Privacy and rollback

No pairing credential, refresh/access credential, private key, public key, nonce, proof ID, signature, intent, successor credential, credential hash, private Founder record, or raw environment secret was read, logged, or published. Evidence is aggregate or non-secret release/control-plane metadata only.

If continuation fails: disable/remove the enrollment flag to stop new enrollment; retain proof-capable Server code `372c306b` or a proof-capable descendant; retain migration 000015; never downgrade any proof-bound session or add bearer grace; use the reviewed reconnect/recovery path.

## Local-only state

- Build 72 archive retained in Xcode Archives.
- Exact Native source worktree remains clean at `27910310`.
- No private Founder harness/evidence was created.

## Recommendation

Proceed with exactly the one-time Founder action above. Do not broaden enrollment. Resume automated/production canary validation only after production records prove the intended installation—and no other installation—became proof-bound.

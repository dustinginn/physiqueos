# Auth session resilience + Face ID: Phase A security audit and integration handoff

Task id: `authentication-session-resilience-faceid-architecture-20260929`

Generated: 2026-09-29T05:26:18Z

## Result

Phase A is complete. The Sep 28 incident is mapped across the deployed Server and accepted Native lineages. The proposed generic “unused successor grace window” is rejected because it weakens replay detection: an attacker holding used token A could invalidate legitimate B and obtain fresh credentials during the window.

The approved architecture direction is exact refresh-attempt idempotency: Native durably records a random attempt identity before transmission; Server may reproduce only the already-issued B/access response for the same attempt while B is unused and the short Server-clock window remains open. Any different attempt, used successor, ownership mismatch, revoke, or expired window retains family revocation.

Detailed design and threat model: `docs/auth-session-resilience-faceid-architecture.md`.

Executable decision model and adversarial tests:

- `src/platform/auth/RefreshRotationRecoveryPolicy.js`
- `src/platform/auth/RefreshRotationRecoveryPolicy.test.js`

These files are intentionally not wired into runtime composition. The delegated `origin/main` worktree is not the deployed Server lineage and contains no Native source. Production Server is on `origin/combined-app-platform-cutover`; accepted Native source inspected at `origin/claude/native-build69-integrated-20260929`. Direct implementation here would either miss production routes/client code or overlap Claude's active Native work.

Authority inspected from local remote refs:

- audit base: `be9bb2ec60fd13de2be3b332c995548d08de4423` (`origin/main`);
- Server production-lineage tip: `98534bf8` (`origin/combined-app-platform-cutover` at audit time; this is a source-lineage inspection, not a claim that its tip is deployed);
- Native Build 69 integration tip: `efa65db1` (`origin/claude/native-build69-integrated-20260929`).

## Key audit findings

- Server rotation is transactionally correct but has no retry identity or recoverable response link. Any second use revokes the family.
- Native is single-flight in-process, but its Keychain record stores only the current refresh credential. It cannot distinguish/retry an interrupted accepted rotation after process suspension.
- Native deletes the Keychain credential on a broad `.unauthenticated` mapping and generic Home UX masks auth recovery.
- `WhenUnlockedThisDeviceOnly` is the correct storage class; do not weaken it for background convenience.
- No Face ID/LocalAuthentication flow or device-bound signing key exists.
- Face ID should gate local UI after cold launch/meaningful background timeout with device-passcode fallback. Cancellation/failure must never revoke or delete the Server session. It is not Server authentication.
- HealthKit has a stable local Keychain cursor identity, but Server canonical ingestion replaces `deliveryDeviceId` with the authenticated `principal.deviceId`; re-pair therefore changes delivery identity. A separate migration is recommended, not performed.

## GitHub check

The requested `gh` CLI check could not run because `gh` is not installed on this host. GitHub was checked read-only through the repository UI on 2026-09-28 PT: there were no issues or pull requests matching `auth refresh session`. The repository showed one unrelated issue total and zero matching PRs.

## Integration order

1. Server branch from current production: schema + strict-compatible request capability, exact-response derivation, transaction/route/observability tests.
2. Native branch from the accepted post-Build-69 lineage: versioned atomic Keychain envelope, persisted attempt ID, background assertion, terminal/non-terminal error split, explicit recovery UX.
3. Native local-auth layer as a separate identifiable commit; no biometric prompt on token refresh.
4. Fresh security review of both exact SHAs.
5. Compatibility deploy, Native release, then guarded enablement. No deployment or TestFlight upload occurred here.

## Verification

- `npm run test:foundation`: 10 files passed, 44 tests passed.
- Targeted retry-policy suite: 12 tests passed.
- ESLint on the policy, tests, and foundation config: passed.
- `git diff --check`: passed.
- GitHub read-only search: no matching issue or pull request.

## Must-not-regress invariants

- Different-attempt replay revokes.
- Replay outside the bounded Server-clock window revokes.
- Replay after B use revokes.
- Revoked device/session never recovers.
- Exact retry never creates C and never crosses device/session/family ownership.
- No credential, attempt ID, or digest enters logs.
- Biometric failure/cancel has no Server-side effect.
- Re-pair is reserved for terminal session recovery.

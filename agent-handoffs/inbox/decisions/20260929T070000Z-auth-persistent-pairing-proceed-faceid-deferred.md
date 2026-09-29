Founder decision — proceed with persistent pairing/session resilience; defer Face ID

Parent task:
authentication-session-resilience-faceid-architecture-20260929

Reviewed Codex branch:
codex/auth-session-resilience-faceid @ 0420560b

DECISION

Founder accepts the sender-constrained persistent-pairing/session-resilience architecture direction.

Proceed with implementation of the persistent trusted-installation/session-recovery architecture.

DO NOT implement Face ID/local app locking in this phase.

Face ID/local authentication is explicitly deferred. The Founder does not currently need biometric/local-access gating.

PRODUCT GOAL

After initial pairing, the legitimate iPhone should remain paired through ordinary credential rotation, app suspension, lost refresh responses, relaunch and other recoverable transport/interruption cases.

Founder should not routinely need to:
- re-pair;
- enter another pairing code;
- approve background refresh;
- interact with a biometric prompt.

Manual reconnect/re-pair should be reserved for genuinely terminal/security-significant states.

SECURITY ARCHITECTURE

Implement the accepted sender-constrained approach, not a bearer-token grace period.

Core invariants:
- pairing enrolls a non-exportable per-installation signing key;
- Server stores only the public/enrollment side;
- refresh/rotation presentations require fresh device-bound proof;
- proof binds the appropriate request/intent/successor commitment and one-time Server nonce/proof identity;
- Native durably persists the pending rotation state before transmission;
- a lost reply can recover only the exact committed unfinished exchange;
- successor refresh credential remains unused;
- every access credential issued by that exchange remains unused;
- Server time remains inside the bounded recovery window;
- device/session/family/key authority matches;
- recovery is bounded;
- recovery retains the committed successor and does not create an uncontrolled credential chain;
- replay/theft outside those exact conditions retains strict rejection/revocation semantics.

A stolen bearer or captured old request without a fresh enrolled-installation proof must not gain recovery.

NATIVE REQUIREMENTS

Implement on a fresh branch based on the current accepted post-Build-69 Native lineage, not by merging the audit branch wholesale.

Required:
- non-exportable installation signing key using appropriate Apple security primitives;
- durable versioned Keychain envelope for current credential + pending rotation intent/committed successor state;
- atomic state transitions;
- fresh proof generation;
- suspension-safe/interruption-safe refresh;
- background execution assertion where useful to reduce interruption frequency, but correctness must not depend on it;
- relaunch resolution of pending refresh before ordinary authenticated reads;
- distinguish recoverable/transient auth state from terminal unauthenticated state;
- do not delete valid/potentially recoverable Keychain state on broad generic error mapping;
- explicit user-facing recovering/reconnect state instead of generic Home failure;
- no biometric prompt or LocalAuthentication gate in this phase.

SERVER REQUIREMENTS

Implement on a fresh branch from current production authority, independently reverified first.

Required as justified by the accepted architecture:
- installation public-key enrollment/association;
- device-proof verification;
- one-time nonce/proof replay protection;
- durable refresh-exchange representation;
- predecessor/successor/intent/commitment authority binding;
- access credential first-use tracking sufficient to prove whether an exchange progressed;
- bounded lost-response recovery;
- downgrade-resistant compatibility/rollout for existing Build 69;
- safe observability without credential/proof/intent secret material.

Do not break Build 69 during compatibility deployment.

RECOVERY UX

States should distinguish at least:
- authenticated;
- recovering session;
- temporarily offline/last-known where safe;
- reconnect required;
- unpaired.

Do not present "Home could not be loaded" as the primary experience for an auth recovery condition.

Reconnect required should route directly to the appropriate recovery/pairing experience.

FACE ID DEFERRED

Do not add:
- Face ID prompt;
- app-local biometric lock;
- LocalAuthentication UI;
- biometric timeout policy.

Preserve the architecture so local authentication can be added later without changing Server authentication semantics.

HEALTHKIT IDENTITY

Do not change HealthKit deliveryDeviceId coupling in this implementation unless required for correctness. Record the decoupling recommendation as a separate follow-up. The Activity canonical layer already tolerates re-pair identity changes.

IMPLEMENTATION / ROLLOUT SAFETY

This is a coordinated protocol change.

Do not deploy only one unsafe half.

Design an explicit compatibility rollout:
1. Server capability/schema support that preserves Build 69 behavior.
2. Native capable build.
3. guarded enablement of sender-constrained recovery only when the installation is enrolled/capable.
4. strict legacy semantics for incapable clients until migrated.

No silent bearer-token grace.

TESTS

Implement deterministic coverage for the full accepted threat matrix, including:
- normal rotation;
- lost response;
- app suspension after Server commit;
- relaunch with pending state;
- Keychain promotion/write failure;
- captured bearer;
- captured full old request;
- nonce replay;
- proof-ID replay;
- wrong installation key;
- intent mismatch;
- successor commitment mismatch;
- successor used;
- exchange access used;
- outside recovery window;
- repeated recovery/exhaustion;
- revoked device/session;
- multiple devices;
- concurrent same intent;
- concurrent different intent;
- offline/transient failure;
- downgrade/legacy Build 69 compatibility;
- no secrets in logs.

FRESH SECURITY REVIEW REQUIRED

Before any deployment or TestFlight upload:
- fresh-context security review of exact Server and Native SHAs;
- explicitly verify must-not-regress replay/theft invariants;
- full relevant Server regression;
- full Native tests;
- Release compile.

DELIVERABLE

Commit/push isolated Server and Native branches.
Publish GH handoff containing:
- exact branches/SHAs;
- schema changes if any;
- protocol flow;
- compatibility rollout;
- threat-model test results;
- full validation;
- fresh security review;
- deployment order;
- rollback strategy;
- Founder acceptance checklist.

Do not deploy.
Do not upload TestFlight.
Do not merge into Claude's peptide worktree.

Claude/Fable continues peptide UX and the next Native product batch independently.

END DECISION.

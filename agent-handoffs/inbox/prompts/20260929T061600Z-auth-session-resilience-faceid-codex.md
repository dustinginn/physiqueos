Task id: authentication-session-resilience-faceid-architecture-20260929

Codex owns this workstream in an isolated branch/worktree. Do not overlap Claude's peptide/Native build.

GOAL

Eliminate routine Founder re-pairing caused by fragile session renewal while preserving strong theft/replay protection. Evaluate and, where appropriate, implement a native local-authentication experience using Face ID/device authentication.

INCIDENT TO DESIGN AGAINST

Sep 28 production incident:
- app renewed sign-in;
- Server issued a new token and retired the old token;
- app apparently did not receive/save the renewal response, likely due to suspension/interruption;
- old retired token was then reused;
- Server correctly treated reuse as possible theft and revoked the device session;
- Founder had to manually re-pair;
- re-pair also changed HealthKit deliveryDeviceId and exposed a separate Activity issue, now fixed.

The goal is NOT simply "add Face ID".
The goal is a resilient trusted-device/session architecture where ordinary interruption does not force re-pairing.

AUDIT FIRST

Map current:
- pairing flow;
- device identity;
- access/refresh/sign-in token lifecycle;
- token rotation and reuse detection;
- Keychain storage;
- renewal request/response transaction;
- app background/suspension behavior;
- retry semantics;
- session revocation;
- recovery UX;
- HealthKit deliveryDeviceId coupling;
- any device-bound keys/attestation already present;
- current threat model/tests.

SERVER LOST-REPLY TOLERANCE

Evaluate the previously proposed bounded rule:
If token A was successfully exchanged for token B, B has never been used, and A reappears within a short tightly bounded recovery window, distinguish likely lost response from ordinary token theft/replay and safely re-issue/rotate credentials.

Do not weaken replay protection casually.

Threat-model:
- attacker steals A before rotation;
- attacker steals A after legitimate rotation;
- legitimate client loses B response;
- legitimate client saves B but accidentally retries A;
- concurrent refresh requests;
- delayed network response;
- app suspension mid-refresh;
- device clock manipulation;
- repeated lost replies;
- replay outside recovery window;
- B already used;
- revoked/removed device;
- multiple devices.

Prefer server-observable state over client claims.

IOS RENEWAL RESILIENCE

Audit whether Native can safely use background execution assertions / URLSession behavior / transactional Keychain writes so an accepted renewal is not lost during app suspension.

Requirements:
- credentials persisted atomically;
- retries idempotent where possible;
- no token logged;
- no credential copied to insecure storage;
- interrupted renewal has explicit recoverable state;
- app should not collapse to generic "Home could not be loaded" when auth recovery is required.

FACE ID / LOCAL AUTH

Determine the right role for Face ID.

Likely product goal:
- paired trusted device stays paired;
- Face ID/device passcode protects local access to PhysiqueOS and/or sensitive credential use;
- Face ID is not confused with Server authentication;
- biometric failure must not silently revoke Server session;
- use LocalAuthentication / Keychain access-control primitives where appropriate.

Design:
- when Face ID appears;
- app launch/background timeout behavior;
- fallback to device passcode where appropriate;
- behavior if biometrics change;
- behavior after reboot;
- pairing/re-pair recovery;
- user-visible states.

Do not create biometric prompts so frequently that normal logging becomes annoying.

PRODUCT RECOVERY UX

If a Server session genuinely cannot recover:
- explain that the device needs to reconnect;
- route directly to the correct recovery/pairing flow;
- do not present generic Home failure as the primary state.

HEALTHKIT DEVICE IDENTITY

Audit whether pairing/session identity should continue determining HealthKit deliveryDeviceId.
The Sep 28 re-pair caused the same physical phone to appear as a new HealthKit delivery device.
The Activity canonical layer now tolerates that, but determine whether the identity coupling itself is desirable.

Do not change HealthKit identity in this workstream unless clearly justified and tested.

DELIVERABLE STRATEGY

Phase A: architecture/security audit and threat model.
Publish a GH report before implementation if the correct design is not trivial.

Phase B: implement only if the design is well-supported and bounded.
Server and Native changes must remain separately identifiable.

TESTS

At minimum model:
- lost renewal response;
- successful normal rotation;
- retry of old token inside recovery window with successor unused;
- old-token replay after successor used;
- replay outside window;
- concurrent refresh;
- suspension during renewal;
- Keychain write failure;
- app relaunch after interrupted renewal;
- revoked device;
- multiple devices;
- Face ID success/failure/cancel;
- passcode fallback if used;
- biometrics changed;
- no-biometric device;
- recovery UX;
- no secrets in logs.

SECURITY REVIEW

Run fresh-context security review. Treat replay/theft protection as a must-not-regress invariant.

Do not deploy.
Do not upload TestFlight.
Do not merge into Claude's branch.
Commit/push isolated work and publish GH handoff with exact branch/SHA and integration recommendations.

Do not touch:
- peptide/support editor;
- Activity/Logged Today;
- Workout Logger;
- Priority Skip;
- Briefings;
- Photos;
- Sleep.

END TASK.

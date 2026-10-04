# Beta Readiness Settings matrix

Target boundary: controlled private TestFlight / invite-only beta, not public consumer account management.

| Need | Exists? | Current authority | UI needed? | Backend/model needed? | Beta-blocking? | Recommendation |
|---|---|---|---:|---:|---|---|
| Durable user identity and owner scoping | Yes | Server user/principal/session/device records | Status only | No for current controlled beta | No | Preserve; never accept user identity from request payload |
| Secure device session | Yes | Server session + rotating credential; Keychain on Native | Settings account summary | No | No | Reuse existing pair/refresh/revoke behavior |
| End-user sign out | Partial | current-session revoke exists | Yes | Protected-cache/draft cleanup boundary must be completed | Yes | One-device Sign Out with confirmation; no generic “disconnect” diagnostics language |
| Native profile read | Partial | owner-scoped `/api/v1/native/profile` | Yes | Extend projection/decoder | Yes for this design | Consume canonical profile rather than local duplicates |
| Native profile edit | No | no Native command | Yes | Versioned update command and durable fields required | Yes | Add one bounded profile save; expected-version conflict behavior |
| Name / timezone / units defaults | Partial | legacy user model/runtime data | Yes | Normalize and persist in durable owner profile | Yes for multi-user beta | Use one preferred name, one IANA timezone, and explicit weight unit |
| Height | Partial | legacy user model | Yes | durable schema/read/write required | No for login; yes for accepted Profile | Preserve verified measurement; no current-formula claims |
| Source connection per user/device | Infrastructure only | HealthKit owner/device scopes and Server capability | Yes | User-safe status projection required | Yes for Data Sources | Project direction, availability, capability, and durable acknowledgement only |
| Appearance preference | No on Native | fixed dark root and static tokens | Yes | device-local preference store/theme resolver | Yes for accepted UI | System default; Dark; Mineral Light |
| Version/about | Yes as bundle/build metadata | app bundle | Yes, read-only | No | No | Show 1.0 / Build 85 without a destination |
| Notifications settings | Domain behavior exists | iOS authorization + Operating Plan schedules | No new global page | No new global preference model | No | Keep canonical schedule preferences in Operating Plan and OS permission in iOS Settings |
| Public signup / email password | No, deliberately | operator/device enrollment | No | Major new auth product | No for controlled beta | Do not build |
| Account recovery | Operator-assisted only | approved Founder recovery boundary | No consumer screen | Wider-beta policy/implementation later | No for controlled beta; yes before self-serve beta | Preserve operator-assisted recovery for current cohort |
| Data export / account deletion | No user UX | retention/object lifecycle architecture only | Not in this initial screen set | policy + audited workflow required | No for current Founder beta; decision before external beta | Do not advertise dead destinations; decide before broader distribution |
| Billing / subscriptions | No | none | No | Major new product | No | Do not build |

## Minimal implementation sequence

1. Add typed routes and read models for Settings, Profile, Data Sources, Apple Health detail, and Appearance.
2. Define/persist the four approved profile fields with one versioned owner-scoped command.
3. Add a device-local appearance preference and dynamic dark/Mineral-Light tokens at the app root.
4. Project Apple Health state without violating HealthKit permission privacy.
5. Convert current session revocation into end-user Sign Out with comprehensive local protected-state cleanup.
6. Add deterministic tests for routing, state truth, persistence, relaunch, and sign-out isolation.


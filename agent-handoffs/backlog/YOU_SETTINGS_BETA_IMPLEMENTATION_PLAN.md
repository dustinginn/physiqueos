# You / Settings beta implementation backlog

Status: DEFERRED BY FOUNDER — DESIGN LOCKED, IMPLEMENTATION NOT STARTED

The Founder accepted the You / Settings / Profile / Data Sources / Appearance design direction on 2026-10-04 but is not ready to begin beta/account architecture work. Preserve this plan for later implementation. Do not start it implicitly while implementing unrelated locked UI families.

Authority:
- Design report: agent-handoffs/reports/20261004T203501Z-you-settings-profile-ui-design.md
- Design artifact: f208007cc7e1872d718efea372e6938f75b1a9aa
- Canonical implementation deltas: agent-handoffs/DESIGN_IMPLEMENTATION_DELTA_LEDGER.md

Deferred implementation sequence:

1. Settings route family
Add the real You -> Settings navigation family and typed destinations while preserving existing You, Goals and Operating Plan behavior. Replace the dead Integrations doorway only when the whole Settings route family is ready.

2. Profile canonical read/edit contract
Complete the Native profile decoder and add the versioned owner-scoped update contract for Preferred name, Height, Time zone and Weight units. Add durable storage for height and weight units. Preserve Evidence/history semantics and do not add excluded demographic fields.

3. Appearance architecture
Add a device-local System / Dark / Light preference. System is default. Light resolves to locked Mineral Light. Replace fixed-dark Native tokens with dynamic locked token pairs and audit all app-owned surfaces before calling the theme implementation complete.

4. Data Sources projection
Create a user-safe Apple Health source model that explains what PhysiqueOS receives/sends without exposing diagnostics or claiming read permission denial. Preserve server-gated Sleep behavior and explicit DEXA writeback semantics.

5. One-device Sign Out
Create an end-user sign-out coordinator that revokes the current session, clears protected local user-scoped state, resets user-specific UI, and returns to secure enrollment without deleting canonical server data. Define truthful offline/revocation failure behavior.

Controlled-beta boundary:
Do not add public signup, email/password auth, self-service account recovery, billing, export, account deletion, generic notification settings or broader consumer account management unless separately approved.

Acceptance rule when this backlog is eventually activated:
Reverify then-current Native/server authority first, implement required plumbing before dependent UI, add deterministic tests for each open delta, and do not mark the Settings family implementation complete while any REQUIRED FOR DESIGN IMPLEMENTATION delta remains open.

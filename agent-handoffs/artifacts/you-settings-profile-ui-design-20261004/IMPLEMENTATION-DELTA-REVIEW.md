# Implementation delta review

The canonical ledger was reviewed. This task discovers genuine implementation work because the target family does not yet exist in shipping Native.

## Deltas appended to the canonical ledger

1. **You / Settings route family** — add real Settings/Profile/Data Sources/Apple Health/Appearance routes; preserve Goals and Operating Plan; remove dead Integrations from the target You root.
2. **Owner profile read/write and storage** — extend the current partial Native decoder, define one preferred-name rule, persist height/timezone/weight unit, and add a versioned owner-scoped update command.
3. **Native appearance architecture** — replace fixed dark root/static dark tokens with System/Dark/Light resolution, locked Mineral Light tokens, and device-local persistence.
4. **Apple Health Data Sources projection** — add a user-safe state/read model that distinguishes connection, Server-gated domain activity, no-visible-data, unavailable, and writeback preference without claiming per-type read denial.
5. **End-user Sign Out boundary** — reuse current session revocation but clear every protected user-scoped cache/draft and return to secure enrollment.

## Architectural context documented, not added as required UI

- Notifications remain owned by canonical schedule editors and iOS permission settings; there is no truthful global preference page yet.
- Date of birth, biological sex, email/password, public signup, billing, data export, and account deletion are excluded from this target.
- Broader self-serve beta requires a separate recovery/privacy/distribution decision; it is not silently pulled into this design implementation.

## No shipping fix in this task

No Native, Server, schema, HealthKit permission, theme, user/profile, build, TestFlight, or deployment state was changed.


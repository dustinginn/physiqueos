# You / Settings / Profile UI design

Status: ready for Founder review. Design and source audit only; implementation has not started.

## Outcome

The final DEXA Since Prior Scan correction now matches the production structure: one horizontal card, three equal columns, compact labels, semantic values, and subtle separators in dark and Mineral Light. DEXA Evidence and the entire Evidence design family are now recorded as **LOCKED**.

The new You / Settings family is fully designed and source-audited:

- You root;
- Settings root;
- Profile;
- Data Sources root;
- Apple Health connected and limited-visibility details;
- Appearance with System, Dark, and Mineral Light;
- minimal current-device account state and Sign Out boundary.

No alternative direction is proposed. This is one implementation-ready target pending Founder review.

## Review links

- Primary composite: `agent-handoffs/artifacts/you-settings-profile-ui-design-20261004/screens/you-settings-primary-mobile-review-board.png`
- Mobile review page: `agent-handoffs/artifacts/you-settings-profile-ui-design-20261004/review-board.html`
- Beta-readiness architecture summary: `agent-handoffs/artifacts/you-settings-profile-ui-design-20261004/screens/beta-readiness-architecture-summary.png`
- Package index: `agent-handoffs/artifacts/you-settings-profile-ui-design-20261004/README.md`

Artifact branch: `codex/you-settings-profile-ui-design`

Artifact commit: `f208007cc7e1872d718efea372e6938f75b1a9aa`

## Source authority

| Authority | Commit / build |
|---|---|
| Prompt | `ce0141a53e140fe9b0854d6a4df01d6a5dbae434` |
| Native | `b8ee8690b194cb90086b62816b9a2c8c400dc026` / Build 85 |
| Server | `3c0f4aefddbb9a6886f6ad012443978303d47024` |

## Design decisions

### You and Settings IA

You preserves the current Goals and Operating Plan doorways. The current dead Integrations row is replaced by Settings. Founder connection diagnostics and writeback validation controls do not become product Settings rows.

Settings remains intentionally small:

1. Profile
2. Data Sources
3. Appearance
4. current-device account state / Sign Out
5. read-only app version/build

There is no miscellaneous settings dump, Coming Soon content, or duplicate Evidence navigation.

### Profile

The target includes only:

- Preferred name;
- Height;
- Time zone;
- Weight units.

Date of birth, biological sex, email, separate first/last name controls, avatar, Goal, Weight, DEXA, primary body-composition source, and weigh-in context are excluded. The field-by-field purpose/storage/edit matrix is in `PROFILE-FIELD-MATRIX.md`.

### Data Sources

Apple Health is the only external source shown in this round. The source detail preserves exact receive/send semantics:

- receive: Activity, Workouts/Cardio, Nutrition, and Server-gated Sleep;
- send: DEXA Body Fat Percentage and Lean Body Mass when explicitly enabled;
- Weight: not sent.

The limited state says “no recent data visible” and never claims Apple denied read permission. Freshness is not shown until a durable user-safe acknowledgement projection exists.

### Appearance

System is the default for new users. Dark resolves the locked dark system. Light resolves locked Mineral Light. The preference is device-local and immediate; it is not canonical Evidence or profile data.

## Existing versus required

Already exists:

- You tab/navigation stack;
- owner-scoped Native profile read endpoint;
- secure device pairing, refresh, revocation, and Keychain credential storage;
- HealthKit domains/synchronization foundations and explicit DEXA writeback;
- bundle version/build metadata.

Required implementation:

- Settings-family routes/screens/read models;
- complete Native profile decoder plus versioned profile update command and durable height/unit storage;
- user-safe Apple Health source-state projection;
- System/Dark/Light preference store and dynamic Mineral Light token architecture;
- one end-user Sign Out coordinator that revokes the session and clears all protected user-scoped local state.

## Beta boundary

This design is appropriate for controlled private TestFlight / invite-only beta. It does not authorize public signup, email/password identity, billing, consumer recovery, generic notification settings, data export, or account deletion UI. Operator-assisted recovery remains the current approved boundary. Broader external beta needs a separate recovery/privacy/distribution decision.

## Implementation delta ledger

Five genuine implementation deltas were appended:

1. You / Settings real route family;
2. canonical Profile read/edit/storage;
3. System/Dark/Mineral Light architecture and persistence;
4. user-safe Apple Health Data Sources projection;
5. end-user one-device Sign Out boundary.

A controlled-beta account-boundary entry was also added as architectural context.

## Coverage and validation

- 8 materially distinct direct templates;
- 16 dark/Mineral-Light product renders;
- System/Dark/Light appearance states covered by one stable selection template;
- connected, limited, unavailable, loading/error source states directly rendered or explicitly mapped;
- populated/edit/saving/validation Profile states directly rendered or explicitly mapped;
- 390 px review page has no horizontal overflow;
- zero runtime errors;
- zero broken images;
- no shipping source, schema, HealthKit permission, theme runtime, user/profile, build, TestFlight, or deployment change.

Validation: `agent-handoffs/artifacts/you-settings-profile-ui-design-20261004/validation.json`

## Lock status

- Entire Evidence family: **LOCKED**.
- You / Settings / Profile / Data Sources / Appearance: **PENDING FOUNDER REVIEW**.

## Stop reason

The requested family is fully audited, every material state is rendered or mapped, dark/Mineral-Light review artifacts are validated and published, beta-readiness gaps are explicit, and the canonical implementation ledger is updated.

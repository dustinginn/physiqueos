# Source audit — You / Settings / Profile

## Authorities

| Authority | Commit / build | Use |
|---|---|---|
| Prompt | `ce0141a53e140fe9b0854d6a4df01d6a5dbae434` | task and lock contract |
| Native | `b8ee8690b194cb90086b62816b9a2c8c400dc026` / Build 85 | shipping iOS structure and behavior |
| Server | `3c0f4aefddbb9a6886f6ad012443978303d47024` | current Native profile/session/HealthKit contracts |

## Current Native architecture

- `RootTabView.swift` owns five tabs: Home, Goals, Log, Evidence, You. You already has an independent `NavigationStack`.
- `YouPlaceholderView.swift` is explicitly a placeholder. It exposes Operating Plan, Founder device connection, DEXA → Apple Health writeback controls, and Founder diagnostics. It does not have Settings, Profile, Data Sources, or Appearance routes.
- `AppDestinationCoding.swift` and `AppDestinationRouterView.swift` contain no target Settings-family destinations.
- `PhysiqueOSApp.swift` forces `.preferredColorScheme(.dark)` at the root.
- `PhysiqueOSTheme.swift` is a static dark-only token set. It is not a dynamic light/dark token layer.
- No Native appearance preference enum/store exists. Other unrelated UserDefaults stores do not provide theme persistence.
- `ProductionNativeAPI.readProfile()` already reads `/api/v1/native/profile` and validates Founder Production authority.
- `ProductionProfileData` decodes only a narrow identity subset. No production screen consumes the profile read.
- Secure device pairing, refresh, session recovery, current-session revocation, and Keychain credential deletion already exist. The user-facing action is still embedded in Founder connection diagnostics as “Disconnect this production session.”
- Current revocation retires production read snapshots and Keychain credentials. A single end-user sign-out boundary that also clears all protected local caches/drafts is not present.
- Notification authorization/scheduling exists, but controls belong to canonical Operating Plan schedules and iOS Settings. There is no current global notification preference contract to justify a new Settings page.

## Current Server architecture

- `createUser()` models `displayName`, `firstName`, `lastName`, `email`, `timezone`, `dateOfBirth`, `sex`, `height`, and preferences including `weightUnit`.
- Founder runtime data currently contains a verified display/first name, 76 in height, and pound units. Date of birth, sex, and email are not populated in the Founder production seed.
- `YouProfileService` can return the user plus current You summaries. Its legacy web Integrations row is a dead destination, and its older service still describes Coming Soon sources that must not enter the new target design.
- `/api/v1/native/profile` is an authenticated, owner-scoped read contract. It returns the client-safe You profile, authority, and capabilities.
- No allowlisted Native command updates the user profile.
- The foundation PostgreSQL `user_profiles` table persists only `display_name` and `time_zone`; height and units are not part of that durable schema.
- User/session/device rows and owner scoping exist. Public signup, consumer email recovery, billing, export/deletion UX, and broad account management do not.

## Current field use

- `displayName` is used for author attribution and presentation fallbacks.
- `firstName` is used for Home greeting/initials. The target design intentionally exposes one preferred name, so implementation must establish one canonical name rule rather than expose redundant fields.
- `timezone` / `timeZone` is used throughout daily boundaries, schedules, reminders, check-ins, briefings, and occurrence resolution.
- `preferences.weightUnit` is used by Morning Check-In persistence and existing weight presentation defaults.
- `height` is already modeled and presented in legacy You, but no audited Build 85 formula currently consumes it. It remains a near-term profile field, not a claim that current calculations use it.
- No audited current logic consumes date of birth or biological sex. Both are excluded.

## Current Apple Health architecture

- Read domains are modeled as Activity, Nutrition, Workouts, and Sleep.
- Activity, Nutrition, and Workouts run through the automatic synchronization path.
- Sleep is Server-capability-gated and must not be shown as active when that capability is off.
- DEXA writeback is a separate, explicit, user-enabled lane for Body Fat Percentage and calculated Lean Body Mass. Weight is not written.
- The automatic coordinator retains last outcomes and durable stream acknowledgement diagnostics, but there is no user-readable Data Sources projection.
- Apple does not expose per-type read-denial status. A successful empty read means only “no visible data”; the design preserves that distinction.

## Design consequences

1. Preserve You’s existing role and current Goals/Operating Plan doorways.
2. Replace the dead Integrations doorway with Settings, not another Evidence doorway.
3. Move end-user connection understanding to Data Sources while keeping engineering diagnostics out of product UI.
4. Keep Profile to four justified fields.
5. Make Appearance device-local with System as the new-user default.
6. Keep Notifications, consumer account management, export/deletion, and speculative integrations out of the initial Settings hierarchy.


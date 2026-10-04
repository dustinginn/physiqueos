# Source audit

## Authority

- Prompt: `d7d59139f3aecff8a42c3f600addbeedc45d9e15`
- Native Build 85: `b8ee8690b194cb90086b62816b9a2c8c400dc026`
- Server: `3c0f4aefddbb9a6886f6ad012443978303d47024`
- Scope: app-wide audit rows H02, L04, L05 and B06.

## Home Confidence Detail

Entry is the locked Home Confidence ring. It opens an in-place sheet, not a route. Native renders a scrollable medium/large detent with the exact server-authored Confidence content.

Canonical V3 order is:

1. Why confidence is `{score}%`;
2. fixed description;
3. current qualitative level;
4. Why confidence is here;
5. What increased it;
6. What supports it now;
7. What is holding it back;
8. What could raise it;
9. What could lower it;
10. Next evidence when present;
11. Coach's take when present.

Historical non-V3 order remains What changed, What supports confidence, What limits confidence, What will make confidence clearer, then the optional historical uncertainty statement. Empty groups are omitted.

The current Native V3 renderer does not present `assumptions`, even though the decode model remains backward-compatible with that server field. The previously requested Assumptions removal is therefore already the current presentation behavior. This design intentionally does not reintroduce it.

Sources: `ConfidenceDetailSheet.swift:3-70`, `HomeReadModel.swift:88-167`, `HomeView.swift:94-103`, `HomeHeroCardView.swift:66-78`.

## Morning Check-In

Entry points are Home's canonical Morning Weigh-In occurrence and every current `checkIn` alias accepted by the shared router. A completed occurrence still routes to the Morning Check-In destination through the server-owned session/occurrence rules already audited for Priority Detail.

Founder Production renders:

- Morning Weigh-In eyebrow, Good morning/Weigh-in complete and the current full date;
- zero or more previous-day unfinished execution priorities;
- one required Completed, Skipped or Add note disposition per unfinished occurrence;
- an always-available optional note for every occurrence;
- today's weight in pounds, prefilled when a current weight exists;
- one atomic Complete Morning Weigh-In action;
- validation, saving, uncertain/reconciling and durable-success states;
- Return Home after durable success.

Occurrence identity is not reconstructed in Native. The server read supplies `id`, `occurrenceKey`, date, title, context and kind, and the write passes that identity with disposition/note. The atomic production command combines the Weight write and all previous-day dispositions. An uncertain outcome is retried idempotently once and remains explicitly processing if the receipt is still unavailable.

Founder Production currently suppresses the Sandbox-only Evidence Recovery, Recovery Evidence and briefing-reconciliation cards. This design preserves that production boundary and does not add wellness fields.

Sources: `AppDestinationRouterView.swift:53-64`, `ManualWeighInView.swift:3-305`, `MorningCheckInReadModel.swift:3-43`, `MorningCheckInAPI.swift:3-50`, `WeightWriteAPI.swift:18-161`, `PriorityReadModel.swift:282-315`.

## Manual/backdated Weight

Entry is the locked Log Compact Command Center's `Log weight for another date` action. The form contains only Date measured, numeric Weight, lb/kg Unit and Save Weight. Date is capped at today. Selecting a date reloads the canonical Weight report and prefills an existing entry for that date; production presentation resets the displayed unit to lb because the canonical write is pounds.

New-day, same-value and correction submissions share `weight.submit.v1`. A changed same-date value uses the canonical Weight revision as `expectedVersion`; kg is converted to pounds before submission. The lifecycle invalidates and rereads Weight, retries an uncertain submission with the same idempotency identity, distinguishes saved from still reconciling, refreshes the Home widget and never fabricates success. Success alone reveals Return to Log. Failure uses the current generic Native-safe message.

The capture flow does not present or change Weight Evidence filtering/history UI. Canonical goal attribution remains server-owned through the returned Weight receipt and subsequent reads.

Sources: `UploadCardView.swift:20-31`, `ManualWeighInView.swift:307-414`, `LoggingSandbox.swift:28-48`, `WeightWriteAPI.swift:11-123,164-240`.

## Briefing History

Entry is `briefingList`, reachable from every briefing detail's shared pre-hero History action and any existing briefing-ready route. Native requests the bounded `briefing-history` resource in pages of 50 until `hasMore` is false, preserves server newest-first order and drops only unsupported/legacy null-cadence rows.

Supported rows are Weekly, Midweek, Monthly, DEXA Event and Photo Event. Each row contains only cadence/type label, server label/title, publication timestamp, icon/tone and disclosure. It does not add Confidence, Goal/Phase attribution, filters, search, categories or diagnostics. Tapping navigates by exact `artifactId` to the shared historical detail renderer; V2/V3 ownership remains inside that artifact.

Material states are loading, populated, empty and failed. Pull-to-refresh invalidates `briefing-history` only in Founder Production and preserves the current loaded-state hierarchy.

Sources: `AppDestinationRouterView.swift:59-64`, `BriefingHistoryView.swift:3-149`, `BriefingReadModel.swift:75-122`, `BriefingAPI.swift:58-172`, `BriefingDetailView.swift:1-137`.

# Routing and completion audit

## Completed Morning Check-In history item — resolved

The historical defect is resolved in Build 85.

- An open Morning Weigh-In routes to `.checkIn(checkInType: "morning")`.
- A grouped, incomplete Morning Check-In session routes to Morning Check-In.
- A completed Morning Check-In history occurrence routes to `.priorityOccurrence(priorityId: "morning-check-in", occurrenceDate: exactDate)`.
- A completed historical Morning Weigh-In detail reads its exact-date `relatedWeight`; the view model explicitly does not fetch today's Morning Check-In.

Source proof:

- `PriorityOccurrence.destination` gates the Morning Weigh-In shortcut with `!completed`.
- `FounderServerAPITests.testCompletedMorningCheckInHomeCardKeepsExactCanonicalRouteAndOccurrenceDate` asserts the occurrence-bound completed route.
- `testPriorityDetailViewModelUsesOccurrenceBoundWeightWithoutCurrentDayFallback` asserts exact-date Weight and no current-day fallback.

No implementation delta is added.

## Home inline vs Priority Detail peptide completion — intentional parity

The historical plain-completion concern is also resolved.

- Home passes `occurrence.completionContext` and `expectedVersion` to the same `priority.complete.v1` write.
- A peptide Home row therefore submits the Server-planned dose/protocol context; it is not a plain completion.
- Priority Detail submits the identical planned context when untouched.
- Only Priority Detail offers “Took a different amount?” when Server sets `doseAdjustable`. Editing replaces only the occurrence completion dose; it does not change the plan.
- Mark Skipped carries no dose and is terminal for that occurrence.

This is intentional product semantics: the quick Home check records the planned amount; opening detail is required only to record a different actual amount. No implementation delta is added.

## Notification routes

- open-only workflows: Morning Check-In, Progress Photos and DEXA open their specialized destination;
- peptide: specialized, planned-dose-aware completion may be supplied by Server; skip remains a separate no-dose command;
- ordinary direct completion: command payload is Server-owned;
- body taps retain the exact occurrence identity/date.

Native does not derive notification completion safety from labels or colors.

## Evidence-action route gap

See the open ledger entry. The design shows the canonical actions because they are part of the Server contract; shipping Build 85 Priority Detail currently cannot navigate them from `action.href` except for Morning Check-In.

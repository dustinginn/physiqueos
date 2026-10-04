# Implementation feasibility

## Reuse

- Locked Home: navy/mineral backgrounds, semantic teal/green/amber/purple, section eyebrow, button geometry.
- Existing Native: `PrimaryActionButton`, `NumericEditField`, `SectionHeading`, status colors, completion feedback, pull-to-refresh, interactive pop.
- Existing contracts: `PriorityOccurrence`, `detailSections`, `relatedWeight`, `doseAdjustable`, `completionContext`, `skipCommand`, `pauseContext`, `notificationAction`.

## New presentation primitives

- `PriorityDetailHeader` — title, text status and subtitle.
- `PriorityDetailFieldGroup` — compact unframed section rhythm with optional semantic icon.
- `EvidenceDrivenPriorityBanner` — explicit evidence-completion explanation.
- `PriorityTerminalState` — completed/skipped/paused copy.

These are presentation-only extractions. No Server composition changes are needed.

## Required plumbing before faithful implementation

Map the Server-owned Progress Photos and DEXA detail actions to existing Native destinations. Prefer a real `action.destination` in the Native contract, or a narrow complete mapping for the verified hrefs. Do not build a general web-URL router.

## Regression risks

- dropping `completionContext` or `expectedVersion` during visual refactor;
- allowing a peptide amount edit to mutate the dose plan;
- showing Mark Complete for Morning/Photos/DEXA;
- losing occurrence date when a completed Home row opens detail;
- reintroducing Related Goals/Completion cards;
- treating supplement quantity as peptide-editable;
- accidentally making Paused or Skipped completable;
- rendering Server clock time differently from `sections[]`.

## Tests required for implementation

1. Snapshot/order tests for every matrix row in both appearances.
2. Open/completed Morning destination tests and exact-date Weight test.
3. Home planned-dose completion byte parity with untouched Priority Detail.
4. Edited-dose write changes only `completionContext.dose`.
5. Progress Photos and every DEXA stage resolve the expected Native destination.
6. Paused/skipped/completed cannot render Mark Complete.
7. Removed informational sections stay filtered.
8. Dynamic Type accessibility-size layout and VoiceOver labels.

Estimated implementation complexity: **medium**. Visual work is straightforward; the one confirmed evidence-action routing delta should land with tests before the detail restyle is considered complete.

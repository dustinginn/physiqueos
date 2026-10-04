# Source audit — selected Home refinement and Log exploration

## Authorities

- Assignment: `9d9a6b7d0b254c91aa8da93fd5f9ced3b17a9011`
- Latest shipping Native / Build 85: `b8ee8690b194cb90086b62816b9a2c8c400dc026`
- Founder-selected Home reference: `screens/reference-selected-home.jpg` (copied byte-for-byte from the supplied attachment)
- Home content fixture: `HOME-FIXTURE.json`
- Log content fixture: `LOG-FIXTURE.json`, derived from Build 85 production adapter tests

The artifact harness is isolated under `agent-handoffs/artifacts/selected-home-log-exploration-20261004/`. No files in `ios/`, Server, build configuration or release state were changed.

## Actual current Native Log

The rendered source order is defined in `ios/PhysiqueOS/Presentation/Log/LogView.swift`:

1. `LogHeaderView`
2. `LoggedTodayCardView`
3. `PendingEvidenceReviewsCardView` when pending reviews exist
4. a processing acknowledgement card when generic processing reviews exist
5. `TrainingLoggerCardView`
6. `UploadCardView`, which also owns the dated-weight action

The production projection is implemented by `ProductionLogAPI` in `ios/PhysiqueOS/Networking/ProductionDailyDriverAPI.swift` and modeled by `ios/PhysiqueOS/Contracts/LogReadModel.swift`. Build 85 obtains Training, Nutrition, Activity and pending-review data from `evidence-review-queue`; it conditionally synthesizes the Weight row from `weight.current` only when the weight date matches `localDate`.

The immutable fixture uses the exact canonical production test pair in `FounderServerAPITests.swift`:

- Training — `Traditional Strength Training · 45 min`
- Nutrition — `4 meals · 2300 calories`
- Activity — `650 active calories`
- Weight — `172.9 lb`
- one pending review — `Check-in ready to review`, `Thursday, September 10`, `1 weight entry`

## Exact current content and behavior retained

- Header: `Log` / `What happened?` / `Upload a screenshot, photo, PDF, or note and PhysiqueOS will organize it.`
- Four Logged Today destinations: canonical training session, nutrition day, activity day and weight stream.
- Pending-review destination and `Review before adding to your history` action.
- Training Logger and its exact explanatory copy.
- `Log weight for another date`.
- Upload, `Add evidence`, `Add details without an asset`, and Photos / Files source choices.
- Conditional labels for loading photos, continuing a draft, loading, error, processing, empty data and possible duplicate.
- Pull-to-refresh, foreground/day-change refresh and bounded processing polling remain implementation requirements.
- Tab order remains Home, Goals, Log, Evidence, You, with Log selected.

## Current visual system found in code

Current Native is dark-only because `PhysiqueOSApp.swift` forces `.preferredColorScheme(.dark)`. The relevant theme values are:

- background `#080D18`
- elevated surface `#141F31`
- muted surface `#172235`
- accent surface `#20264A`
- primary text `#F3F6FB`
- secondary text `#CBD5E1`
- muted text `#9AA8BA`
- accent `#8B8CFF`
- success `#4ADE80`
- information `#60A5FA`
- warning `#FBBF24`

The current Log scale resolves to roughly 14 pt eyebrow, 30 pt page title, 16 pt subtitle, 20 pt card titles, 16 pt card headings, 14 pt rows/body and 12 pt metadata. Cards generally use 14 pt radii with 14–16 pt internal padding.

## Source debt relevant to implementation

- `LoggedTodayCardView` still comments that it renders “exactly three” rows, while the production adapter legitimately appends a fourth Weight row. This is a documentation/data-contract mismatch, not a behavior bug.
- The forced dark appearance means mineral-light requires a deliberate app-level appearance and token expansion; it cannot be safely delivered as local recoloring.
- Global purple currently carries brand, navigation selection and much of the interaction hierarchy. The selected grammar separates brand purple from teal evidence/intake, green active/success, amber action/review and cyan persistent guardrails.
- Current card stacking adds multiple outer and nested containers around review and upload content. That makes action priority less distinct and consumes vertical space.
- Some Log-specific views use shared typography modifiers while others introduce local `.system` sizes/weights. A translation should converge on the frozen scale rather than add another parallel set.
- Current destination and state logic is already reusable. The design work is principally layout, appearance-token and presentation-component work; production projection does not need to change.

No debt was fixed in this exploration.

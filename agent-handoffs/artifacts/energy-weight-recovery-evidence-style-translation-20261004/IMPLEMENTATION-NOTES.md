# Implementation feasibility

This package changes no shipping code. The notes below are for a later approved implementation.

## Reuse path

Keep all Build 85 view models, read models, APIs, resource identifiers, scope stores and calculators. Apply the locked tokens and spacing to existing SwiftUI structures rather than reshaping data or routes.

Highest-reuse areas:

- `TrainingScopeSelectorView`, `TrainingSectionHeaderView`, `TrainingCompactActionLabel`
- `CardContainer` (reduce visual weight for open-list sections rather than removing semantics)
- current Energy, Weight and Sleep chart views
- `RecoverySleepNightRow`, `SleepStatTile`, `SleepNoteRow`, `SleepStateMessage`
- current accessibility identifiers, refresh behavior, selection state and sheets

## Family complexity

| Family | Complexity | Reason |
|---|---|---|
| Energy | low–medium | one root plus two sheets; two current charts; no nested detail route |
| Weight | medium | one page, but exact Goal-dependent summaries, interactive graph and DEXA overlays require snapshot/semantic regression coverage |
| Recovery | high | three resources, scope windows, granular/weekly trends, pagination, finality, time-zone uncertainty, four stage-status variants and conditional detail sections |

## Regression risks

- Accidentally relabeling estimated expenditure as total expenditure or collapsing active calories into it.
- Treating Weight summary cards as generic instead of preserving the literal Goal lookup.
- Changing Weight graph domains, marker dates or default selected/latest behavior.
- Losing Recent History because the section sits low on a long root.
- Treating an uncertain clock time as uncertain sleep duration.
- Counting corroborating sleep sources or secondary sleep twice.
- Showing stage/continuity values while a night is pending correction or source detail is absent.
- Converting 6M/All Recovery trends into nightly charts or importing Recovery Briefing content.
- Styling historical rows like Logger inputs.

## Required tests for implementation

Energy:

- snapshot root and both sheets in dark/light;
- assert four summary labels/order and five completeness labels;
- chart legend/line-style accessibility assertions;
- crosslink presence by source availability;
- no day-detail route.

Weight:

- all three scope summary-label/value branches;
- tight chart domain, selected/latest point, sparse state and purple DEXA markers;
- rolling-average available/pending/absent;
- weekly/history collapsed, expanded and empty;
- no tappable history/detail route.

Recovery:

- root current/final-night variants and three-row Recent Nights;
- nightly versus weekly trend projections and Stage Mix disclosure;
- All Nights pagination/loading-more;
- staged/absent/pending/unknown detail permutations;
- window-open and time-zone-uncertain semantics;
- counted/corroborating/secondary-source reconciliation;
- no strategic score or Confidence wiring.

Cross-cutting:

- Dynamic Type at accessibility sizes;
- VoiceOver chart summaries and explicit units/stage names;
- 44pt touch targets;
- dark/mineral-light semantic parity;
- golden screenshots with no horizontal overflow.


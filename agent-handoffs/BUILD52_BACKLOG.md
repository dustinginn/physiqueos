# Build 52 Backlog

## Training performance-record reliability

Observed 2026-09-22 after a completed Workout Logger session.

Founder reports Training performance records / PR-style records are hit-or-miss and have only been seen reliably once. Investigate whether this regressed or became disconnected when exercise timelines/history were corrected or reconciled.

Audit before patching:
- trace Workout Logger confirmation -> canonical training session -> exercise timeline/history -> performance-record / PR derivation -> Native display;
- verify whether performance records are created consistently for qualifying sessions;
- distinguish true "no record" cases from derivation, persistence, read-model, timeline-linkage, or UI-display failures;
- inspect exercise identity/alias/category/timeline corrections for broken linkage to historical bests;
- test bodyweight, weighted, timed, variant, superset and newly-created exercises where applicable;
- verify records remain correct across corrected historical timelines and renamed/aliased exercises;
- use production-shaped historical sessions and the 2026-09-22 completed session as diagnostic references where safe;
- do not fabricate a PR when comparison history is unavailable or semantically incompatible.

Acceptance:
- qualifying performance records are deterministic and reproducible;
- historical-best comparisons use the correct canonical exercise timeline;
- non-qualifying sessions correctly show no record;
- Native consistently surfaces generated records after workout confirmation;
- no duplicate records or timeline corruption.

Founder hypothesis to investigate, not assume: the behavior may have been lost when exercise timelines/history were corrected.

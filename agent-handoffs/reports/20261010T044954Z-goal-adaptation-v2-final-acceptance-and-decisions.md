# Goal Adaptation V2: final design acceptance and Founder decisions

- Task id: `claude-goal-adaptation-v2-acceptance-decisions-20261010`
- Source: Founder instruction in the Claude Goal Intelligence conversation, 2026-10-10
- Generated: 2026-10-10T04:49Z
- **Status: V2 design ACCEPTED by the Founder. All open design questions are resolved. No implementation has started.**

## Accepted design (exact authority)

| Item | Value |
|---|---|
| Accepted design branch / SHA | `claude/goal-adaptation-design-mockups-20261010` at `7a23c4b00c67e953395fcd1a021005b3cfb94e9b` (design-only; never merge) |
| Accepted screens | `screens-v2/`: 13 screens, 28 Dark and Mineral Light renders. Folder `goal-adaptation-design-20261010/` under `agent-handoffs/artifacts/`. |
| Accepted board | https://claude.ai/artifact/UmheerH4kLDvxCNmHpWvNJ, version `1791606561-3706` (private) |
| Images on GitHub | https://github.com/dustinginn/physiqueos/commit/7a23c4b00c67e953395fcd1a021005b3cfb94e9b |
| Design review and proof | `agent-handoffs/reports/20261010T043500Z-goal-adaptation-founder-feedback-v2-design-review.md` (main `0e8ca502`) |

## Founder decisions recorded today

| # | Question | Decision | Effect on the accepted design |
|---|---|---|---|
| 1 | How long before a new goal or phase can get an adaptation proposal? | **An initial calibration checkpoint at 4 weeks.** It only counts if **evidence is sufficient and plan adherence is adequate**. If either falls short, recommend concrete improvements first and consider adaptation only afterwards. | No new screen. Before the checkpoint, or while evidence or adherence is weak, there is no adaptation card. Improvements are coached inside the existing Weekly/Monthly sections (Coach's Take, "Into Next Week"), naming concrete missing inputs and respecting data that Apple Health already syncs. |
| 2 | Body fat below the range while building muscle? | **Coaching and monitoring first.** If the downward trend persists over the following weeks, evaluate whether a goal or phase adaptation is appropriate. | The guardrail is direction-aware. A first reading below range gets coaching copy, not an adaptation card. A persistent trend makes the goal eligible for the same Option B flow, with "below range" options. |
| 3 | Where does goal history live? | **Inside the existing Your Journey page.** All revisions, transitions, milestones and decisions go there. No separate Goal History page. | Screens 09 and 10 change: "Goal history: version 2 saved" becomes a link into **Your Journey** (Native `GoalDetailView`, "The path · Your Journey" section). This is a copy and destination change only, so no re-render was needed. |

## Previously locked decisions (unchanged)

These were recorded in V2 and remain in force:

- Option B side-by-side, ranked, with the top option recommended when evidence supports it.
- The recommendation is the last element in eligible briefings.
- Triggers: Weekly/Monthly are primary, DEXA is eligible, Photo is conditional, Midweek never originates.
- The notification carries no details.
- Conflict validation, plus a warning when the user keeps an unlikely date.
- Strategies can be edited early; Operating Plan strategies carry forward by default.
- Phase results are reported honestly.
- Recommendations are revalidated and superseded when evidence changes.
- Each option shows its timing with uncertainty.
- A time-limited phase triggers a review, never automatic completion or resumption.
- One primary goal; no automatic transitions; one coordinated approval; versioned goal contract.
- No calorie recommendations are inferred from illustrations.

## Open design questions

None. The tuning defaults for decisions 1 and 2 (evidence sufficiency, adherence and below-range persistence thresholds) are implementation parameters. They are proposed in the roadmap and come back to the Founder for review at the Phase A gate.

## Next

The incremental implementation roadmap is published alongside this report: `agent-handoffs/reports/20261010T045000Z-goal-adaptation-implementation-roadmap.md`. It is a plan only.

## Tests

Not applicable: decision record only. The V2 validation results are in the design review linked above.

## Safety

| | |
|---|---|
| implemented | no |
| production access | control-plane read only (current production is Server `85a98025`, deployment `40122906`, ACTIVE) |
| deployed / TestFlight | no / no |
| release pointer | unchanged (Build 94 authority untouched) |
| other lanes | Codex Build 94 untouched |

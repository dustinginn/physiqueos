Task id: claude-midweek-build59-energy-copy-diagnostic-20260924

Continue in the existing persistent Midweek Briefing Founder Takeover Claude conversation. Reasoning: high.

READ-ONLY DIAGNOSTIC / EDITORIAL ANALYSIS FIRST. Do not patch or create another build until a subsequent explicit authorization.

Current authority:
Production Server: 01d1900bcbb9db32ce270e49c7d24e919ba0d7d7.
Installed Native: combined Build 59 / a269700b.
Midweek format restoration itself is Founder-accepted as visually much better. Preserve the restored Midweek Format Standard. Do NOT redesign the layout again.

Founder Build 59 observations for Sep20–22 Midweek:
- UI/format is materially improved and is now the correct structural direction.
- Copy/narrative still needs another iteration for concision, clarity, non-repetition, and coaching usefulness.
- Energy card visibly shows:
  Sunday +813 kcal
  Monday -375 kcal
  Tuesday No data
  Avg Intake 3068 kcal
  Avg Expenditure 2849 kcal
  Avg Balance +219 kcal
  “Average estimated balance was higher than the prior comparable period by 584 kcal/day. Estimated expenditure uses the DEXA RMR available on Sep 12 plus active calories.”
- The prose also says food and activity were both recorded on 2 of 3 days and recommends keeping calorie targets where they are unless more than the estimate calls for a change.
- Founder states Sep22 (Tuesday) Energy/Nutrition/Activity data IS present in Evidence, but the frozen Sep20–22 Midweek currently renders Tuesday as No data.
- Do not assume Native is at fault. Trace frozen artifact generation/evidence eligibility/presentation contract and distinguish generation-time evidence availability from current evidence availability.
- Do not regenerate or mutate the historical Sep20–22 briefing in this task.

Task A — Sep22 Energy completeness forensic:
1. Reverify the exact frozen Sep20–22 Midweek artifact/assessment/presentation-contract identities.
2. Inspect the artifact’s stored energy module and paired-day inputs: what exactly was frozen for Sep20, Sep21, Sep22?
3. Read bounded canonical Evidence state for Sep22 Activity and Nutrition and their revision/timestamps/provenance.
4. Determine whether Sep22 data existed and was eligible BEFORE the Midweek artifact was generated, arrived/revised AFTER generation, or was present but excluded due to a window/date/eligibility bug.
5. Trace the Midweek generator’s date boundaries/timezone semantics for the Sunday–Tuesday period. Founder was in Texas during this period; do not infer from location alone—use stored canonical localDate/timezone/provenance.
6. Trace evidence cutoff/watermark/as-of behavior. Establish whether “2 of 3 days” is historically correct as-of generation or a defect.
7. Determine whether the current V3 dynamic presentation projection is allowed/expected to enrich a frozen historical artifact with later canonical evidence. Preserve historical immutability rules; do not silently rewrite history.
8. Conclude one of:
   A. generation-time data missing/late, frozen artifact correctly says No data;
   B. generation defect excluded eligible Sep22 data;
   C. presentation defect ignores data already frozen in artifact;
   D. unresolved, with exact missing proof.
9. If A, propose how future Midweeks avoid premature final-day incompleteness without retroactively rewriting frozen strategy artifacts (e.g. cadence/watermark/completeness gate) and how UI should honestly communicate as-of completeness.
10. If B/C, design the smallest correction and whether a historical presentation-only repair can expose already-authoritative frozen data without regenerating strategy.

Task B — V3 narrative/copy editorial audit:
Keep the accepted format/layout unchanged. Audit the actual Sep20–22 rendered V3 copy against the restored standard and Server claim ownership.
Identify:
- repeated facts already visible in cards;
- overly technical/backend-like language;
- caveats that are too prominent;
- sentences that do not change a coaching decision;
- places where one concise sentence can replace a paragraph;
- whether “Keep calorie targets where they are unless something more than the estimate calls for a change” is too hedged/vague relative to the actual V3 recommendation;
- whether DEXA-RMR methodology belongs in main prose, a subordinate note, or not at all;
- whether prior-period delta belongs in the Energy card and how concise it should be;
- whether Goal/Phase/Confidence/Coach’s Take repeat each other.

Produce a proposed COPY STANDARD for V3 Midweek, grounded in the accepted pre-V3 information density:
- lead headline: one decision-relevant sentence;
- lead meaning: max one short paragraph, preferably 1–2 sentences;
- each factual module: numbers/visual first, at most one interpretation sentence plus optional compact methodology footnote;
- Coach’s Take: Biggest Takeaway, My Recommendation, What To Watch; each distinct, no restatement;
- uncertainty: <=2 only if decision-relevant;
- no backend terminology/reason codes;
- no prose reciting every number visible in the card;
- preserve Server ownership of strategy/recommendation; Native may format/truncate only according to explicit Server presentation contract, not invent strategy.

Task C — next-generation correctness:
Audit whether the upcoming Midweek generator will ingest current HealthKit canonical Activity/Nutrition correctly now that Build58/59 current-day sync is healthy. Identify any final-day completeness/watermark issue that could cause the next briefing to repeat Tuesday No data despite Evidence being present.

Do not change content yet. Return exact proposed Server/Native changes and tests, separated into:
- historical Sep20–22 correction if actually warranted;
- prospective generator correctness;
- narrative/copy contract improvements;
- Native presentation-only changes, if any.

Testing plan must include:
- 3/3 paired Energy days fixture;
- final-day data arriving before generation;
- final-day revision arriving after generation;
- timezone/localDate boundary;
- frozen artifact immutability;
- V3 copy density/non-repetition structural assertions;
- accepted format structure unchanged.

Publish a timestamped secondary-lane report to agent-handoffs/reports/ on main. Do NOT overwrite HealthKit latest.json/latest.md. Stop for Founder direction.

Flags:
AUTHORITY_REVERIFIED
FORMAT_STRUCTURE_PRESERVED
SEP20_22_ARTIFACT_ID_PROVEN
SEP22_CANONICAL_ACTIVITY_PROVEN
SEP22_CANONICAL_NUTRITION_PROVEN
SEP22_GENERATION_TIME_AVAILABILITY_PROVEN
SEP22_NO_DATA_ROOT_CAUSE_CLASSIFIED
HISTORICAL_REGEN_NOT_PERFORMED
FUTURE_FINAL_DAY_COMPLETENESS_DESIGNED
V3_COPY_AUDIT_COMPLETE
V3_COPY_STANDARD_PROPOSED
NEXT_MIDWEEK_HEALTHKIT_INPUT_AUDITED
SERVER_CHANGE_NEEDED
NATIVE_CHANGE_NEEDED
PRODUCTION_MUTATED
GH_REPORT_PUBLISHED

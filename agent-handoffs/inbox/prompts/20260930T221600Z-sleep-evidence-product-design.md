HealthKit Sleep product lane — design rich Sleep Evidence from validated real-data shape

Standing reporting protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

PRIMARY HANDOFF

Read and execute:
agent-handoffs/inbox/prompts/20260930T210346Z-healthkit-sleep-evidence-design-20260930.md

Also read:
agent-handoffs/reports/20260930T210326Z-healthkit-sleep-historical-shape-validation.md

PRODUCT DIRECTION FROM FOUNDER

Evidence can be rich and inspectable.

Strategic interpretation must remain selective.

For Sleep Evidence, it is acceptable to expose substantially more of the trustworthy canonical data so the Founder can inspect nights and trends.

The eventual strategic Recovery projection should likely stay centered on:
- total sleep;
- sleep consistency;
- sleep continuity;
- recent multi-night recovery trend;
- data quality/context;
- eventually repeated within-person associations between Sleep and training performance/progressive overload.

Do NOT implement that strategic projection in this task.

IMPORTANT CANONICAL DEFECT

sleep-canon-v1 has a known duplicate-Oura-copy defect affecting Awake/Core/Deep/REM on 11/30 historical nights.

Codex is independently implementing sleep-canon-v2.

Therefore:
- do not treat current v1 stage/Awake durations as final;
- do not hard-code copy-blended values into designs;
- design the UI/schema so stage/Awake data can consume corrected v2 values without layout redesign;
- total asleep, night attribution, main episode and overall schema are sufficiently trustworthy for design.

REAL DATA SHAPE TO DESIGN AROUND

Sanitized September shape:
- 30/30 nights represented;
- Oura primary 30/30;
- Oura only real source in this window;
- Core/Deep/REM/Awake/In Bed available every night;
- >=99% stage coverage;
- one main episode/night;
- no secondary episodes in this particular window, but architecture supports them;
- detailed timeline about 40–91 segments/night;
- no historical Sleep Cycle/Watch/manual samples;
- timezone provenance inferred from device_at_ingest; Founder reports actual late-September travel to Texas, so historical timezone is not ground truth.

EVIDENCE DESIGN GOAL

Design a Sleep Evidence experience that is useful and rich without becoming an Oura clone.

Explore:
- Sleep Evidence landing/history;
- nightly row/card hierarchy;
- 7-day average/trend;
- total-sleep graph;
- consistency visualization;
- continuity representation;
- night detail;
- stage composition;
- hypnogram/timeline if it adds genuine inspection value;
- source/provenance;
- inferred-timezone indication where useful;
- completeness/late-update state;
- secondary sleep/nap representation for future data;
- useful longer-window trends.

Founder specifically likes the idea of a graph with Sleep and a weekly average in future Briefings. Capture that as a future product direction, but DO NOT design/implement Briefing Recovery card yet.

RECOVERY / FUTURE STRATEGIC DIRECTION

Founder wants Recovery to start small:
- Sleep;
- daily Foam Rolling execution.

Future Briefing concept:
a compact Recovery card may eventually include a Sleep graph/weekly average plus lightweight foam-rolling execution.

Foam rolling should not be over-weighted. It becomes narratively relevant mainly when repeated misses coincide with meaningful downstream context such as injury-related training interruption.

Future V3 principle:
Recovery usually contextualizes Goal outcome/execution evidence rather than competing with it.
Correlation with training should be expressed as association, not causation.
One bad night + one bad workout is an observation.
Repeated within-person association across comparable sessions may become an emerging pattern.

DO NOT implement any of this strategic/Briefing logic now.
Record it as design constraints/future handoff only.

PARE DOWN STRATEGIC METRICS

Do not propose every Sleep metric as strategically important.

Evidence may show detailed:
- total sleep;
- stage composition;
- Awake/In Bed;
- timeline;
- source/provenance;
- trends.

But the future strategic layer should not independently weight REM/Core/Deep percentages, hypnogram transitions, sleep midpoint, etc. without later explicit review.

NO SLEEP SCORE

Do not invent a proprietary PhysiqueOS Sleep Score.

DESIGN DELIVERABLE

Produce:
- information architecture;
- landing screen;
- history behavior;
- night detail;
- graph specifications;
- component hierarchy;
- loading/empty/incomplete/late-update states;
- copy examples;
- source/provenance treatment;
- how corrected v2 stage values plug in;
- how secondary sleep appears when it eventually exists;
- what stays hidden from the primary surface;
- accessibility/interaction notes;
- explicit future hooks for Recovery/V3 without implementing them.

Use existing PhysiqueOS Native visual language.

If helpful and safe, create a non-shipping Native prototype/preview branch using synthetic/redacted data only.
Do not deploy or upload.
Do not read raw Founder Sleep records beyond the sanitized report.

FOUNDER PAGE CLEANUP

Be aware candidate a5041eb0 already cleans the Founder Production page for the next Native build.
Do not duplicate or regress it.

OUTPUT

Publish:
agent-handoffs/reports/<timestamp>-healthkit-sleep-evidence-design.md

If a prototype is made, include exact branch/SHA and validation.
Otherwise design-only is acceptable.

Recommend the smallest implementation slice for the first real Sleep Evidence build.

Do not activate prospective Sleep.
Do not implement Briefing/V3/Goal Confidence/Recovery weighting.
Do not upload TestFlight.

Publish GH checkpoint before every stop.

END TASK.

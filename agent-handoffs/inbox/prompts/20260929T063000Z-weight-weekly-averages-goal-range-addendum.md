Addendum to peptide-protocol-native-ux-redesign-next-batch-20260929

Include this additional small Founder-reported correctness fix in the same next Native build. Do not cut a separate build for it.

WEIGHT EVIDENCE — WEEKLY AVERAGES MUST HONOR SELECTED GOAL RANGE

Founder screenshots on Sep 28 show Weight Evidence with Build Lean Mass selected.

The page correctly displays the selected evidence range:
Jul 19 -> Sep 28

The Weight Trend graph visibly includes observations across that full range.

But Weekly Averages only renders recent weeks back through:
Week of Aug 23

It omits the earlier Build Lean Mass weeks from Jul 19 through Aug 22 despite those observations existing and being visible in the graph.

This is a correctness/parity bug.

DIAGNOSE

Trace the same selected-range contract through:
- Weight Evidence Server projection;
- weekly-average aggregation;
- any result limit/window;
- Native decoding;
- Native rendering/list limit.

Determine whether the missing weeks are caused by:
- Server recent-week cap;
- aggregation range mismatch;
- pagination/limit;
- Native truncation;
- or another projection issue.

Do not synthesize missing values in Native if Server authority should provide them.

REQUIRED BEHAVIOR

When a Goal range is selected:
- Weight Trend;
- Rolling Averages;
- Weekly Averages;
- Weight History

must all honor the same selected Goal evidence window unless a surface explicitly communicates pagination/expansion.

For Build Lean Mass, the current selected window begins Jul 19, 2026. Weekly Averages must extend back through the first week containing Goal-range observations.

Boundary semantics:
- include only observations inside the selected Goal range;
- first and last calendar weeks may therefore be partial;
- calculate those partial-week averages only from observations within the selected range;
- entry count reflects only included observations;
- do not pull pre-Goal observations into the first partial week merely to make a full week;
- do not impose an arbitrary recent-week cap when the selected Goal asks for its full evidence period.

Verify the same general behavior for:
- Build Lean Mass;
- completed Visible Abs;
- All Weight.

Preserve the existing Build Lean Mass weight-page semantic that its summary uses Highest rather than Lowest where already intended.

TESTS

Add deterministic coverage for:
- goal starts mid-week;
- goal ends mid-week;
- long goal with more weekly buckets than the current display;
- completed historical goal;
- active goal;
- All Weight;
- sparse week;
- no observations in a calendar week;
- graph/rolling/weekly/history range parity.

FOUNDER ACCEPTANCE CASE

Using the current Build Lean Mass evidence range, prove that Weekly Averages includes the omitted Jul 19-Aug 22 portion and agrees with the observations already plotted in Weight Trend.

Keep this fix in the same next-build report/checklist as:
- peptide UX redesign + Pause/Resume;
- Logged Today Apple Health provenance placement;
- Foam Rolling Mark Skipped eligibility/rendering.

Do not deploy Server changes or upload TestFlight until the combined candidate is reviewed.

END ADDENDUM.

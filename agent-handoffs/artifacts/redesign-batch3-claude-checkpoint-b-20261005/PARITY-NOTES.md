# Checkpoint B parity notes

## Method

- Real Debug app on the dedicated iPhone 17 Pro simulator (iOS 27), using Sandbox fixture data. The locked harnesses were built from the same fixtures.
- Each locked harness has its own width, so each is scaled independently to 402 pt:

  | Harness | Width | Typeface |
  |---|---|---|
  | Training | 390 px | Plus Jakarta Sans |
  | Nutrition/Activity | 379 px inside a 7 px bezel | Plus Jakarta Sans |
  | Weight | 372 px | SF Pro |

- The harness HTML was measured in headless Chrome (`measure2.mjs`) and reproduced in a themed kit. Two rendering rules had to be matched exactly:
  - **Chrome's "normal" line box:** ascent and descent are each rounded (Jakarta 1.038/0.222, SF 0.967/0.211).
  - **CSS border-box insets:** a 1 px border adds 1 px inside.
- Reference and simulator are aligned on the bottom of the navigation bar.
- Vertical ink runs were compared in two stages:
  1. The page head, before any real data difference.
  2. After re-aligning on the first matching section, where Sandbox shows an extra canonical row such as the Goal-phase pills.

## Back labels

- Locked back labels name the parent page ("‹ Aug 26", "‹ Shoulders").
- The Evidence tab keeps an ordered back trail: each page registers itself, and is removed when popped.
- Outside the Evidence tab, the label is "‹ Back", as in the locked T9.
- Review captures use a DEBUG trail seed only for pages that the deep-link launch skips.


## Audit: locked vs Build 87 vs Codex

Build 87 already had the locked information architecture, because the designs were style translations of production. Codex B kept Build 87's composition and only changed tone:

- navy palette;
- SF Symbol tiles;
- glass back pills;
- inline `Set 1: 8 reps @ 135 lb` strings.

See `context-build87-codex-candidate.png`. This candidate implements the locked system:

- **Type and color:** Plus Jakarta Sans at the harness scale, with the locked teal/ink palette in both appearances.
- **Header and scope:** the VIEWING scope card, and flat text back labels.
- **Training Areas:** a 2-column grid showing all 10 areas in live order, with exact counts.
- **Rows:** rail rows with STRENGTH / CARDIO / STRENGTH + WALKING type lines, taken from the canonical summary tokens.
- **Workout detail:**
  - read-only set tables (Set / reps / load, with Timed and BW from the canonical formatters);
  - a purple Superset relationship field and variant suffixes;
  - an Apple Health provenance field;
  - a definition-list Workout Summary.
- **Exercise detail:** the analytical Current Benchmark (teal), Durable Achievements (green), Last Session set table, and Recent History disclosure rows.
- **Resistance reporting:** status tiles and a source line.
- **Activity:** a gradient hero day with the 8-metric grid (Active Calories accented), area tiles, contained Linked Training Context, a 3-row ruled history, and a Show All sheet.

## Measurements (pt, simulator minus reference)

Page head (header, scope and first section) before any real data difference:

| Surface | Theme | Head runs ≤ |
|---|---|---|
| T1 root | dark | 6 runs ≤ 1.4 |
| T1 root | light | 7 runs ≤ 0.7 |
| T3 day | dark | 5 runs ≤ 0.7 |
| T3 day | light | 5 runs ≤ 1.3 |
| T4 workout detail | dark | 8 runs ≤ 2.0 |
| T4 workout detail | light | 11 runs ≤ 2.3 |
| T6 Apple Health cardio | dark | 9 runs ≤ 1.7 |
| T6 Apple Health cardio | light | 9 runs ≤ 1.3 |
| T7 exercise | dark | 7 runs ≤ 0.7 |
| T7 exercise | light | 7 runs ≤ 0.7 |
| T8 records + variant | dark | 4 runs ≤ 0.7 |
| T8 records + variant | light | 4 runs ≤ 0.7 |
| T9 volume record (Lat Pulldown) | dark | 4 runs ≤ 0.7 |
| T9 volume record (Lat Pulldown) | light | 5 runs ≤ 0.7 |
| T13 Resistance Reporting | dark | 6 runs ≤ 0.7 |
| T13 Resistance Reporting | light | 6 runs ≤ 1.7 |
| T14 History Reporting | dark | 9 runs ≤ 0.7 |
| T14 History Reporting | light | 9 runs ≤ 1.7 |
| T15 Cardio Foundation | dark | 10 runs ≤ 1.0 |
| T15 Cardio Foundation | light | 10 runs ≤ 1.7 |
| T16 Training Library | dark | 8 runs ≤ 0.7 |
| T16 Training Library | light | 8 runs ≤ 1.7 |
| Library area (Shoulders) | dark | 3 runs ≤ 0.7 |
| Library area (Shoulders) | light | 3 runs ≤ 1.7 |
| A1 Activity root | dark | 6 runs ≤ 1.7 |
| A1 Activity root | light | 6 runs ≤ 1.7 |
| A3 Activity Day | dark | 13 runs ≤ 1.6 |
| A3 Activity Day | light | 16 runs ≤ 1.7 |

- **T1 root:** fully measured, every visible element is within ±0.7 pt (header, scope card, Latest Training Day, all 10 tiles).
- **T7 exercise:** within ±3.0 pt down to Recent History.
- **T4 Workout Summary:** within ±1.3 pt.
- **Horizontal:** margins, icon and tile x-positions, and chevrons are within ±0.5 pt.

## Remaining differences (not geometry defects)

1. **System chrome.** The iOS status bar and nav bar are taller than the harness's, and the floating tab bar overlays the lowest rows.
2. **Truthful data.**
   - Sandbox's Activity and Training library scopes show the canonical Goal-phase pill row, which the template omits. This shifts the content below it.
   - Resistance and History reporting keep their canonical scope card (T13 template omits it). History lists all canonical days (up to 20), not the 3 the template showed.
   - The Sandbox session `session-fixture-001` is the superset/variant session (matches T5), so T4's plain-exercise drawing differs below the summary.
   - The day contract has no session source field, so a day row reads "WALKING", not "WALKING · APPLE HEALTH".
   - The Apple-only session contract has no kind field, so T6's "CARDIO" tag is omitted. T6's metric cells come from the Server's own detail tokens, and only when every token is recognized; otherwise the line is shown verbatim.
   - Founder Production shows "Workout corrections aren't available here yet", as T4 shows. Sandbox keeps its local-only correction editor (existing behavior).
   - No Sandbox day is in progress (A4) or totals-only, so A4 is template-only. The code path renders the locked provenance and warning fields.
3. **Rasterization.** CoreText vs Chrome glyph advance widths occasionally re-wrap a long subtitle by one word.
4. **Sheets.** They keep their canonical medium/large detents.

## Behavior and accessibility

- **Unchanged:** routes, read models, scope filtering, reporting links and sheets, set formatting, HealthKit attachment wording (candidate stays amber "Possible match"), and correction semantics.
- **Existing identities preserved**, including `training-reporting-disclosure` and `training-report-<id>`. The shipping uppercase eyebrow labels ("TRAINING DAY", "WORKOUT DETAIL") stay literal uppercase for VoiceOver and tests.
- **New identities:** `evidence.page.header`, `evidence.back`, `evidence.scope.*`, `training.*`, `activity.*`.
- **Touch targets:** every control is at least 44 pt, through an expanded hit region; the visual size is unchanged.
- **Dynamic Type:** all text scales through `@ScaledMetric`.

## Tests

| Run | Result |
|---|---|
| Focused unit tests (Training, Activity, Nutrition, Weight, HealthKit fidelity, Evidence, SharedUI, AppTab, Recovery, Chart, Reconciliation) | 426 executed, 0 failures (1 pre-existing skip) |
| New `EvidenceTrainingNutritionWeightUITests` | 6/6: Training hierarchy and back trail, Reporting/Library routes, Activity, Nutrition, Weight disclosure, chart scroll/scrub |
| `EvidenceHubTimelineUITests` | 3/3 |
| Existing `TrainingAcceptanceUITests` Evidence journeys (corrected evidence, reporting, history/day/workout/correction, library/exercise) | 4/4 |
| `RecoverySleepAcceptanceUITests` | 3/3 |
| Generic Release compile | Passed: app, Watch app, Live Activity. DEBUG review seams are absent from the binary. |

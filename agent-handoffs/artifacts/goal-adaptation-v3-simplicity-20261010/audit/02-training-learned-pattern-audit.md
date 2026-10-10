# Audit: Training Logger and learned training intelligence

This is a read-only source audit via `git show`. Commits examined: Server production `85a98025` and Native Build 94 `49829781`.

## Exists in production

- **Weekday training routine.** Learned from logs, but for any resistance session, not per area. Source: `src/domain/intelligence/shared/BriefingIntelligence.js:51, 140-160, 557-566`.
  - Per-weekday rates are shrunk toward the overall rate.
  - It powers `FREQUENCY_CHANGE` and `ROUTINE_GAP` (missed-session runs) in briefings (`BriefingEvidencePicture.js:259-306`).
  - Baseline: 28 days (Weekly) or 56 days (Monthly), with at least 14 observable days.
  - Days with no tracking are never counted as missed. This is the only travel handling.
- **Logger "Suggested today."** Source: `TrainingLoggerSuggestionService.js`.
  - Picks the most frequent muscle-group combination for that weekday.
  - Requires 6+ confirmed sessions and 3+ repeats.
  - Pre-selection only.
- **Per-exercise performance.** Source: `TrainingPerformanceIntelligenceService.js`.
  - Volume (reps × load), best set, set count.
  - PRs: heaviest load, reps at load, session volume. Durable PR events are stored.
  - Trend: ±5% gives up or down; regressing at −15% or worse.
  - Status and confidence: 3+ comparable sessions = high.
  - Comparable sessions require the same exercise, the same Build 92 variant and the same superset partners.
- **No double counting of supersets.** Each set belongs to one exercise occurrence, and categories are counted as unique per session.
- **Exercise classification.** Exercises map to 11 canonical muscle groups via the catalog, user-defined exercises and heuristics (`trainingNavigationMapping.js:144-264`).
- **Strategy progression rule drives Logger recommendations.** Source: `TrainingProgressionPolicy.js`, `TrainingLoggerProgressionService.js`.
  - Needs 2+ comparable sessions, 2+ successful sessions and at least 14 days of exposure.
- **Goal training progress per 4 regions since phase start.** Source: `GoalTrainingProgressService.js:35-91`.
- **Monthly V3 short breaks and return to rhythm** (`MonthlyEvidenceIntelligenceV3.js:678-690`).
- **HealthKit cardio is excluded from training frequency by design**; it is presentation only.

## Partial or dormant

- **Monthly V3 weekly frequency per category versus the strategy or a personal baseline.** The code exists (`MonthlyEvidenceIntelligenceV3.js:393-440, 652-660`), but production passes `configuredSplit: null` and `baselineSessions: []`. Two bugs: weeks start on Sunday (the strategy says Monday), and the `body_region` vocabulary doesn't match the area keys.
- **Goal phase-review priority filter.** Likely broken: there is a case and taxonomy mismatch (`GoalTrainingProgressService.js:7, 130`).
- **Variant resolver.** Briefing, Goal and Home callers use the empty resolver, so renamed variants split their history on those surfaces.

## Does not exist

- **A mapping from the 11 muscle groups to the 6 Operating Plan areas** (arms, core, lower_body, back, chest, shoulders). Five inconsistent taxonomies are in use.
- **A learned weekly frequency per area**, or typical weekdays per area.
- **Weekly sets, hard sets or tonnage per area.** The reporting "Volume" and "Frequency" pages are placeholders.
- **e1RM.**
- **Evaluation of strategy expectations, `preferredRhythm`, `movedSessionPolicy` or `recoveryGates`.** These are stored only.
- **Observed or learned training content in the Operating Plan**, on Server or Native.
- **A travel, illness or deload marker.**
- **Logger-selected session areas stored on the session.** They exist only as a draft field.

## What a "Learned from recent workouts" feature would need

1. **One authoritative 11→6 mapping**, keyed on `primaryNavigationCategory`, plus a rule for secondary muscles.
2. **A per-area weekly learner:**
   - Monday-based local weeks;
   - a trailing 4–8 week window;
   - median frequency per area;
   - only weeks that were mostly observable;
   - a minimum of 3+ observable weeks and 6+ sessions.
3. **Wire planned vs observed.** Reuse `compareWeeklyFrequencies` after fixing the week-start and vocabulary bugs.
4. **Optional per-area weekly hard sets**, which need set-type rules.
5. **Travel and deload.** Either rely on the observability rule, or add a marker.
6. **Fix the Goal priority filter, and pass the variant resolver** to the briefing and goal calls.

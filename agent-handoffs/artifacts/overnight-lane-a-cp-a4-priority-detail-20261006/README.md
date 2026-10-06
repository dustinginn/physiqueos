# Overnight Lane A — Checkpoint A4: Priority Detail family

**Status: ready for Founder review (not accepted).**

- **Code commit:** `5f5df553` on `claude/overnight-lane-a-watch-live-priorities-capture-20261006`.
- **Base:** Build 88 `7fce3b97`.
- **Visual authority:** `priority-detail-ui-style-translation-20261004`. It is LOCKED, including the Tesamorelin single-Preparation correction.
- **Behavioral and visual reference:** the accepted Foam Rolling pilot `b65deb00`.

## Boards

- `boards/pd-dark.png`
- `boards/pd-light.png` (Mineral Light)

Each covers 14 variants/states. Each row shows:
- **left:** the locked board's first 402 pt screen;
- **right:** the real shipping SwiftUI on the iPhone 17 Pro simulator.

## Every production variant / state

| Variant | Template | Action set |
|---|---|---|
| Foam Rolling | manual | Mark Complete (navy, 52 pt) and Mark Skipped (44 pt). The skip confirmation dialog is unchanged. |
| Generic / reminder | manual | Same template. |
| Peptide (Tesamorelin) | dose-aware | "Took a different amount?" (planned dose prefilled), then Mark Complete and Mark Skipped. |
| Paused peptide (Retatrutide) | paused | Amber Paused notice with the date, then "Go to Retatrutide". No complete or skip. |
| Supplement (Fadogia) | manual | Mark Complete only. The quantity is never editable. |
| Morning Weigh-In, open | morning evidence | An "Evidence-driven" card and Log Weight, which opens Morning Check-In. |
| Morning Weigh-In, completed | morning evidence | The occurrence-bound related Weight and View Weight. Never a current-day fallback. |
| Progress Photos | photo evidence | Banner "The photo set completes with evidence.", then Upload Photos. |
| DEXA stages | DEXA evidence | Banner, then the stage action (View DEXA Appointment or Upload DEXA Results). |
| Completed | terminal | "Priority complete for today." |
| Skipped | terminal | "Skipped for today." |
| Setup required / inactive | continue | Server action (e.g. Review Support). |
| Failed / not found | unavailable | Centered `!`, title, supporting line, Try Again (reload). |

## Implementation

**One template for every variant:**
- The accepted pilot's geometry: 46 pt crumb plus divider, header, action zone, then divided sections with 28 pt tinted glyph tiles.
- Typography is `physiqueOSFont` (Jakarta, with Dynamic Type `@ScaledMetric`).
- There is no tab bar on the detail, as in the pilot.

**Template selection** (`PriorityDetailPresentation.template`) reads only canonical flags, the Server action destination and the related Weight. It never reads display copy.

**Foam palette migrated** from the view's private `FoamRollingPriorityPalette` into shared dynamic `PhysiqueOSTheme.priority*` tokens.
- The locked Priority values are exact (`#06121D` / `#F0EEE6` canvas, `#102432` surface, teal `#20C5B7`, navy `#123D61`, …).
- **Founder decision:** these differ slightly from the Home/utility `redesign*` set (`#061019` / `#E8ECE5`, teal `#3BD2CA`). I preserved the locked Priority values rather than drift the accepted pilot. Unifying the two sets is a one-line-per-token change if you want it.

**Section consolidation** (`groupedSections`):
- Consecutive same-titled sections merge into one: the locked "one Preparation section" rule. Every field is kept.
- This also fixes a latent SwiftUI identity collision: `PrioritySectionReadModel.id` is the title, so duplicate titles shared one `ForEach` id.

**Photos / DEXA action wiring** (`ProductionPriorityAPI.destination(forActionHref:)`): the narrow audited mapping gains three verified Server hrefs, each with a locked route and an existing Native destination.
- `/evidence/photos` → Photos intake.
- `/evidence/dexa` → DEXA intake.
- `/profile/operating-plan/execution/dexa` → DEXA appointment.
- Unknown hrefs stay `nil`; this is not a general web router.

**Preserved (untouched):**
- `priority.complete.v1` with `completionContext` and `expectedVersion`;
- the dose override only replaces the occurrence dose (the plan is unchanged);
- the skip confirmation and the skip `expectedVersion`;
- pause routing to the peptide screen;
- notification and deep-link routes and occurrence identity;
- pull-to-refresh invalidation;
- the removed Related Goals / Completion cards stay removed.

## Tests

**Unit — `PriorityReadModelTests`** (42 pass, 8 new):
- every variant maps to its template;
- Mark Complete is never offered for paused, skipped, completed or evidence-driven priorities;
- only a peptide with a planned dose is dose-aware (a supplement with a dose is not);
- state word and tone;
- Preparation consolidation keeps every field, with unique identities;
- section kinds;
- href mapping, including unknown hrefs giving `nil`;
- unavailable copy split.

**UI** (simulator, 3/3 pass):
- `testPriorityFamilyVariantsRenderTheirLockedActionsOnly` covers 12 variants, alternating dark and light. It checks the expected identifiers are present, invalid actions are absent, the primary action is at least 52 pt, and there is no tab bar.
- The accepted `testLockedDarkParityAndSkipSafety` and `testLockedMineralLightParity` still pass.

**`FounderServerAPITests`:** 252/252 pass (production decoding unchanged).

## Notes

- **DEBUG capture seam:** `-physiqueos.priority-pilot.variant <name>` extends the existing pilot seam with source-shaped fixtures that carry the exact board copy. It is compiled out of Release.
- **Status bar offset:** shipping content sits about 10 pt lower than the board's, because the real status bar replaces the board's 46 pt stand-in. This matches the accepted pilot.

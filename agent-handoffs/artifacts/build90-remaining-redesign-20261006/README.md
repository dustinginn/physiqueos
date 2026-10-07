# Build 90 remaining redesign: Energy + Recovery/Sleep review package

**Ready for Founder review. Not accepted, not merged.**

- **Base:** shipped Build 89 `51399425`.
- **Branch:** `claude/native-build90-remaining-redesign-20261006`.
- **How the boards were made:** every board puts the **locked reference** on the left and **real shipping SwiftUI** on the right.
  - Device: iPhone 17 Pro simulator, iOS 27, 402 pt.
  - Content: Sandbox fixtures only, with no Founder data. No simulator was connected to Founder Production.
  - Full pages are stitched from scroll-offset frames.

## Boards

Every board comes in a `-dark` and a `-light` (Mineral Light) version.

| Board | Contents |
|---|---|
| `energy-root-{dark,light}.png` | Energy root, full page (header, scope, Period Summary, Energy Over Time, Weekly Energy Balance, Weekly History, Recent Daily Energy) vs locked E1 + correction E1 |
| `energy-sheets-states-{dark,light}.png` | Weekly History sheet, Daily Energy History sheet (top and end, all five completeness tags), a selected week, loading, failed + Try again, and empty, vs locked correction E2 / E3 |
| `recovery-root-{dark,light}.png` | Recovery root full page (All Sleep), Build Lean Mass scope, a selected night, vs locked R1 |
| `recovery-trends-{dark,light}.png` | Sleep Trends 1M full page with Stage Mix open, a selected night, and the 6M weekly view, vs locked R2 + R3 + correction R2 (Continuity) |
| `recovery-night-{dark,light}.png` | Night Detail: a staged approximate-time night (full page), and additional sleep with Source & Data expanded, vs locked R4 + R5 + correction R1 (Timeline) |
| `recovery-sheet-states-{dark,light}.png` | All Nights sheet, and every async / absence state: loading, failed, not available, no data, Goal dates loading / failed / empty, night not found. The dark board adds the night variants: updating, unstaged and recalculating |

## Design authority

The Founder locked Energy and Recovery on 2026-10-04 (`1f8ba1b9` style translation; Founder correction `a21296ec`). Both are in the same `energy-weight-recovery` harness as Weight, which was implemented and accepted in Batch 3 CP-C.

This candidate therefore uses the **accepted Weight components** (`WeightSection`, `WeightStatTile`, `WeightScopePills`, `WeightStatePanel`, `WeightEmptyLine`, `WeightRow`) and the `.weight` Evidence family palette and type scale. It does not use a new design language.

## Deliberate deltas from the lock (Founder decisions)

1. **Energy expenditure is labeled as an estimate.** The summary tile reads "Avg Est. Expenditure" and the row fields read "Est. expenditure". One footnote sits under Period Summary: "Expenditure is estimated from RMR plus wearable active calories, so small balances are approximate." This applies the Build 90 prompt's no-false-precision intent. Values and formatting are unchanged. *Keep, or revert to the locked labels?*
2. **Energy calories keep the canonical `kcal` formatter** (`2603 kcal`). The lock shows `2,621 cal`, but that formatter is shared with Briefings, so it was not changed.
3. **Recovery Trends nightly Total Sleep** uses the locked R2 line + area in a field. The field starts one whole hour below the shortest night so variation stays readable. Bars (root, weekly) always start at 0.
4. **The Sleep Window chart keeps its row date labels and typical-window band.** The lock draws rows without labels. The labels preserve the existing Build 76 axis alignment.
5. **"Try again" was added** to the Energy, Recovery, Trends and Night failure panels. Before, only pull-to-refresh existed; R6 already locks Try again for Goal dates.
6. **Night Detail Source & Data** toggles with an accent "Details ⌄ / Hide ⌃" action instead of a bare chevron, so the 44 pt target is explicit.

## Interaction model

All charts use the accepted Evidence/Briefing arbitration:
- a **tap** selects the nearest point;
- a predominantly **horizontal pan** scrubs (`EvidenceHorizontalScrubGesture`, 1.35 directional bias);
- a **vertical swipe** that starts on a chart scrolls the page.

This removes the last two legacy `chartScrub` call sites in the app (Energy), which trapped vertical scrolling.

Per-surface behavior:
- **Root Sleep chart:** a tap still toggles a night (tap the same bar again to return to the averages).
- **Night Detail Timeline:** moves from `chartXSelection` to the same tap + horizontal-scrub model.
- **Recovery pages:** keep `suppressesContentAreaPopGesture` so a horizontal scrub never pops the page; the edge swipe still works.

## Back navigation fixed by construction

- **Energy** now records itself in the Evidence back trail. Pages pushed from it read `‹ Energy`, and pages pushed inside its sheets read `‹ Daily Energy History`.
- **Night Detail** reads its real parent: `‹ Recovery`, `‹ Sleep Trends` or `‹ All Nights`. Before, it was hard-coded to "Recovery".
- **The Energy weekly sheet** gains a Done button.

## DEBUG-only review seams

These are compiled out of Release:
- `-physiqueos.energy-recovery-review.state loading|failed|empty|not-available|night-not-found|scope-loading|scope-failed|scope-empty|weekly`. It wraps the Sandbox fixture APIs only.
- `.scope build-lean-mass|visible-abs`
- `.scroll-y <pt>`
- `.sheet energy-weekly|energy-daily|sleep-nights`
- `.sheet-scroll-y <pt>`
- `.expand stage-mix,source`
- `.select <week id | sleep day>`
- `.range 2w|1m|3m|6m|all`

Combine them with the existing `-physiqueos.appearance-review.route evidence:stream=energy` / `evidence:stream=recovery;stream=recovery/sleep/trends` and `-physiqueos.appearance-review.value dark|light`.

`weekly` exists because the 3-month Sandbox fixture never reaches the Server's 183-day weekly threshold. It groups the same fixture nights into Monday weeks.

## Post-capture change

After capture, one test-driven change landed: the Night Detail "Stage detail is being recalculated." notice now shows its title in bold ink on its own line above the detail. The boards show it as one muted line (recalculating night variant, dark board only). Nothing else changed after capture.

## Not representable with Sandbox fixtures

- **"In bed only" and "No sleep recorded" night rows.** The fixture has no such nights. They use the same row grammar, with the status text in place of the window.
- **Energy as-of / stale.** The canonical Energy contract has no as-of field, so this would need a Server change. Not designed.

## Also in this folder

- `COVERAGE-MATRIX.md`: Build 89 production-surface coverage matrix (A–E).
- `appendix-*.md`: the three read-only sub-audits behind the matrix, with file:line evidence.

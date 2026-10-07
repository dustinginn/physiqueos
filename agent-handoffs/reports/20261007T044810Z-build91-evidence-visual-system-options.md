# Build 91 Evidence visual system: mockups ready for Founder review

- **Task id:** `claude-build91-evidence-visual-system-design-20261007`
- **Prompt:** `agent-handoffs/inbox/prompts/20261007T033000Z-claude-build91-evidence-visual-system-design.md` @ `79e8c0ad`
- **Agent:** Claude. Design / real-SwiftUI mockups only.
- **Base authority:** Build 90 Native `32baf1d5` (validated pre-bump `8fab4fcb`)
- **Design branch:** `claude/build91-evidence-visual-system-20261007` (pushed, **not merged**)
- **Exact candidate SHA:** `a9e478ade1c4b2cefed500e146a3bda5f6b60fca`
  - DEBUG fixture code `6564b376`
  - review package `a9e478ad`
- **Review package:** `agent-handoffs/artifacts/build91-evidence-visual-system-20261007/` on the design branch (README, DESIGN-SYSTEM.md, 41 boards)
- **Production Server:** unchanged, `1b6687ff` / deployment `cbe6be96` (read-only check: `/api/v1/health/live` buildId `physiqueos-1b6687ff-20261006`, active deployment `cbe6be96`)

**What was not done:**
- no production implementation;
- no build bump;
- no TestFlight;
- no Server change or deploy;
- no production mutation.

No simulator was connected to Founder Production. The pages render Sandbox fixture data plus the existing DEBUG Evidence review fixtures. Photos are synthetic mannequins, so no Founder media appears.

**STATUS:** Build 91 Evidence visual-system options ready for Founder review.

---

## 1. Truth audit: the current Evidence tree

There are nine destinations, exactly the expected set: **Training, Nutrition, Weight, Progress Photos, DEXA, Activity, Energy, Recovery/Sleep, Timeline**.
- The Hub order is the Server stream order, with Timeline moved last.
- The `health-metrics` placeholder stream exists but is hidden.
- Timeline exists only in Founder Production (Sandbox has no Timeline stream).

**Production Timeline emits 10 event types:** Workout, Daily Activity, Weight, Progress Photo, DEXA, Daily Briefing, Daily Check-In, Analysis, Protocol, Evidence Upload.
- **It has no Nutrition, Energy or Sleep events**, so those category colors cannot appear on Timeline until the Server adds such events. Nothing was invented.
- Briefing, Check-In, Analysis, Protocol and Upload are system events: they get a neutral dot, and an upload failure keeps its danger red.

## 2. Surface audit and the ONE recommended shared hierarchy

Current state:
- **Training** (`.training`) has a teal-tinted surface set. This is the disliked blue-green wash, e.g. Mineral inset `#E3ECE7`, Dark card `#0D2325`.
- **Nutrition/Activity** (`.daily`) has a second, blue-teal tinted set.
- **Hub, Timeline, Weight, Energy, Recovery, Photos and DEXA** (six destinations plus the Hub) already share one neutral slate / warm-paper set. Its only problem is the Evidence-only accent: lime `#B9E467` in Dark, olive `#467221` in Mineral.

Recommendation: use the existing `.record` neutral set everywhere, with no category washes.

| Level | Dark | Mineral | Use |
|---|---|---|---|
| L0 page | `#0A141E` | `#F7F3E9` | canvas and nav bar |
| L1 card | `#101E2A` + 1 px `#263947` | `#EEE9DE` + 1 px `#C7C0B3` | hero, report, chart, scope cards |
| L2 inset | `#172733` | `#E4DED2` | metric tiles, inset rows, unselected pills, Area tiles |
| L3 track | `#1D303E` | `#DAD3C6` | selected track / pressed |
| rows | no fill, 1 px rules | same | lists |

Rules:
- Accent-soft (14% Dark / 12% Mineral) appears only behind small marks.
- The primary action is a shared neutral ink fill. It is never a full-width category color; the Photos lime slab is gone.
- Lime `green` becomes the existing Evidence semantic green `#68D391` / `#28744A`.
- Typefaces are unchanged this round: Training and Nutrition/Activity stay on Plus Jakarta Sans.

## 3. Icons restored (every Hub rectangle and every page hero)

All of these are established PhysiqueOS glyphs:

| Destination | SF Symbol |
|---|---|
| Training | `dumbbell.fill` |
| Activity | `waveform.path.ecg` |
| Nutrition | `fork.knife` (Home focus icon) |
| Weight | `scalemass.fill` |
| Progress Photos | `camera.fill` |
| DEXA | `person.fill.viewfinder` |
| Energy | `bolt.fill` |
| Recovery | `moon.fill` (Home sleep focus icon) |
| Timeline | `clock.arrow.circlepath` (web History glyph) |
| Hub header | `chart.bar.fill` (Evidence tab) |

Sources: the dormant native `EvidenceStreamPresentation` map (a port of the web's `EVIDENCE_ICON_PRESENTATION`), the shipping Home focus icons, `TrainingAreaIcon` and the Evidence tab icon.

Two choices are open:
- Nutrition: `fork.knife` or the dormant `carrot.fill`.
- Recovery: `moon.fill` or the dormant `bed.double.fill`.

## 4. Options and category maps

Every accent is an existing token:
- **Dark** values: `redesignPurple`, `redesignTeal`, `redesignGreen`, `redesignAmber`, `redesignCyan`, `chartEvidence` blue, `mealSnacks` rose, `mealBreakfast` orange.
- **Mineral** values: the deepest existing ink of the same family.

| Destination | **A: distinct per domain** | **B: four families by body system** | **C: three families by evidence role** |
|---|---|---|---|
| Training | Purple | Purple (training load) | Purple (input) |
| Activity | Amber | Purple (training load) | Teal (signal) |
| Nutrition | Green | Amber (fuel) | Purple (input) |
| Energy | Orange | Amber (fuel / balance) | Teal (signal) |
| Weight | Blue | Blue (body composition) | Green (outcome) |
| DEXA | Cyan | Blue (body composition) | Green (outcome) |
| Progress Photos | Rose | Blue (body composition) | Green (outcome) |
| Recovery / Sleep | Teal | Teal (recovery) | Teal (signal) |
| Timeline / Hub | Neutral | Neutral | Neutral |

- **A, distinct stable domain colors.** This is the web's established Evidence icon palette, moved onto PhysiqueOS tokens; Energy moves off violet because Training owns purple. It has the most identity per page. But adjacent hues crowd: amber Activity vs orange Energy, and teal / cyan / blue in Dark. Orange fails Mineral eyebrow-text contrast (4.12:1 on page), and no deeper existing orange ink exists.
- **B, four reusable families.** Training load, fuel, body composition and recovery. The Hub reads as four groups, and Timeline has four event colors plus neutral. Every family passes text AA in both appearances.
- **C, three role families.** Inputs (purple), signals (teal) and outcomes (green). This is the calmest Hub. Green ties outcomes to the app's Confidence/success green. That green is not the removed lime/olive, but a third of the Hub is green again.

## 5. Semantic chart colors are preserved

The fixture replaces only surfaces, accent and accent-soft, and the lime `green` slot. These are untouched:
- Nutrition macros and meals: Calories green, Protein rose, Carbohydrates amber, Fat sky.
- Energy: Intake amber vs Estimated expenditure blue.
- Weight: trend line blue vs DEXA marker purple.
- DEXA: core-trend green / Fat Mass amber, and the Since Prior Scan deltas.
- Sleep: nightly total, 7-night average and Sleep Window.
- Status badges and the Timeline danger red.

Where an accent coincides with a series:

| Option | Coincidence |
|---|---|
| A | Nutrition green = Calories green; Recovery teal = sleep total teal |
| B | **Energy amber = Intake amber**, so the selected range pill can read as "intake"; Nutrition amber ≈ Carbohydrates |
| C | Outcome green = DEXA core-trend / Calories green |

## 6. Accessibility

Full tables are in DESIGN-SYSTEM.md §8.
- **Contrast:**
  - Text AA (4.5:1) passes on page and card in both appearances for every family except **Option A orange in Mineral (4.12 page / 3.77 card)**.
  - Every icon-on-tile clears 3:1; the minimum is 3.55, for orange.
  - Lime in Build 90 measured 4.70 on a Mineral card. Every B and C family is ≥ 4.52.
- **Identity never relies on color alone:** each Hub row has an icon and a title, and each Timeline event has an icon or dot plus the type label.
- **Selected controls** add a ring or a fill, not just hue.
- **Dark/Mineral parity** keeps one hue per family.
- **Multi-series charts** keep their semantic colors and legends.

## 7. Boards

All boards are in `agent-handoffs/artifacts/build91-evidence-visual-system-20261007/boards/`.
- `B91-00-category-map.png`: all nine destinations. Real Hub tile crops (icon + accent) in Mineral and Dark for Build 90 / A / B / C, with family, hex values and rationale.
- `B91-compare-01..10-<page>.png`: Build 90 | A | B | C side by side, Mineral rows then Dark rows.
  - Pages: 01 Hub (Recently Used + All Evidence), 02 Training, 03 Nutrition, 04 Weight, 05 Energy, 06 Recovery/Sleep, 07 Progress Photos, 08 Timeline, 09 Activity, 10 DEXA.
- `B91-{A,B,C}-01..10-<page>.png`: per-option boards. Each has every captured frame (top / middle / end) in Mineral Light and Dark.

Raw capture: 190 frames (iPhone 17 Pro sim, iOS 27, 1206×2622). Three frames that loaded slowly under machine load were re-shot and verified.

## 8. Recommendation (for the Founder to decide)

**I'd lean toward Option B.**
- It is the only option where every family passes text AA in both appearances while each destination still keeps a stable color.
- Its four groups are easy to learn from the Hub and read cleanly on Timeline.
- It leaves room for future Timeline event types (Nutrition / Energy / Sleep) without adding hues.

Its main cost is that the Energy page accent matches the Intake series. If that bothers you, Option B with Energy moved to the neutral or teal family is a small variant.

**Choose C** if you prefer the calmest Hub and the inputs / signals / outcomes story.

**Choose A** only if a unique color per destination matters more than contrast and hue separation. It would need one new, deeper orange ink, which goes against "existing tokens only".

**Founder decisions:**
1. **Option** A, B or C (or a variant).
2. **Icons:** Nutrition `fork.knife` vs `carrot.fill`; Recovery `moon.fill` vs `bed.double.fill`.
3. **Typography:** confirm it stays out of scope (Training and Nutrition/Activity keep Jakarta).

## 9. Implementation notes (for after selection)

The mockup mechanism is a DEBUG global category set by the router plus a palette override. It is **not** the implementation.

A production Build 91 implementation should:
- replace the per-family palettes with one shared Evidence surface palette plus an environment-carried category accent;
- port the icon map into a shared `EvidenceStreamPresentation`;
- remove the seam;
- update the Evidence UI tests that key on the letter tiles, if any;
- run full unit / Evidence UI / Release gates.

Release already compiles none of the fixture: a Release build succeeded, and its binary contains 0 seam strings.

## 10. Confirmations

- No production implementation.
- No build bump (next build remains 91).
- No TestFlight upload.
- No Server change.
- No production mutation.
- Design branch pushed, not merged. latest.json is unchanged (still Build 90). This report is report-only.

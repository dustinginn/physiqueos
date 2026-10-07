# Build 91 Evidence visual system: audit, shared rules and three options

## 1. Current Evidence tree (what production actually has)

**Hub streams.** The Founder Production Hub stream list is `ProgressReportingService.js`. Native `EvidenceHubPresentation` presents it in this order:

| # | Hub row | Stream id | Native destination | Locked family (palette) |
|---|---|---|---|---|
| 1 | Training | `training` | `TrainingHistoryView` (+ Day / Session / Exercise / Area / Library / Reporting) | `.training` |
| 2 | Nutrition | `nutrition` | `NutritionHistoryView` (+ Day / Reporting) | `.daily` |
| 3 | Weight | `weight` | `WeightHistoryView` | `.weight` |
| 4 | Photos (title "Progress Photos") | `photos` | `PhotosHistoryView` (+ Photo Set Detail) | `.record` |
| 5 | DEXA | `dexa` | `DEXAHistoryView` | `.record` |
| 6 | Activity | `activity` | `ActivityHistoryView` (+ Activity Day) | `.daily` |
| 7 | Energy | `energy` | `EnergyHistoryView` | `.weight` |
| 8 | Recovery | `recovery` | `RecoveryEvidenceView` (+ Trends / Night Detail) | `.weight` |
| 9 | Timeline | `timeline` | `TimelineView` (moved last by the Hub) | `EvidenceLockedStyle` |

`health-metrics` is a placeholder stream. The Hub hides it.

Timeline is Founder Production only. The Sandbox authority has no Timeline stream, so the captures use the DEBUG Evidence review fixture.

**Timeline event types.** Production emits exactly 10 types (`EvidenceTimelineService.js`): Workout, Daily Activity, Weight, Progress Photo, DEXA, Daily Briefing, Daily Check-In, Analysis, Protocol, Evidence Upload.

**Production Timeline has no Nutrition, Energy or Sleep events today.** So Nutrition, Energy and Recovery colors never appear on Timeline until the Server adds those event types. The mockups do not invent them.

## 2. Surface audit (Dark / Mineral Light)

| Surface set | page | card (`surface`) | inset (`surface2`) | rule | accent | Used by |
|---|---|---|---|---|---|---|
| `.training` | `#071416` / `#F1EEE6` | `#0D2325` / `#FAF8F2` | `#102B2C` / **`#E3ECE7`** | `#294344` / `#C7D1CB` | purple `#AE8CFA` / `#6F4FB3` | Training (teal-tinted wash, the disliked one) |
| `.daily` | `#061219` / `#F3EFE6` | `#102A34` / `#F8F5ED` | `#153641` / **`#E6F0EC`** | `#25444E` / `#C8D4CF` | teal `#69D8CD` / `#0B766F` | Nutrition, Activity (blue-teal tint) |
| `.weight` | `#0A141E` / `#F7F3E9` | `#101E2A` / `#EEE9DE` | `#152633` / `#E5DFD2` | `#243746` / `#C9C2B5` | **lime `#B9E467` / olive `#467221`** | Weight, Energy, Recovery |
| `.record` | `#0A141E` / `#F7F3E9` | `#101E2A` / `#EEE9DE` | `#172733` / `#E4DED2` | `#263947` / `#C7C0B3` | **lime / olive** | Photos, DEXA |
| `EvidenceLockedStyle` | `#0A141E` / `#F7F3E9` | `#101E2A` / `#EEE9DE` | `#152633` / `#E4DED2` | `#263947` / `#C7C0B3` | **lime / olive** | Hub, Timeline |
| `.workflow` | `#06131E` / `#EFEEE7` | … | … | … | teal | Intake / Review (a Log-side workflow; out of scope, unchanged) |

Six of the nine destinations already sit on one neutral slate / warm-paper hierarchy (`.weight` / `.record` / Hub). Only Training and Nutrition/Activity carry bespoke tinted surfaces. The lime/olive accent is the only thing that is Evidence-only.

## 3. Recommended shared surface hierarchy (identical in every option)

There is one hierarchy: the existing `.record` neutral set. Training and Nutrition/Activity migrate onto it. Nothing new is invented.

| Level | Dark | Mineral | Use |
|---|---|---|---|
| L0 page | `#0A141E` | `#F7F3E9` | canvas and flat nav bar; 1 px rule at 74% |
| L1 card | `#101E2A` + 1 px `#263947` | `#EEE9DE` + 1 px `#C7C0B3` | hero card, report card, chart container, scope card (radius 13–14) |
| L2 inset | `#172733` | `#E4DED2` | metric tile, inset row, unselected pill, Training Area tile |
| L3 pressed / track | `#1D303E` | `#DAD3C6` | selected track, pressed state |
| list rows | no fill | no fill | 1 px rules only |
| text | ink `#F4F1E9`, sub `#BDC6C9`, quiet `#87969D` | ink `#162028`, sub `#46535B`, quiet `#69767C` | |

The rules:
- **No category ever tints a card or page.** Category identity comes only from the accent slots in §4.
- **Accent-soft** (accent at 14% Dark / 12% Mineral) is allowed only behind small marks: the Hub tile, the hero mark, the Timeline node, badges.
- **The primary action is shared and neutral:** ink fill with page-color text. Photos' "Read Photo Briefing" was a full-width lime slab. It must not become a full-width category slab either.
- **Hierarchy stays.** Hero / card / tile / row / chart keep distinct elevation and border treatments; they are now shared rules, not category washes.
- **Semantic green** is the existing Evidence green `#68D391` / `#28744A`. It replaces the Weight harness's lime `green` slot, so no lime or olive survives anywhere.
- **Not changed this round:** typefaces and metrics. Training and Nutrition/Activity keep Plus Jakarta Sans; the rest keep SF Pro. That is a separate decision if the Founder wants full typographic unification.

## 4. Where a category accent may appear

- Evidence Hub tile: the real icon in the accent, on accent-soft.
- Page hero mark: the same icon, 38–40 pt circle.
- Eyebrow (`EVIDENCE REPORT`).
- Selected scope pill: the ring/text on record pages. Training/Nutrition keep their ink-filled selected pill.
- Links and section actions (`Show All ›`, `See trends ›`, `View Training Day →`).
- Small badges.
- A single category-semantic chart series, only where no data-semantic color applies.
- Timeline: the event node icon and the type label.

**The accent is never used on:** card or page backgrounds, a full-width primary action, Hub chevrons (now neutral, because the tile already teaches the color), or multi-series charts.

## 5. Icons (restored on every Hub rectangle and every page hero)

Every glyph already exists in PhysiqueOS. Sources: the dormant native `EvidenceStreamPresentation` map, which ports the web's `EVIDENCE_ICON_PRESENTATION`; the shipping Home/Priority focus icons; and `TrainingAreaIcon`.

| Destination | SF Symbol | Established source |
|---|---|---|
| Training | `dumbbell.fill` | EvidenceStreamPresentation, TrainingAreaIcon default, web `Dumbbell` |
| Activity | `waveform.path.ecg` | EvidenceStreamPresentation, web `Activity` |
| Nutrition | `fork.knife` | Home focus icon `utensils` (shipping); preferred over the dormant `carrot.fill` |
| Weight | `scalemass.fill` | EvidenceStreamPresentation + Home focus `scale`, web `Scale` |
| Progress Photos | `camera.fill` | EvidenceStreamPresentation + Home focus `camera`, web `Camera` |
| DEXA | `person.fill.viewfinder` | EvidenceStreamPresentation (web `ScanLine` equivalent) |
| Energy | `bolt.fill` | EvidenceStreamPresentation, web `Zap` |
| Recovery / Sleep | `moon.fill` | Home focus `moon` (shipping sleep priority); preferred over the dormant `bed.double.fill` |
| Timeline | `clock.arrow.circlepath` | web "History" glyph. The dormant native map used `list.bullet.clipboard.fill`, which reads as a checklist |
| Hub header | `chart.bar.fill` | the Evidence tab icon (`AppTab.evidence`) |

Only two choices are open. Nutrition could use `fork.knife` or `carrot.fill`, and Recovery could use `moon.fill` or `bed.double.fill`. The boards show `fork.knife` and `moon.fill`.

## 6. The three options

All accents are existing PhysiqueOS tokens:
- **Dark** values: `redesignPurple`, `redesignTeal`, `redesignGreen`, `redesignAmber`, `redesignCyan`, `chartEvidence` (blue), `mealSnacks` (rose), `mealBreakfast` (orange).
- **Mineral** values use each family's deepest existing ink: `redesignAmberInk`, `redesignCyanInk`, and the Evidence teal/green/blue inks.

| Destination | A: distinct per domain | B: four families by body system | C: three families by evidence role |
|---|---|---|---|
| Training | Purple | Purple (training load) | Purple (input: what you do) |
| Activity | Amber | Purple (training load) | Teal (signal: body reports) |
| Nutrition | Green | Amber (fuel) | Purple (input) |
| Energy | Orange | Amber (fuel / energy balance) | Teal (signal) |
| Weight | Blue | Blue (body composition) | Green (outcome: what changes) |
| DEXA | Cyan | Blue (body composition) | Green (outcome) |
| Progress Photos | Rose | Blue (body composition) | Green (outcome) |
| Recovery / Sleep | Teal | Teal (recovery) | Teal (signal) |
| Timeline / Hub | Neutral | Neutral | Neutral |
| Families used | 8 + neutral | 4 + neutral | 3 + neutral |

**Option A, distinct stable domain colors.** This is the web's established Evidence icon palette translated to PhysiqueOS tokens. Energy moves off violet, because Training owns purple. Every destination is unique, but adjacent pairs are close:
- amber Activity vs orange Energy;
- teal Recovery vs cyan DEXA vs blue Weight in Dark.

Orange is the only family with no existing ink deep enough for Mineral eyebrow text (§8).

**Option B, four reusable families by body system.** Training load, fuel, body composition and recovery. The Hub reads as four visual groups, and Timeline has four event colors plus neutral. Each family clears AA text contrast in both appearances.

**Option C, three families by evidence role.** Inputs (purple), signals (teal) and outcomes (green). This is the calmest Hub. Green ties the outcome pages to the app's Confidence/success green. That is a different color from the removed lime/olive (`#55E39A` / `#28744A` vs `#B9E467` / `#467221`), but half the Hub is still green.

## 7. Semantic data colors are preserved

The DEBUG fixture replaces only surfaces, `accent` / `accentSoft` and the Weight harness's lime `green` slot. Every other palette slot passes through unchanged:
- **Nutrition macros:** Calories green; Protein `#FB7185` / `#B83C57`; Carbohydrates `#FBBF24` / `#9D6808`; Fat `#38BDF8` / `#14769F`. Meal colors too.
- **Energy:** Intake amber vs Estimated expenditure blue, on both the line and the weekly bars.
- **Weight:** trend line blue vs DEXA marker purple.
- **DEXA:** core trends green / Fat Mass amber, and the Since Prior Scan deltas.
- **Sleep:** nightly total teal, 7-night average dashed, Sleep Window bars.
- **Statuses:** "Still updating" amber, Complete / Estimated badges, Timeline danger red.

**Where an accent coincides with a semantic series** (acceptable, but worth knowing):

| Option | Coincidence |
|---|---|
| A | Nutrition green = Calories green. Weight blue ≈ weight trend line (single-series, allowed). Recovery teal = sleep total teal |
| B | Energy amber = Intake series amber, so the Energy page's selected range pill reads like "intake". Nutrition amber ≈ Carbohydrates amber. Body-composition blue = weight trend line |
| C | Outcome green = DEXA core-trend green and Calories green. Recovery / Activity / Energy teal = sleep total teal |

## 8. Accessibility

Contrast on the shared surfaces (WCAG 2.x):
- Eyebrow / link text needs 4.5:1.
- The icon on its accent-soft tile is a graphic and needs 3:1.

| Family | Dark: text on page | Dark: icon on tile | Mineral: text on page | Mineral: text on card | Mineral: icon on tile |
|---|---|---|---|---|---|
| Purple | 7.64 | 6.14 | 6.12 | 5.60 | 5.10 |
| Teal | 9.95 | 7.59 | 4.94 | 4.52 | 4.20 |
| Green | 11.35 | 8.50 | 5.14 | 4.70 | 4.39 |
| Amber | 10.28 | 7.91 | 5.38 | 4.93 | 4.57 |
| Cyan | 9.11 | 7.07 | 5.11 | 4.68 | 4.33 |
| Blue | 7.30 | 5.88 | 5.21 | 4.77 | 4.42 |
| Rose | 7.01 | 5.80 | 5.32 | 4.87 | 4.49 |
| **Orange (A only)** | 8.20 | 6.59 | **4.12 ✗** | **3.77 ✗** | 3.55 |
| Neutral | 10.57 | 7.97 | 7.15 | 6.55 | 6.00 |
| Lime (Build 90) | 12.69 | 9.33 | 5.14 | 4.70 | 4.41 |

- **Contrast:** every family passes text AA on page and card in both appearances, except Option A's orange in Mineral. Fixing it needs a new deeper orange ink, which is not an existing token. Every icon tile clears 3:1 (lowest 3.55).
- **Selected vs unselected controls:**
  - Record-family pills: selected = accent text + accent ring on `surface2`; unselected = quiet text.
  - Training/Nutrition pills: selected = ink fill.
  - Selection never relies on hue alone; it adds a ring or a fill.
- **Color is never the only cue.** Every Hub row has an icon and a title. Every Timeline event has an icon or a neutral dot plus the type label in text. Pages carry the title and the hero icon.
- **Dark/Mineral parity:** each family maps to the same hue in both appearances, using the deeper ink in Mineral.
- **Charts** keep their semantic colors and legends, and every multi-series chart has a legend.

## 9. How this was produced

The pages are the real shipping SwiftUI. A DEBUG-only fixture, `-physiqueos.b91.evidence-system a|b|c`, swaps the palette surfaces and the accent through the existing `EvidenceFamily.palette` / `EvidenceLockedStyle` paths. It also restores icons on the Hub tiles, hero marks and Timeline nodes, and neutralizes the Photos primary action and the Hub chevrons. The routed page's category is set by `AppDestinationRouterView` (DEBUG).

- **Release:** compiles none of it.
- **This is a mockup mechanism, not the implementation.** A shipping version would carry the category in the SwiftUI environment instead of a global, and would replace the per-family palettes with one shared palette plus a category accent.

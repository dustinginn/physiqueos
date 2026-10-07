# Build 91 Evidence Option A: implementation ready for later integration

- **Task id:** `claude-build91-evidence-option-a-implementation-20261007`
- **Prompt:** `agent-handoffs/inbox/prompts/20261007T053000Z-claude-build91-evidence-option-a-implementation.md` @ `2c3b7605`
- **Agent:** Claude A, in the same Evidence visual-system conversation and worktree. No new session or worktree.
- **Base authority:** shipped Build 90 Native `32baf1d5`
- **Design authority:** Option A, design `a9e478ad`, report `549dcc26`
- **Candidate branch:** `claude/build91-evidence-option-a-20261007` (pushed, **not merged / not integrated**)
- **Exact candidate SHA:** `a399387b0aa37a2d0e70d0acfac11334796a7d62`
  - code `72ff7353` (Option A)
  - code `a44a8a12` (Mineral semantic-ink contrast)
  - `a399387b` (proof boards)
- **Proof boards:** `agent-handoffs/artifacts/build91-evidence-option-a-20261007/` on the candidate branch
- **Production Server:** unchanged, `1b6687ff` / deployment `cbe6be96` (read-only health and doctl check)

**STATUS:** Build 91 Evidence Option A implementation ready for later integration.

**Not done:** no Build 91 integration, no bump (still 1.0 (90)), no archive, no TestFlight, no Server change, no production mutation. Claude B's Operating Plan / DEXA appointment / Peptides / Watch work was not touched.

---

## 1. Founder Option A decisions as implemented

| Destination | Accent (Dark / Mineral) | Icon |
|---|---|---|
| Training | Purple `#AA98FF` / `#5C3FD2` | `dumbbell.fill` |
| Activity | Amber `#EFB84F` / `#925500` | `waveform.path.ecg` |
| Nutrition | Green `#55E39A` / `#28744A` | **`fork.knife`** |
| Energy | Orange `#FB923C` / **`#9A4C10`** | `bolt.fill` |
| Weight | Blue `#60A5FA` / `#176D92` | `scalemass.fill` |
| DEXA | Cyan `#3BC6DD` / `#10708A` | `person.fill.viewfinder` |
| Progress Photos | Rose `#F472B6` / `#A83B78` | `camera.fill` |
| Recovery / Sleep | Teal `#3BD2CA` / `#0B766F` | **`moon.fill`** |
| Timeline / Hub | Neutral `#BCC5C8` / `#46535B` | `clock.arrow.circlepath` / Evidence tab `chart.bar.fill` |

- **Typography:** unchanged. Training and Nutrition/Activity keep Plus Jakarta Sans; the other pages keep SF Pro.
- **Removed:** the lime `#B9E467` and olive `#467221` Evidence accents, everywhere.

## 2. Energy Mineral contrast disposition

1. **Searched first:** the existing orange and amber inks, measured against the shared Mineral page / card / inset (`#F7F3E9` / `#EEE9DE` / `#E4DED2`):

| Existing token | Hue | Page / card / inset | Result |
|---|---|---|---|
| `mealBreakfast` `#B65E16` | 27° | 4.12 / 3.77 / 3.41 | fails AA |
| `.record` amber `#A75F18` | 30° | 4.41 / 4.04 / 3.65 | fails AA |
| `.weight` amber `#AD641C` | 30° | 4.11 / 3.76 / 3.40 | fails AA |
| `carbs` `#9D6808` / breakfast ink `#9D6709` | 38–39° | about 4.3 / 3.9 / 3.6 | fails AA, and reads amber |
| `redesignAmberInk` `#925500` | 35° | 5.38 / 4.93 / 4.45 | passes, but it is Activity's amber; using it would merge Energy into Activity |

2. **Created:** one shared, semantically named token, `PhysiqueOSTheme.redesignOrangeInk`. It follows the existing `redesignAmberInk` / `redesignCyanInk` pattern.
   - Dark keeps the approved `#FB923C`, so Dark Option A is unchanged.
   - Mineral is `#9A4C10`: the same 26–27° orange hue, deeper. It measures **5.55 page / 5.08 card / 4.59 inset**, so normal text is AA everywhere, including the inset.
3. **Wiring:** the Evidence registry's orange equals the token, and a test asserts it.

## 3. Shared surface implementation

There is **one** surface hierarchy, `EvidenceSurfaces` in `EvidenceKit.swift`. It is the neutral set that Hub, Timeline, Weight, Energy, Recovery, Photos and DEXA already used.

| Level | Dark | Mineral | Use |
|---|---|---|---|
| L0 page | `#0A141E` | `#F7F3E9` | canvas, nav bar |
| L1 card | `#101E2A` + 1 px `#263947` | `#EEE9DE` + 1 px `#C7C0B3` | hero, report, chart, scope cards |
| L2 inset | `#172733` | `#E4DED2` | metric tiles, inset fields, unselected pills |
| L3 | `#1D303E` | `#DAD3C6` | deep sections, selected tracks |
| lists | no fill | no fill | 1 px rules only |

Text uses ink `#F4F1E9` / `#162028`, sub `#BDC6C9` / `#46535B` and quiet `#87969D` / `#69767C`.

**Architecture:**
- **Shared surfaces:** every `EvidencePalette` family (`.training`, `.daily`, `.weight`, `.record`) takes its surfaces and text from `EvidenceSurfaces`. `EvidenceLockedStyle` (Hub and Timeline) aliases the same tokens. Each family keeps only its typeface, harness metrics and **semantic** colors. `.workflow` (Log-side intake/review) is unchanged.
- **Domain registry:** `EvidenceDomain` in `SharedUI/EvidenceStreamPresentation.swift`, which replaces the dead `EvidenceStreamPresentation` map. It maps stream ID and Timeline type to a domain, and holds each domain's icon and its `EvidenceAccent` (Dark / Mineral pair, plus the soft small-mark tint). This is the only mapping; there are no page-by-page duplicates.
- **Projection:**
  - Pages set `.evidenceDomain(.x)` next to `.evidenceFamily(...)`.
  - `EvidenceMetrics(family:domain:)` applies the domain accent; Training implies `.training`.
  - Shared Evidence components read the domain from the environment; with no domain the accent is neutral, never lime.
  - The DEBUG design seam from `6564b376` is **not** carried. This branch starts from Build 90.

**Retired washes:**
- Training's teal surface set.
- Nutrition/Activity's blue-teal set.
- The Training `.analytical` teal field, which is now an L2 inset with a rule.
- Teal provenance tints, which are now L2 with an accent rail or dot.
- The purple superset field, which is now L2; the purple label and rail are kept as relationship semantics.
- The teal highlighted metric tile, which is now L2 with a 1 px accent ring.
- The Weight harness's lime `green`, which is now the Evidence semantic green `#68D391` / `#28744A`.
- The Photos "Read Photo Briefing" lime slab, which is now the shared neutral primary action: ink fill with a page-color label.

**Where the accent appears:** the Hub tile, the hero mark, eyebrows, links and chevrons on daily rows, record-page selected pills, small tags, spinners, and single-series category charts. That last one is Nutrition's calories/meals trend, which was already teal-as-accent. Hub chevrons are now neutral.

**Contrast follow-up (`a44a8a12`):** the shared Mineral card and inset are darker than Training's and Nutrition/Activity's old raised surfaces. That dropped several of their semantic text inks; Training's PR green went from 5.03 to 4.41, and an existing contrast test caught it.
- **Fix:** only those Training/Daily Mineral semantic inks are deepened, keeping the same hue (lightness −2 to −5%), so **no semantic text loses contrast vs Build 90** on page, card or inset.
- **Untouched:** Dark, and the Weight / Energy / Recovery / Photos / DEXA inks.
- **Changes in Mineral:**
  - macros: Protein `#B83C57`→`#A7364F`, Carbohydrates `#9D6808`→`#905F07`, Fat `#14769F`→`#126C91`;
  - Calories green: `#277B51`→`#24704A`;
  - Training PR green: `#187A4E`→`#167048`;
  - the matching teal / amber / red / purple / blue / meal inks.
- **Regression test:** asserts each ink against its Build 90 ink/surface pair.

## 4. Icon implementation

- **Hub:** each rectangle shows `EvidenceHubTile`, the domain SF Symbol in its accent on the accent-soft 30 pt tile. The letter tiles T/N/W/P/D/A/E/R/⌁ are gone. A stream with no domain gets a neutral `list.clipboard.fill`.
- **Page heroes:** `EvidenceDomainMark` (38–40 pt) appears on the Training, Nutrition, Activity, Weight, Energy, Photos, DEXA and Recovery report landings. Recovery's landing gains the mark its siblings already had. Child pages (Training Day, Trends and so on) still have no mark.
- **Timeline:** Workout, Daily Activity, Weight, Progress Photo and DEXA events wear their domain icon and accent in the same 16 pt node footprint.
  - Daily Briefing, Daily Check-In, Analysis, Protocol and Evidence Upload are neutral dots; failures stay danger red.
  - No Nutrition, Energy or Sleep events were invented; production doesn't emit them.
- **Accessibility:** marks are `accessibilityHidden`. Hub row labels, identifiers and order are unchanged. Identity is always icon plus title or type text.

## 5. Semantic data colors are preserved (independent of accent)

The following are unchanged in Dark. In Mineral, only the contrast-preserving deepening in §3 applies.
- Nutrition macro and meal colors (`NutritionEvidenceMacro` stays the one authority).
- Energy: Intake amber vs Estimated expenditure blue.
- Weight: line blue vs DEXA marker purple.
- DEXA: core-trend green / Fat Mass amber.
- Sleep: `SleepPalette` total / deep / core / REM / awake.
- Status amber / red, rail tones and trend tones.

Tests assert each of these.

## 6. Files changed

27 files; +930 / −332 lines in code and tests.

- **SharedUI:**
  - `EvidenceStreamPresentation.swift`: the `EvidenceDomain` registry, `EvidenceAccent`, the `evidenceDomain` environment and `EvidenceDomainMark`.
  - `PhysiqueOSTheme.swift`: `redesignOrangeInk`.
- **Evidence kit:** `EvidenceKit.swift`, `EvidenceKitComponents.swift`, `EvidenceRecordComponents.swift`, `EvidenceHeaderView.swift`, `EvidenceStreamRowView.swift`, `EvidenceView.swift`, `TimelineView.swift`.
- **Pages** (domain declaration, hero marks, accent-as-teal fixes):
  - Activity: Day, History.
  - Nutrition: Day, History, Reporting, ReportingChart, ReportingRow.
  - Weight: History.
  - Energy: History, Chart.
  - Recovery: `RecoverySleepViews`, `SleepEvidenceCharts`.
  - Photos: History, SetDetail.
  - DEXA: History, Chart.
  - Training: `TrainingHistoryView`.
- **Tests:** `PhysiqueOSTests/EvidenceReadModelTests.swift` gains `EvidenceVisualSystemTests` (16 tests).
- **Project:** no new files, no generator or pbxproj change.

## 7. Verification

| Gate | Result |
|---|---|
| Focused: `EvidenceVisualSystemTests` (16) + `TrainingSessionDetailPresentationTests` (19) | **35/0** |
| Focused: `EvidenceReadModelTests` + `EvidenceHubUsageTests` + visual-system tests (first pass) | 42/0 |
| Full `PhysiqueOSTests` at `a44a8a12` | **2175 executed, 0 failures, 1 skipped** |
| First full run, at `72ff7353` | 1 failure: the Training PR-green contrast test (4.41 < 4.5). This was a real regression; fixed in `a44a8a12` |
| Evidence UI suites | **53 tests**, see below |
| Generic iOS Release compile at `a44a8a12` | **BUILD SUCCEEDED** |
| Release seam scan (app / Live Activity / Watch) | **0** `-physiqueos.*` / `-watch*` flags; **0** review/fixture types |
| `verify_release_configuration.py` | OK, 1.0 (90) |
| Generator determinism | 0 pbxproj diff |
| `git diff --check` | clean |

The 53 UI tests cover:
- `RecoverySleepAcceptanceUITests`, `EvidenceHubTimelineUITests`, `EvidenceTrainingNutritionWeightUITests`, `EvidencePhotosDEXAUITests`, `EvidenceIntakeReviewUITests`, `EnergyRecoveryRedesignUITests`;
- `TrainingAcceptanceUITests` (20).

The UI result is 51 passed on the first run. `testBuild89TrainingDetailReview{Dark,MineralLight}` completed every navigation and assertion, then failed writing the screenshot: "No space left on device". The shared disk was transiently full. Both reran and passed, so the result is **53/0**.

One side effect: that run rewrote tracked `home-screen-widget-v1` artifact PNGs, which a capture test writes there. They were restored and are not in the candidate.

Accent contrast on the shared surfaces (text needs 4.5:1; icon on tile needs 3:1):

| Accent | Dark page / card | Mineral page / card | Icon on tile (Dark / Mineral) |
|---|---|---|---|
| Purple | 7.64 / 6.96 | 6.12 / 5.60 | 6.14 / 5.10 |
| Amber | 10.28 / 9.38 | 5.38 / 4.93 | 7.91 / 4.57 |
| Green | 11.35 / 10.35 | 5.14 / 4.70 | 8.50 / 4.39 |
| Orange | 8.20 / 7.48 | **5.55 / 5.08** | 6.59 / 4.69 |
| Blue | 7.30 / 6.65 | 5.21 / 4.77 | 5.88 / 4.42 |
| Cyan | 9.11 / 8.30 | 5.11 / 4.68 | 7.07 / 4.33 |
| Rose | 7.01 / 6.39 | 5.32 / 4.87 | 5.80 / 4.49 |
| Teal | 9.95 / 9.07 | 4.94 / 4.52 | 7.59 / 4.20 |
| Neutral | 10.57 / 9.64 | 7.15 / 6.55 | 7.97 / 6.00 |

**Known limitation, carried from the locked design:** on record pages (Weight, Energy, Recovery, Photos, DEXA), the selected scope pill's accent label sits on the L2 inset.
- In Mineral that measures 4.09 (teal) to 4.69 (orange). Build 90's olive measured 4.25 there, so teal is 0.16 lower than Build 90.
- Selection is also carried by the ring, the fill and the `isSelected` trait.
- Raising this would need deeper inks on the inset than the approved Option A accents. This is left for the Founder to decide.

## 8. Expected overlap with Claude B

- **No current overlap.** Claude B's branch `claude/native-build91-remaining-redesign-watch-audit-20261007` touches only Peptide tests and Watch files. `git merge-tree` against this candidate is clean.
- **Claude B's new prompt** (`ea2b7f23`: Operating Plan, Next DEXA Scan, Watch) says not to touch Evidence visual-system files. Likely touchpoints at integration:
  1. `SharedUI/PhysiqueOSTheme.swift`: this branch adds one token after `redesignCyanInk`. If both lanes add tokens nearby, it will be a trivial adjacent-line merge.
  2. If OP adds files, `generate_project.py` / pbxproj churn. This branch adds no files.
  3. If the Next DEXA Scan page reuses Evidence components, they will now render neutral unless they declare `.evidenceDomain(.dexa)`. That is a one-line opt-in, and never lime.
- **Shared UI test files:** this branch changes no UI test file.

## 9. Confirmations

- No Build 91 integration and no merge.
- No bump: still 1.0 (90).
- No archive and no TestFlight.
- No Server change; no production mutation.
- Claude B's areas untouched.
- latest.json unchanged; this report is report-only.

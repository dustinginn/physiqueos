# HealthKit Sleep Evidence: product design (design only)

Task: healthkit-sleep-evidence-design-20260930 (with the Founder product-direction addendum, prompt 20260930T221600Z)

Status: complete. Design only: no code, no prototype branch, no deploy/upload, no activation. Nothing strategic is decided.

Inputs:
- Validation report 20260930T210326Z (sanitized shape, sleep-canon-v1 duplicate-copy defect).
- Canonical schema at Server 08aeecde (`HealthKitSleepCanonicalizer.js`, `HealthKitSleepContract.js`).
- Current Native Evidence code at 05912674, which keeps the a5041eb0 Founder-page cleanup intact.
- No raw Founder Sleep records were read for this task. **Every number in a wireframe or copy example below is synthetic.**

---

## 0. Design stance (one paragraph)
Sleep Evidence is an inspectable record, not a sleep coach. The primary surface answers three questions at a glance:
- How much did I sleep last night?
- What is my recent multi-night level?
- Is my sleep window steady?

Everything else lives one or two taps deeper: stages, timeline, in-bed, continuity detail, provenance and long trends. Rich, but not loud. No score, no grades, no good/bad colors, no targets, no advice. Values are described, never judged.

## 1. Where Sleep lives (information architecture)

The Evidence hub already lists a `recovery` stream:
- It is a placeholder with metric "Coming soon" and trend "Sleep, HRV, readiness, and recovery."
- It uses the `bed.double.fill` icon in teal #5EEAD4.
- It routes via `progressStream(streamId: "recovery")`.

Sleep becomes the first real content of that stream. There is no new hub row. That matches the Founder direction: Recovery starts small with Sleep plus, later, daily foam rolling.

```
Evidence hub
└─ Recovery                          (existing row; placeholder → real)
   ├─ Recovery Evidence landing      (selective primary surface)
   │   ├─ Last Night card
   │   ├─ Sleep chart (nightly total + 7-night average)
   │   ├─ Sleep Window card (consistency)
   │   ├─ Recent Nights (3 + Show All)
   │   ├─ [future slot: Foam Rolling execution]  (not designed now)
   │   └─ Data Sources
   ├─ Sleep History & Trends          (deeper; "See trends")
   │   ├─ range selector
   │   ├─ Total Sleep trend
   │   ├─ Sleep Window trend
   │   ├─ Continuity trend   (after v2)
   │   ├─ Stage Mix trend    (after v2; collapsed by default)
   │   └─ full night list
   └─ Night detail (per sleep day)    (deepest; full inspection)
       ├─ headline + window
       ├─ timeline / hypnogram
       ├─ stage composition (after v2)
       ├─ continuity (after v2)
       ├─ time in bed
       ├─ additional sleep (when present)
       └─ source & data details
```

New AppDestinations, following the `activityDay(date:)` pattern:
- `recoverySleepTrends`
- `recoverySleepNight(sleepDay:)`, with stream id `recovery/sleep/night/<YYYY-MM-DD>`

The hub row's summary moves from "Coming soon" to **"Last night · 7h 12m"**. This is one entry in `EvidenceStreamRowView`'s dated-label table, label "Last night". If last night has no data, the row shows the latest available night with its date: "Sep 28 · 6h 50m".

## 2. Vocabulary (copy rules)
- **Night** is the user-facing word for a canonical sleep day. It is labeled by **wake date** ("Tue, Sep 29" = the night ending Tuesday morning). Under the 18:00 rule, a Tuesday afternoon nap belongs to Tuesday's night; copy calls it "additional sleep" in context, never "nap score".
- **Asleep / Total sleep:** the main episode's asleep time. "Including additional sleep" appears only when secondary episodes exist.
- **Sleep window:** fell-asleep → woke-up of the main episode (the asleep extent), not time in bed.
- **Time in bed:** shown only when defensible (`inBedSeconds != null`). Never used to compute anything on screen.
- **Awake in sleep window:** awake time inside the sleep window. Never phrased as "restless" or "poor".
- **Stages:** "Deep", "Core", "REM", "Awake". Under Core, a footnote: "Shown as Light in some apps."
- **Forbidden in copy:** score, quality, good/bad, optimal, target, should, debt, efficiency, readiness, recovery %, ranking language.

## 3. Primary surface: Recovery Evidence landing

```
┌────────────────────────────────────────────┐
│ ← Evidence Hub                              │
│ (bed) EVIDENCE REPORT                       │
│       Recovery                              │
│       Sleep from Apple Health               │
├────────────────────────────────────────────┤
│ LAST NIGHT                       Tue Sep 29 │
│ 7h 12m asleep                             > │
│ 11:04 PM – 6:41 AM                          │
│ 7-night average 6h 58m · 7 of 7 nights      │
│ [Still updating from Apple Health]          │  (only while window open)
├────────────────────────────────────────────┤
│ SLEEP                        14 nights   ⓘ  │
│  ▇ ▆ ▇ ▅ ▇ ▇ ▆ ▇ ▆ ▇ ▅ ▇ ▇ ▇              │  bars = nightly total
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─               │  line = trailing 7-night avg
│ Avg 6h 58m (last 7) · 7h 05m (prior 7)      │
│                               See trends  > │
├────────────────────────────────────────────┤
│ SLEEP WINDOW                    14 nights   │
│  10p   12a    2a    4a    6a    8a          │
│  ├──────────────▇▇▇▇▇▇▇▇▇▇▇▇▇──┤ …         │  one floating bar per night
│ Typical 11:10 PM – 6:45 AM                  │
│ Fell asleep within ±25m · woke within ±20m  │  (descriptive spread, see §6)
├────────────────────────────────────────────┤
│ RECENT NIGHTS                     Show All  │
│ Tue Sep 29   7h 12m   11:04 PM–6:41 AM    > │
│ Mon Sep 28   6h 50m   11:31 PM–6:39 AM    > │
│ Sun Sep 27   7h 40m   10:52 PM–7:02 AM  ◌ > │  ◌ = time zone inferred
├────────────────────────────────────────────┤
│ DATA SOURCES                                │
│ Oura (via Apple Health)        Preferred    │
│ Apple Watch                    Not recorded │
└────────────────────────────────────────────┘
```

**Deliberately NOT on the landing:** stage minutes or percentages, the hypnogram, time in bed, awake minutes, continuity numbers, algorithm/provenance detail, long-range charts, and any comparison to a norm.

Landing rules:
- **Last Night:** headline = main-episode asleep. Second line = sleep window in the night's local time. Third line = trailing 7-night average with an n-of-7 night count.
  - No delta arrow and no color: a lower or higher average is not good or bad.
  - If fewer than 3 nights exist in the trailing 7, show "Average after 3 nights".
- **Sleep chart:**
  - 14 nights fixed on the landing. Range selection lives in Trends.
  - Bars in the Recovery teal; a missing night is an empty slot with a small "–" baseline tick, never a zero bar.
  - The 7-night trailing average is a single neutral line (`textPrimary` at 60%, dashed). It is drawn only where at least 3 of the 7 nights exist.
  - Tapping a bar selects that night and shows an inline readout ("Sun Sep 27 · 7h 40m"). A second tap opens Night detail.
  - This exact chart is the candidate future Briefing graph (§12).
- **Sleep Window card:** this is the consistency view (§6). It uses the median fell-asleep and woke-up times; spread is shown as ± minutes. Nights with an inferred time zone are drawn hollow.
- **Recent Nights:** 3 rows plus "Show All" (sheet), the same pattern as `ActivityHistoryView`. Each row shows wake date, asleep, window and state glyphs (§8). Tapping a row opens Night detail.
- **Data Sources:** shows family labels only (§9). Never bundle ids or device names.

## 4. Sleep History & Trends (deeper)
- **Range selector:** the shared `EvidenceChartRange` (1M / 3M / 6M / 1Y / All), plus a 2W option for sleep. Default 1M.
- **Total Sleep:**
  - Nightly bars with a 7-night average line.
  - At 6M or more, it aggregates to weekly averages, matching Energy's weekly pattern. Each bar is then labeled "avg of n nights".
  - Selection readout below the chart, as in Nutrition's "Selected Week".
- **Sleep Window:** floating-bar chart over the range (fell asleep → woke up), median band shaded, inferred-zone nights hollow.
- **Continuity (v2 only):** nightly "Awake in sleep window" as small bars, plus "Longest continuous sleep" as dots. Neutral colors; it is never stacked with total sleep.
- **Stage Mix (v2 only; collapsed by default, "Show stage mix"):**
  - 100% stacked nightly bars in Deep / Core / REM, with Awake shown separately.
  - Explicitly an inspection view. It carries the footnote: "Stage estimates come from your sleep source and vary between devices."
- **All Nights list:** paged, newest first, the same row component as the landing.

## 5. Night detail (full inspection)

```
┌────────────────────────────────────────────┐
│ ← Recovery                                  │
│ NIGHT OF TUE, SEP 29                        │
│ 7h 12m asleep                               │
│ 11:04 PM – 6:41 AM · PDT                    │
│ [Still updating until 6:00 PM]              │ (window open)
├────────────────────────────────────────────┤
│ TIMELINE                                     │
│ Awake ▔▔|▔▔▔▔▔▔▔▔▔▔|▔▔▔▔▔▔▔▔▔▔▔▔|▔▔▔▔▔▔▔   │
│ REM   ____▇▇______▇▇▇▇______▇▇▇▇▇▇______   │ 4-lane step chart
│ Core  ▇▇▇▇__▇▇▇▇▇▇____▇▇▇▇▇▇____▇▇▇▇▇▇▇▇   │
│ Deep  __▇▇▇▇______▇▇______________________ │
│ ░░░░░░░░░░░░░░ in bed ░░░░░░░░░░░░░░░░░░   │ background band
│ 11p     1a      3a      5a      7a          │
├────────────────────────────────────────────┤
│ STAGES                                      │ (v2)
│ [■■■■ Deep][■■■■■■■■■■ Core][■■■■ REM]     │
│ Deep 1h 05m · Core 3h 58m · REM 2h 09m      │
│ Awake in sleep window 34m                   │
├────────────────────────────────────────────┤
│ CONTINUITY                                  │ (v2)
│ Longest continuous sleep 2h 41m             │
│ Awake in sleep window 34m                   │
├────────────────────────────────────────────┤
│ TIME IN BED            7h 58m               │
│ In bed 10:51 PM – 7:10 AM                   │
├────────────────────────────────────────────┤
│ ADDITIONAL SLEEP       (only when present)  │
│ 1:10 PM – 1:45 PM · 35m · Apple Watch       │
│ Total including additional sleep 7h 47m     │
├────────────────────────────────────────────┤
│ SOURCE & DATA                          ⌄    │ (collapsed)
│ Counted from Oura (via Apple Health)        │
│ Preferred source applied                    │
│ Also recorded: Apple Watch — not counted    │
│ Time zone: PDT (inferred at sync)       ◌   │
│ Stage detail: available                     │
│ Last updated Sep 29, 9:14 AM                │
│ Calculation sleep-canon-v2                  │
└────────────────────────────────────────────┘
```

- **Timeline:** the hypnogram earns its place in Night detail only. It is the honest way to inspect continuity and the source's own staging, and real nights have 40–91 segments.
  - Rendered as a 4-lane step chart from canonical `timeline` segments (one state per instant, so lanes never overlap). In-bed is a background band, not a lane.
  - Gaps with no sample are left blank and are not drawn as awake (canonical rule: "a gap is not awake").
  - Tapping or scrubbing shows "Core · 2:14–2:51 AM".
  - Never on the landing or in a list.
- **Stages:** one horizontal composition bar plus minutes. Percentages appear only in the VoiceOver label and the Stage Mix trend, not as headline numbers.
- **Time in bed:** shown only when `inBedSeconds` is non-null. Never combined into an efficiency ratio.
- **Additional sleep:** see §10.
- **Source & Data:** collapsed by default. This is where provenance, the time zone basis, the algorithm version and last-recompute time live.

## 6. Consistency (descriptive, not a score)
- **What is shown:** the typical fell-asleep and woke-up clock times (medians), plus a spread for each.
  - Spread = median absolute deviation in minutes, over the trailing 14 nights shown on the landing card, or over the selected Trends range.
  - Copy: "Fell asleep within ±25m · woke within ±20m".
- **Not shown:** a single "consistency %" or any threshold. Social-jetlag or weekday/weekend splits are a possible later inspection view, explicitly out of the first slice.
- **Time-zone correctness matters here.** Clock times are computed in each night's own `timeZone`.
  - Historical Oura data carried `device_at_ingest` zones, and the Founder travelled to Texas in late September, so inferred-zone nights can be off by the zone offset.
  - Rules:
    - (a) Show the zone abbreviation whenever a night's zone differs from the current device zone.
    - (b) Draw inferred-zone nights hollow (◌), with a legend "time zone inferred".
    - (c) Exclude inferred-zone nights from the spread only when the zone basis is `device_at_ingest` AND the night's ingest happened more than 24h after wake. In that case the zone is a guess about the past.
  - Prospective nights are ingested within about a day, so their inferred zone is usually right. Their display is unchanged other than the provenance note.

## 7. Continuity (descriptive; depends on v2)
- **Candidate fields** (read-model derivations from canonical v2 `timeline`, NOT canonical day fields):
  - `awakeInWindowSeconds`: the main episode's awake, which is canonical `awakeSeconds`.
  - `longestAsleepStretchSeconds`: the longest run of consecutive asleep-stage segments, where an awake segment or a gap breaks the run.
- **Deliberately excluded until Founder review:** awakening counts (they need a minimum-duration threshold, and sleep-canon-v1 explicitly ships no awakening count), sleep efficiency, sleep latency (Oura's in-bed envelope makes it look measurable, but it is a source artifact), and WASO norms.
- **v1 rule:** continuity is not shown at all for v1-computed nights, because awake is the most distorted v1 field (≤−25% on 9/11 affected nights).

## 8. States
| State | Landing / row | Night detail |
|---|---|---|
| Loading | `ProgressView` (accent tint), same as other Evidence pages | same |
| Recovery has no Sleep yet (pre-D0 or not authorized) | Last Night card body: "Sleep from Apple Health will appear here after your first synced night." The chart shows an empty state with the same copy. | n/a |
| First nights (<3) | Average line hidden; "Average after 3 nights" | normal |
| Window still open (now < `windowClosesAt`) | Row tag "Updating"; Last Night shows "Still updating from Apple Health" (existing Activity copy) | "Still updating until 6:00 PM", in the night's local time |
| Recomputed later (late samples, deletion, or algorithm upgrade) | No badge on the row | Source & Data: "Updated Oct 3, 8:02 AM · recalculated" |
| No sleep recorded (window closed, no data) | Row "No sleep recorded" in muted text; chart gap | "No sleep was recorded for this night." |
| Not yet synced (window closed, device hasn't delivered) | Not distinguishable from "no sleep" without a delivery watermark. The read model should carry `deliveryState: synced \| awaiting_device`; until then the copy is "No sleep recorded yet" | same |
| In bed only | Row "In bed · no sleep data" | Time in bed only; "Your source recorded time in bed but no sleep." |
| Stage detail absent (e.g., an iPhone or unstaged Watch night) | Normal row | Stages card: "Stage detail not available from Apple Watch for this night." The timeline shows a single "Asleep" lane. |
| Stages pending correction (v1 night) | Normal row | Stages and Continuity cards show "Stage detail is being recalculated." No numbers. |
| Inferred time zone | ◌ glyph on the row and hollow in the window chart | Source & Data: "Time zone: CDT (inferred at sync)" |
| Error | Existing Evidence failure text pattern | same |

## 9. Source and provenance treatment
- **Family labels only:**
  - oura → "Oura"
  - apple_watch → "Apple Watch"
  - apple_iphone → "iPhone"
  - apple_other → "Apple Health"
  - sleep_cycle → "Sleep Cycle"
  - whoop → "WHOOP"
  - autosleep → "AutoSleep"
  - third_party_other → "Another app"
  - manual → "Entered in Health"
- **Never shown:** bundle ids, device names, source display names.
- "Counted from X" is always the primary source. "Also recorded by Y — not counted" lists corroborating sources (from `corroboratingSources`), so the Founder can see that nothing was double counted.
- "Preferred source applied" appears when `reconciliation.preferenceApplied`. If a non-preferred source was counted because the preferred source was insufficient, show "Oura recorded only part of this night, so Apple Watch was counted."
  - This is the human form of `usable_over_insufficient_coverage`. Every reconciliation reason gets one plain sentence; the reason code itself is never shown.
- **Data Sources card on the landing:** per family, "Preferred" / "Recording" / "Not recorded (last 30 nights)". The preference itself stays Server-owned; there is no editing UI in this design.
- **Morning Check-In `sleep_duration` (existing structured Recovery evidence):** it is a different kind of evidence (a self-report).
  - It is not merged into HealthKit totals.
  - If present, Night detail may show "You also reported 7h in Morning Check-In". This is an open product decision (§14).

## 10. Additional (secondary) sleep
- There is none in September's real data, but the schema supports it and Apple Watch or naps will produce it.
- **Row:** the main total stays the headline. A sub-line reads "+ 35m additional sleep".
- **Chart:** the bar stays main-only by default. A Trends toggle "Include additional sleep" switches to `totalAsleepIncludingSecondarySeconds`, and the bar then gets a lighter cap segment.
- **Night detail:** an "Additional sleep" card lists each secondary episode (window, asleep, source). The timeline shows the main episode only, and each secondary episode gets its own mini-strip.
- **No labeling:** "nap" is never inferred. The canonicalizer deliberately decides no UI labels. Copy uses "additional sleep" plus the clock time.

## 11. How corrected v2 stage values plug in (no layout redesign)
- **Read-model gate:**
  - Every night exposes `stages.status ∈ {available, absent, pending_correction}` and `continuity.status` with the same values.
  - Server sets `pending_correction` whenever the night was computed by an algorithm version listed as stage-unreliable. Today that is `sleep-canon-v1` when the episode's primary lane contains overlapping same-lane copies, or simply all v1 nights (simplest, recommended).
- **Layout:** the Stages and Continuity cards and the Stage Mix and Continuity trend charts always reserve their place. With `pending_correction` they show the one-line copy and no numbers. When v2 recomputes, the same cards fill with values; no screen changes.
- **Never cached client-side:** the Native read model refetches on recompute (existing `invalidateReadResources(["recovery"])` pattern). Values only ever come from the Server read model.
- **Recommended sequencing:** the first real Sleep Evidence build ships against v2-computed days only, so `pending_correction` is a defensive state, not a launch state.

## 12. Future hooks (recorded, NOT designed or implemented)
- **Briefing Recovery card (future):** a compact card made of:
  - the landing's 14-night Sleep chart (nightly bars + 7-night average)
  - a one-line weekly average
  - lightweight daily Foam Rolling execution (done/not done ticks)

  Not designed here. The landing chart is deliberately built as a reusable component (`SleepTotalChart(nights:, showsAverage:)`), so a future card can embed it unchanged.
- **Foam rolling:** a reserved slot on the Recovery landing below the Sleep cards ("Foam Rolling" execution history) when that evidence exists. Per Founder direction, it is not weighted. It becomes narratively relevant only when repeated misses coincide with meaningful downstream context, such as an injury-related training interruption. That logic belongs to a future strategic layer, not to Evidence.
- **Strategic Recovery projection (future, separate review):** inputs stay limited to:
  - total sleep
  - consistency
  - continuity
  - recent multi-night trend
  - data quality/context
  - eventually, repeated within-person Sleep ↔ training-performance associations

  REM/Core/Deep percentages, hypnogram transitions, sleep midpoint and time in bed are Evidence-only unless explicitly reviewed later.
- **V3 principles to carry forward:**
  - Recovery contextualizes Goal outcome and execution evidence rather than competing with it.
  - Sleep–training links are associations, never causation.
  - One short night plus one weak session is an observation; only repeated within-person association across comparable sessions may become an "emerging pattern".
- **Training context hook:** Night detail can later gain a descriptive "Training the next day" row linking to the Training day, mirroring Activity's "Linked Training Context". It shows no correlation text. Out of the first slice.
- **Stable read-model ids** (`recovery.sleep.nightly_total`, `…seven_night_average`, `…window_spread`, `…awake_in_window`, `…longest_asleep_stretch`) so a future projection reads the same definitions the Founder inspected.

## 13. Components, read model, accessibility

**Native components** (SwiftUI, Swift Charts, existing tokens):
- `RecoveryEvidenceView`: landing, with the same header/toolbar/refresh/foreground-reload pattern as `ActivityHistoryView`.
- `SleepLastNightCard`
- `SleepTotalChart`: `BarMark` plus a `LineMark` average, using `chartXSelection`.
- `SleepWindowChart`: floating `BarMark(yStart:yEnd:)` on a clock axis that wraps across midnight. The axis spans 6 PM → 6 PM, so the window never splits.
- `SleepNightRow`
- `SleepHistorySheet`
- `SleepTrendsView`
- `SleepNightDetailView`
- `SleepHypnogramView`: a lane step chart via `RectangleMark`.
- `SleepStageBar`
- `SleepProvenanceSection`

Reused components: `CardContainer`, `TrainingSectionHeaderView`, `IconBadge`, `TrainingCompactActionLabel`.

**New theme tokens** (extend `PhysiqueOSTheme`, never ad hoc):
- `sleepTotal` = Recovery teal #5EEAD4
- `sleepDeep` #6366F1
- `sleepCore` #60A5FA (= chartEvidence)
- `sleepREM` #A78BFA
- `sleepAwake` #CBD5E1 (a neutral slate, deliberately not warning-amber)
- `sleepInBed` = divider at 35%

Stages are also distinguished by lane position, not color alone.

**Server read model** (new, Recovery-scoped, derived on read from canonical `healthKitSleepDays`; NOT persisted strategic data):
- `GET` landing: `{ lastNight, nights[14], sevenNightAverage{seconds, nightCount}, window{medianStart, medianEnd, startSpreadMin, endSpreadMin, nightsUsed}, sources[] }`
- `GET` trends `?range=`
- `GET` night `/:sleepDay` with timeline segments

Each night carries:
- `sleepDay`, `status`
- `main{start,end,localStart,localEnd,timeZone,timeZoneBasis, asleepSeconds, inBedSeconds?, stages{status,…}, continuity{status,…}}`
- `secondary[]`
- `source{primaryFamily, preferenceApplied, reasonSentenceKey, corroborating[{family,usable}]}`
- `completeness{windowOpen, windowClosesAt, lastRecomputedAt, algorithmVersion, deliveryState}`

Averages and spreads are Server-computed, as Weight's rolling averages already are. Reading Sleep for Evidence display does not change `strategicEvidenceEligibility` (it stays quarantined); display ≠ strategic use.

**Accessibility:**
- Every chart gets a summary `accessibilityLabel` plus an `AXChartDescriptor` (audio graph).
- Rows read "Tuesday, September 29. 7 hours 12 minutes asleep, 11:04 PM to 6:41 AM. Time zone inferred."
- The hypnogram exposes per-segment elements in order ("Core, 2:14 to 2:51 AM"), grouped by hour for rotor navigation.
- Dynamic Type through `physiqueOSFont`. All tap targets ≥ 44 pt.
- Durations are always written "7h 12m" visually and "7 hours 12 minutes" for VoiceOver.

## 14. Open decisions for the Founder (no default assumed)
1. Should the September historical-validation data (currently isolated, `canonicalProductionHistory=false`) ever appear in Evidence? It would need a separate guarded promotion operation. Recommendation: no; start Evidence at prospective D0.
2. Should Morning Check-In self-reported sleep appear next to HealthKit Sleep in Night detail?
3. Is the Recovery stream the right home (vs a separate "Sleep" hub row)? This design assumes Recovery.
4. Should continuity include an awakening count (it needs a minimum-duration threshold)? Excluded by default.

## 15. Smallest first implementation slice (recommended)
**Preconditions:**
- sleep-canon-v2 (Codex) is deployed.
- Prospective Sleep is activated with a new D0 (needs the runner anchor relaxation from the validation report).
- Until then, Native builds against Sandbox synthetic fixtures only.

**Slice 1: "Recovery: Sleep basics"**
- Server: the read model above, but only `lastNight`, `nights` (asleep, window, status, completeness, source family) and `sevenNightAverage`. The hub row metric becomes "Last night · 7h 12m".
- Native:
  - Recovery landing: Last Night card, 14-night `SleepTotalChart` with average, Recent Nights + Show All, Data Sources.
  - Night detail: headline, window, time in bed, Source & Data.
  - Stages and Continuity cards present but showing their v2-gated state. They fill automatically once the read model flags them available, so the stage bar and timeline can follow in Slice 2 without layout change.
  - Sandbox fixture with synthetic nights covering every state in §8.
- Tests:
  - Read-model unit tests (synthetic; including an inferred-zone night, an in-bed-only night and a secondary episode).
  - Native view-model tests.
  - One UI acceptance test: hub → Recovery → night.

**Slice 2:** Sleep Window card plus trend, hypnogram, stage bar, Continuity (all v2), Trends page with range selector.

**Slice 3:** additional-sleep UI polish, Stage Mix trend, training-context row.

**Explicitly not in any slice here:** Briefing Recovery card, strategic projection, V3, Confidence, Goal weighting, Sleep Score, foam-rolling logic.

## 16. Compliance with this task's limits
- Design only. No prototype branch was created, because the slice needs a Server read model first and a fixture-only prototype would duplicate that work. Nothing deployed, uploaded or activated.
- No strategic weighting, Briefing, V3 or Confidence changes, and no Sleep Score.
- The a5041eb0 Founder-page cleanup is untouched. The only Founder-page Sleep control remains the temporary Sleep canary.
- Privacy: no raw Founder Sleep records were read for this task, and all example values are synthetic.

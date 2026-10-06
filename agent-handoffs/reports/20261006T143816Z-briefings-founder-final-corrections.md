# PhysiqueOS Briefings — Founder final corrections (DEXA + Briefing History) + Midweek window addendum

Tasks:
- `20261006T140000Z-claude-b-founder-final-briefing-corrections` (prompt commit `0dbe7226`)
- addendum `20261006T142500Z-claude-b-midweek-sun-tue-window-verification` (prompt commit `667f19cf`)

Status: **READY FOR FINAL FOUNDER REVIEW.** Not marked accepted.

## Candidate

| Item | Value |
|---|---|
| Branch | `claude/overnight-lane-b-briefings-redesign-20261006` (pushed, not merged) |
| Corrected candidate SHA | `00fcbc2953c2f29784eb1334af2bada3a7850490` |
| Previous candidate | `8d085cbb` (boards `8826f914`) |
| Not done | no build bump, no TestFlight, no Server change or deploy, no production mutation |
| latest.json / latest.md | untouched (still Build 88) |
| Reopened areas | none outside these corrections (Weekly, Monthly, Photo, paired viewer, shared chrome untouched) |

## Correction 1 — DEXA: locked rail layout + goal/tissue-aware color

**Layout restored to the locked reference:**
- Compact Snapshot / Measured Event: Date, Window, Scans and RMR, in two columns. The body-composition values live in the hero and the rails.
- What Measurably Changed / Since Last Scan as individual change rows:
  - each row shows its label and signed delta, the previous and current endpoints, and a structural teal rail with a knob;
  - the generic Previous / Current / Delta table is removed.
- Regional Fat Change, Measured Lean Tissue Change and Other Notable Changes as the locked compact cards:
  - columns are Region, prior scan date, current scan date and Change;
  - canonical units stay in the values, per the locked unit correction.
- The phase breakdown, interpretation, Coach's Insight and revision note are unchanged.
- No direction arrows.

**Rail length:**
- The locked harness hard-coded its rail positions (76/62/67/82); they cannot be derived from data.
- Native therefore uses a deterministic rule: each row's relative change |current − previous| / |previous|, scaled so the group's largest change fills the rail.
- Any nonzero change fills at least 12%; an unchanged metric shows an empty rail.
- No position is invented.

**Semantic color (`DEXADeltaSemantics`, one bounded mapping):**
- It reads the artifact's own canonical `semanticGoalType` (the real Sep 12 DEXA carries `lean_mass_gain`). It does not hard-code "gain is good".
- For known physique goals (`lean_mass_gain`, `fat_loss`):

| Change | Color |
|---|---|
| Lean tissue gain | green (favorable) |
| Lean tissue loss | coral (unfavorable) |
| Fat mass or regional fat gain | coral |
| Fat mass or regional fat loss | green |
| Visceral fat | treated as fat tissue |
| Body-fat % up | coral |
| Body-fat % down | green |

- These always use restrained amber instead: weight, RMR, A:G ratio and other context-dependent metrics, any metric under an unknown or absent goal, and any unreadable delta.
- Unchanged values (0 or "No change") are neutral gray.
- The rail stays structural teal; color lands only on the delta values in the rails, regional cards and phase breakdown.
- No payload is modified.

## Correction 2 — Briefing History

**Titles:**
- Stable navigation titles: Weekly Briefing, Midweek Briefing, Photo Briefing, DEXA Briefing. The narrative label is no longer used.
- Monthly keeps its month/year ("Monthly Briefing · September 2026"). The month comes from:
  1. the row's canonical `evidenceWindow.briefingMonth`, which the server's History summary already sends (the real September Monthly sends `2026-09`). Native now decodes it additively.
  2. otherwise, the artifact id's `YYYYMM` / `YYYY-MM` suffix.
  3. otherwise, no qualifier is shown.
- The publication date and time below the title are unchanged.

**Type accents (`BriefingTypeAccent`, one mapping over `BriefingTypeIdentity`):**
- Colors:

| Type | Accent |
|---|---|
| Weekly | teal |
| Midweek | amber |
| Monthly | violet |
| Photo | green |
| DEXA | blue |

- They apply to the type eyebrow and the icon tile.
- The main title stays neutral ink.
- Every accent clears 4.5:1 on both the Dark and Mineral Light History page (tested).

## Addendum — Midweek Sunday-through-Tuesday window (verified end to end)

**1. Server (production `b7eb1e39`), `createMidweekEvidenceWindow`:**
- The briefing date is the configured Wednesday.
- `startDate` is Wed − 3 (Sunday) and `endDate` is Wed − 1 (Tuesday).
- `end` is `T23:59:59.999` on Tuesday, the cutoff is end of Tuesday local time, and the relative label is "Sunday through Tuesday".
- In `MidweekBriefingPreviewService`, `inWindow` is inclusive (`>= start && <= end`), the energy date keys are Sun, Mon and Tue, and reliability "moderate" requires all 3 days.
- The chart title is "Energy Balance, Sunday–Tuesday".

**2. Real published Midweek used for review** (`midweek_briefing_user_founder_001_20260927_20260929` v3):

| Field | Value |
|---|---|
| Window | 2026-09-27 (Sun) … 2026-09-29 (Tue) |
| Briefing date | 2026-09-30 (Wed) |
| Cutoff | end of Tuesday PT |
| Energy points | Sun, Mon, Tue — all complete |
| comparableDays | 3 |
| Reliability | moderate |

Only dates and counts were read (read-only); no content was published.

**3. All 9 published Midweeks** (read-only audit):
- Every one has a Sun…Tue window and carries a Tuesday energy point.
- In 4 of them a day is incomplete, so it is unpaired but present. Aug 4, Sep 15 and Sep 22 are incomplete Tuesdays; Aug 16–18 also has incomplete Mon and Tue.
- **No upstream regression. Tuesday participates in the window, the Energy calculations and the narrative inputs.**

**4–5. Native read contract and `ProductionBriefingMapper`:** the mapper passes all Server points through, and Midweek `eligibleDayCount` = the 3 chart points.

**6. Presentation:**
- The Sunday/Monday impression came only from the review board. The locked design fixture (taken from the Sep 20–22 Midweek, whose Tuesday was incomplete) carried just 2 points ("2/2 days paired").
- Hardened anyway, presentation only:
  - The Midweek Energy header now names the canonical window: "Sun–Tue · 2/3 days paired".
  - Days are laid over the full canonical Sun–Tue window, so a day without a published point still appears as a "No data" row and an empty chart slot. Nothing is invented.
- Regression tests prove the Sun–Tue inclusive window and that Tuesday can never silently drop out.

## Corrected boards

Each board shows the locked reference on the left and the corrected SwiftUI on the right (iPhone 17 Pro simulator, iOS 27; Sandbox fixture only). All six were verified remotely after the push to `00fcbc29`: blob hash equals the local file, the browser page returns HTTP 200, and raw returns HTTP 200 at full size.

| Board | Dark | Mineral Light |
|---|---|---|
| DEXA | https://github.com/dustinginn/physiqueos/blob/claude/overnight-lane-b-briefings-redesign-20261006/agent-handoffs/artifacts/overnight-lane-b-briefings-redesign-20261006/dexa-dark.png | https://github.com/dustinginn/physiqueos/blob/claude/overnight-lane-b-briefings-redesign-20261006/agent-handoffs/artifacts/overnight-lane-b-briefings-redesign-20261006/dexa-light.png |
| Briefing History | https://github.com/dustinginn/physiqueos/blob/claude/overnight-lane-b-briefings-redesign-20261006/agent-handoffs/artifacts/overnight-lane-b-briefings-redesign-20261006/history-loaded-dark.png | https://github.com/dustinginn/physiqueos/blob/claude/overnight-lane-b-briefings-redesign-20261006/agent-handoffs/artifacts/overnight-lane-b-briefings-redesign-20261006/history-loaded-light.png |
| Midweek (re-rendered for the Sun–Tue clarification) | https://github.com/dustinginn/physiqueos/blob/claude/overnight-lane-b-briefings-redesign-20261006/agent-handoffs/artifacts/overnight-lane-b-briefings-redesign-20261006/midweek-dark.png | https://github.com/dustinginn/physiqueos/blob/claude/overnight-lane-b-briefings-redesign-20261006/agent-handoffs/artifacts/overnight-lane-b-briefings-redesign-20261006/midweek-light.png |

## Tests

| Gate | Result |
|---|---|
| New `BriefingFounderCorrectionTests` (9) | Lean-mass-gain tissue semantics; ambiguous, unchanged and unknown-goal → amber or gray; tone contrast in both appearances; rails are data-derived and replace the generic table, with no arrows; stable History titles (never narrative); Monthly month/year from canonical metadata, with no invented month; distinct, legible type accents with a neutral title in Dark and Mineral Light; Midweek Sun–Tue inclusive window; Tuesday never drops out |
| Briefing unit suites (Founder corrections, locked presentation, V3, read model, DEXA, Photo) | 169 tests, 0 failures |
| Full Native unit suite | **2095 tests, 0 failures** on the final source (1 pre-existing local-only skip) |
| Briefing UI journeys + Home | **5/5 pass** on the final source: `testBriefingParityJourneys`, `testFounderCorrectionWeeklyAndPhotoBriefingJourney`, `testFounderCorrectionMidweekTrainingResponseJourney`, and Home physical parity in Dark and Mineral Light. A first run found that the History list identifier overwrote the row identifiers; it was fixed with `.contain` (accessibility only). |
| Generic Release compile | **pass** |

UI test change: the journeys now open History rows by their stable artifact-id identifier instead of narrative headline text (which History no longer shows). The DEXA journey asserts the locked "Measured Event" header.

## Changed files (vs `8d085cbb`)

- `Presentation/Briefings/DEXABriefingSections.swift`: rails, region cards, semantic mapping, compact snapshot
- `Presentation/Briefings/PhotoBriefingSections.swift`: amber and coral event tokens only
- `Presentation/Briefings/BriefingHistoryView.swift`: stable titles, type accents
- `Presentation/Briefings/MidweekBriefingSections.swift`: Sun–Tue window label and fill-in
- `Presentation/Briefings/WeeklyBriefingSections.swift`: energy header window label, date helpers
- `Contracts/BriefingReadModel.swift`: `BriefingTypeIdentity`, `briefingMonth`, `stableTitle`
- `Networking/BriefingAPI.swift`: decodes `evidenceWindow.briefingMonth`
- Tests: `BriefingV3PresentationTests.swift`, `TrainingAcceptanceUITests.swift`
- Review boards: DEXA ×2, History ×2, Midweek ×2

No pbxproj change and no new source files.

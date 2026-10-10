# Goal Adaptation: Home strict parity (content only) + simulator update

- **Task id:** `claude-goal-adaptation-home-strict-parity-20261010`
- **Prompt:** inbox `20261010-claude-home-parity-strict-no-visual-changes.md` at `9ac6b2b6`
- **Status:** complete. **Founder acceptance requested for content and flow only.** Native pixel parity is deferred to snapshot tests at implementation.
- **Scope:** design and simulation only. No production access, Native or Server implementation, TestFlight, or change to `latest.*`.

## Branch, SHA and artifacts

| Item | Value |
|---|---|
| **Design branch** | `claude/goal-adaptation-home-parity-simulator-20261010` |
| **SHA** | **`1c0dfa6200c024fe5358a5d0c2299948ea0f9ef7`** (pushed; local = remote, verified) |
| Commit | https://github.com/dustinginn/physiqueos/commit/1c0dfa6200c024fe5358a5d0c2299948ea0f9ef7 |
| Artifact folder | `agent-handoffs/artifacts/goal-adaptation-home-parity-simulator-20261010/` (browse at the commit link above) |
| **Home content review** (Claude artifact, version 3) | **https://claude.ai/artifact/GNdGemefiB7g3foKawU9sr** |
| **Interactive simulator** (Claude artifact, version 2) | **https://claude.ai/artifact/X2SJbf84x6sfe5UQyydLCP** |
| Home review source | https://github.com/dustinginn/physiqueos/commit/1c0dfa6200c024fe5358a5d0c2299948ea0f9ef7#diff-f39989729346cdd924793e890b201fe8d55fa3e2a6959a7e087c48b085bb49cc |
| Home renderer | https://github.com/dustinginn/physiqueos/commit/1c0dfa6200c024fe5358a5d0c2299948ea0f9ef7#diff-f51798bbeeba45d78e94f263a46a2468bcddecf4c2c9d831d9926727d7222286 |
| Simulator source | https://github.com/dustinginn/physiqueos/commit/1c0dfa6200c024fe5358a5d0c2299948ea0f9ef7#diff-8943ab94439f2fd643924052f7d5aa18a76c099f28a6ac0424990ac9380130a9 |
| Simulator page | https://github.com/dustinginn/physiqueos/commit/1c0dfa6200c024fe5358a5d0c2299948ea0f9ef7#diff-351ba246854d40e5713c272d99a3da218b1185b54ec504953319c4662fb6b39b |
| Simulator test results | https://github.com/dustinginn/physiqueos/commit/1c0dfa6200c024fe5358a5d0c2299948ea0f9ef7#diff-1c00797cac20bdb51f3ff3bf5e69383fec53ef35c074c14cc1b761cc7ce9ea60 |
| Home validation | https://github.com/dustinginn/physiqueos/commit/1c0dfa6200c024fe5358a5d0c2299948ea0f9ef7#diff-9faad1a6bba7d8623c334369725dfcf42d8261825f5e70c4a82f9f72a953cddd |
| Screenshots | `home/screens/` and `simulator/screens/` in the artifact folder |

Both artifacts are private until shared from their Share menu.

## Completed work

### 1. Strict parity framing

- **Source of truth.** The Home review is now labelled **"illustrative content only, not a visual specification"**. The released **Build 95 SwiftUI Home** is the visual source of truth.
- **Build 94 vs 95.** The Home code changed only in data-loading lifecycle (`HomeView.swift` and `HomeViewModel.swift`); there were **no visual changes**. The recreation is based on:
  - `HomeJourneyFieldView.swift`
  - `ConfidenceRing.swift`
  - `HomeHeaderView.swift`
  - `TodaysFocusCardView.swift`
- **The recreation is not a replacement design spec.** Pixel parity must be proven with native snapshot tests against production when this is implemented.

### 2. Fixed the off-kilter confidence ring

This was a recreation bug: the SVG arc was positioned at the top-left of the 110pt frame while the label stayed centred. The arc and label now share one centred cell (82pt ring, 6pt stroke), matching the SwiftUI `ZStack`. Production code is unaffected.

### 3. Content only, no invented measurements

| State | Content |
|---|---|
| H1 Building | Unchanged |
| H2 Temporary leaning | Headline "Leaning", "Temporary · 4 weeks left"; Phase 2 Lean Mass Build **paused** ("7.1 of 10 lb kept"); Phase 3 Leaning (temporary) active with "Body fat 9.7% → 8–9%"; PROGRESS 71%; target date "Paused" |
| H3 Phase complete | "Leaning complete" · "Back in range" · "Choose when to resume building."; Leaning row "Back in 8–9%"; one priority "Choose your next phase" |
| H4 Resumed | Phase 4 Lean Mass Build, 7.1 of 10 lb, example date Feb 20 |

- 9.7% is the Oct 9 DEXA value. Progress stays at the **last measured** 7.1 lb / 71%.
- The invented 8.7% and 6.9 lb values from the previous version were **removed**.
- Leaning dates and the resumed date are example commitments, not measurements.

### 4. Content-slot matrix (on the review page)

Each slot lists its production source field and what would be needed to show the new content. **Nothing needed is visual.**

| Slot | Source | Needed |
|---|---|---|
| Headline | `hero.headline` (phase name) | Server data only |
| Timeline line | `hero.primaryTimeline` | Server data only |
| Support line | `hero.supportLine` | Server data only |
| REMAINING | active phase `friendlyTimeline` | Server data only |
| Phase rows | `trajectory.phases` (raw status string "paused" already renders) | Server data only |
| Guardrail text | `trajectory.guardrail` | Server data only |
| TARGET DATE | `trajectory.overallTargetDate` (date) | **Native content mapping** (allow "Paused" / "—") |
| PROGRESS | active phase `clampedProgressPercentage` | **Native content mapping** (use goal progress during a temporary phase) |
| Goal date range | earliest phase start – `overallTargetDate` | **Native content mapping** (text while the date is pending) |
| Phase rows (count) | `trajectory.phases` | Server sends only the two relevant rows (keeps the card height) |
| Today's Priorities | `todaysFocus` | H3 adds one standard priority occurrence (Server) |

### 5. Fit check (measured in the recreation)

- **No slot wraps beyond its production line count** in any state.
- Goal card height equals the baseline (495pt) for H1, H2 and H4.
- H3 is 20pt shorter, because production omits the active-phase label line when no phase is active. This is existing production behaviour, not a layout change.
- Web fonts differ slightly from SF Pro, so the native check comes later.

### 6. Diff-boundary audit

- **Unchanged:**
  - status bar, safe areas and scroll behaviour;
  - header;
  - goal field background, gradient, circle and padding;
  - "TRAJECTORY" eyebrow;
  - ring geometry, arc, "CONFIDENCE" label and position;
  - metric labels and positions;
  - "PRIMARY GOAL" chip;
  - timeline connector, dots, spacing and label format;
  - guardrail box;
  - action and briefing strip (104pt);
  - priorities layout;
  - older briefings, notices and tab bar.
- **Content only:** headline, timeline and support text; metric values; date range text; phase row text and status; guardrail text.

### 7. Simulator (continued, isolated, simulated data)

- **Label.** Now marked "Functional UX simulation, not the Native visual spec".
- **Home.** Reuses the corrected renderer and the reviewed wording.
- **New views.** A phase-aware **Monthly** briefing and a **Photo Event** view (photos never trigger a recommendation).
- **Existing journey, all working:**
  - DEXA decision (last card) → Option B → leaning, keep building, keep plan, or custom;
  - outcome, time or hybrid completion;
  - one-time explainer;
  - 1:1 energy with Suggested / Eat less / Move more / Blend / Custom;
  - Approach A plan hub (learned training, recovery priority and sleep goal, supplements, photos and DEXA);
  - numeric-only review, then approve;
  - simulated weeks, as estimated or slower;
  - Quick Calibration in the Weekly; Midweek never proposes;
  - phase completion with an honest lean change;
  - resume, maintain or keep leaning;
  - versions, undo, back navigation and reset.

## Validation

| Check | Result |
|---|---|
| Simulator end-to-end (`simulator/test-sim.mjs`, headless Chrome) | **37/37 passed**: all previous 34 plus Monthly, Photo Event and the simulation label |
| Home review | 0 page errors, 0 horizontal overflow (desktop 1600, mobile 390); ring and guardrail present in every state; fit check as above |
| Simulator at 390pt mobile | No horizontal overflow, no errors |

## Outstanding issues

1. **Native pixel parity is unproven** until snapshot tests run against the Build 95 Home during implementation. The recreation uses web fonts.
2. **Content mapping is needed for three slots** (TARGET DATE text, PROGRESS from goal progress, date-range text), plus Server fields for the phase states. None of this is built.
3. **H3 shows a phase-decision priority item.** This needs a Server priority occurrence type.

## Founder decisions requiring review

1. **Accept the content and flow only** (H1–H4 wording and phase states, and the simulator journey). Visual acceptance waits for native snapshots.
2. **Resumed building:** keep it as a new **Phase 4 Lean Mass Build** linked to the paused Phase 2 (as shown), or reopen Phase 2.
3. **Content mapping during a temporary phase:** should PROGRESS show goal progress (as shown) rather than the leaning phase's own progress?

## Storage and safety

| | |
|---|---|
| Free disk | ≈ 17.7 GiB at start (above the 12 GiB floor) |
| Task footprint | a few MB |
| production_mutated / deployed / Native / TestFlight | false / no / no / no |
| `latest.*` | unchanged |
| Other worktrees and lanes | untouched |

# Redesign Batch 3 · Checkpoint A — Evidence Hub + Timeline (Claude takeover)

- Task: `batch3-claude-takeover-evidence-cpa-20261005` (prompt commit `f822862e`, `agent-handoffs/inbox/prompts/20261005T145000Z-batch3-claude-takeover-evidence-cpA.md`)
- Agent: Claude (new Remote Control chat, single RC worktree, no EnterWorktree)
- Status: **Checkpoint A implemented, pixel-audited, tested, pushed. STOPPED for Founder review. Checkpoint B not started.**
- Generated (UTC): 2026-10-05T15:37:34Z

## Authorities

| Item | SHA |
|---|---|
| Apple-VALID Build 87 | `f66c7fc690b1b61094e620791ee2d4a40caf3799` |
| Base (Build 87 + accepted Home correction) | `49e48f1eab3bc6ff22ca6c4bc24b3a9955b0fcc7` |
| Checkpoint A implementation | `b2440d37` then `ce5c7dd899f64386a70a6d21c25cf85bd93d6f3a` (section-title baseline fix) |
| Review package commit | `7cad090b6aab99a5e4b3603a7a8fa49d5bde53d4` |
| Branch | `claude/redesign-batch3-evidence-takeover-20261005` (pushed) |
| Locked design authority | `f7d72f19`, screens H1 (Hub), T1 (Timeline), S1 (states) |

The rejected Codex Batch 3 work (`d842a76b`, CP-A `e48e7757`) was used only for audit. No Codex code was cherry-picked.

## Review links (verified)

Each link was checked against the pushed ref, and every one returns HTTP 200.

- **Primary mobile board:** https://github.com/dustinginn/physiqueos/blob/7cad090b6aab99a5e4b3603a7a8fa49d5bde53d4/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-a-20261005/checkpoint-a-primary-mobile-review-board.png
- **Hub, reference vs simulator:**
  - Dark: https://github.com/dustinginn/physiqueos/blob/7cad090b6aab99a5e4b3603a7a8fa49d5bde53d4/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-a-20261005/hub-dark-reference-vs-simulator.png
  - Mineral Light: https://github.com/dustinginn/physiqueos/blob/7cad090b6aab99a5e4b3603a7a8fa49d5bde53d4/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-a-20261005/hub-light-reference-vs-simulator.png
- **Timeline, reference vs simulator:**
  - Dark: https://github.com/dustinginn/physiqueos/blob/7cad090b6aab99a5e4b3603a7a8fa49d5bde53d4/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-a-20261005/timeline-dark-reference-vs-simulator.png
  - Mineral Light: https://github.com/dustinginn/physiqueos/blob/7cad090b6aab99a5e4b3603a7a8fa49d5bde53d4/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-a-20261005/timeline-light-reference-vs-simulator.png
- **States (S1):**
  - Dark: https://github.com/dustinginn/physiqueos/blob/7cad090b6aab99a5e4b3603a7a8fa49d5bde53d4/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-a-20261005/checkpoint-a-states-dark.png
  - Mineral Light: https://github.com/dustinginn/physiqueos/blob/7cad090b6aab99a5e4b3603a7a8fa49d5bde53d4/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-a-20261005/checkpoint-a-states-light.png
- **Hub end and Dynamic Type:** https://github.com/dustinginn/physiqueos/blob/7cad090b6aab99a5e4b3603a7a8fa49d5bde53d4/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-a-20261005/checkpoint-a-hub-end-and-dynamic-type.png
- **Build 87 / Codex / candidate:** https://github.com/dustinginn/physiqueos/blob/7cad090b6aab99a5e4b3603a7a8fa49d5bde53d4/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-a-20261005/context-build87-codex-candidate.png
- **Parity notes:** https://github.com/dustinginn/physiqueos/blob/7cad090b6aab99a5e4b3603a7a8fa49d5bde53d4/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-a-20261005/PARITY-NOTES.md

## Locked references used

The references are the exact Founder-locked PNGs from `f7d72f19`, copied into the package as `references/`:

- `evidence-h1.png` and `evidence-h1-light.png`
- `evidence-t1.png` and `evidence-t1-light.png`
- `evidence-s1*`, re-rendered from the locked HTML with only the PDF sheet hidden

The lock record is report `20261004T201501Z`: "Unchanged and locked: Evidence Hub, Timeline". I also measured element geometry directly from the locked `evidence-board.html` and `evidence.css` in headless Chrome.

## Audit: did Codex transform the surfaces?

No.

- **Codex Hub:** a restyle of the production Hub. It kept Plus Jakarta Sans and used a square header tile. The locked design uses SF Pro and a circular ◇ mark.
- **Codex Timeline:** visibly broken. A stack-centering bug makes each event zig-zag horizontally, which breaks the rail.
- **Build 87 Hub:**
  - card rows with SF Symbol circles;
  - "Evidence Hub" title;
  - Timeline before Recovery;
  - Health Metrics shown as "Coming soon".

The `context-build87-codex-candidate.png` board shows all three.

## What changed (Native only)

- **Locked Evidence design system** in `EvidenceHeaderView.swift`:
  - harness px scaled ×402/360;
  - SF Pro on its continuous weight axis;
  - the locked palette for Dark and for Mineral Light, resolved through the global appearance trait (no local theme);
  - header, section title, S1 state card and spinner.
- **Hub** (`EvidenceView`, `EvidenceStreamRowView`):
  - flat "Evidence" navigation bar with the 1 px rule;
  - YOUR RECORD header with the 38 px circular mark;
  - Recently Used and All Evidence as ruled rows with 30 px r9 lettered tiles and accent ›.
- **Hub composition** (`EvidenceHubPresentation`):
  - Server order is preserved;
  - the Health Metrics placeholder is not presented;
  - an existing Timeline stream moves after Recovery;
  - nothing is synthesized, so Sandbox has no Timeline row.
- **Timeline:**
  - flat "‹ Evidence Hub" back label, ≥44 pt, with no glass capsule;
  - EVIDENCE header;
  - single rail with an 8 px toned node and 4 px halo;
  - TYPE · DATE eyebrow, title and optional detail;
  - left-aligned `Showing N of M`, only when `hasMore`;
  - S1 loading, empty and failure cards.
- **DEBUG-only review seam** `-physiqueos.evidence-review`:
  - covers the loaded, loading, failed and empty states, plus scroll-to-bottom and the `evidence-timeline` route;
  - absent from Release: the flag string is not in the Release binary.
- No Server change. No Log, Logger, Workout Match, Watch, HealthKit or Batch 2 files were touched. No project file change: all code lives in existing files.

## Pixel parity

Method:

- Real Debug app on a dedicated iPhone 17 Pro simulator.
- Reference scaled to the device's 402 pt width.
- Both images aligned on the nav rule.
- Measured with ink-run profiles.
- Three render/measure/correct rounds.

### Hub (Dark and Mineral Light)

| Element | Δ (pt) |
|---|---|
| Eyebrow | −0.3 / −0.6 |
| Title | −0.3 |
| Subtitle | 0.0 |
| Section titles | 0.0 / −0.7 |
| All 9 row rules | ≤ ±1.0 (row pitch 57.1) |
| Horizontal margins, mark, row tile, label, chevron | ≤ 0.5 |

### Timeline (both appearances)

| Element | Δ (pt) |
|---|---|
| All 30 text runs (8 events × type/title/detail, header, footer) | ≤ ±1.0 |
| Rail segment length | 60.0 vs 60.3 |
| Node and event x | exact |
| Back label x | exact (20.7) |

### States (S1)

| Element | Result |
|---|---|
| Card height | 119.6 pt, both |
| Spinner | identical |
| Copy | ≤ 0.4 pt |

### Remaining differences

None of these is a geometry defect:

1. **System chrome.** The iOS 27 status and navigation bars place the rule at 116 pt, versus 86 pt in the frameless harness. Content therefore sits 30 pt lower in absolute terms, with identical spacing below the rule. The floating tab bar overlays the lower rows.
2. **Truthful data.**
   - Activity keeps its canonical summary `Latest · <metric>`; the harness shows "Aug 30".
   - Timeline node colors follow the Server tone, mapped to the locked palette. Real tones can color some types differently from the harness's representative assignment; for example, the Server sends DEXA as success, which renders green.
3. **Rasterization.** CoreText vs Chrome glyph widths differ by ≤1.5%.

## Behavior and accessibility

- Canonical routes, chronology, data, loading, error and empty behavior are preserved.
- Stable identities are added:
  - `evidence.stream.<id>`
  - `evidence.hub.*`
  - `evidence.header.*`
  - `evidence.timeline.*`
- Existing row labels are kept verbatim, and existing UI journeys depend on them.
- Timeline events read as one VoiceOver element, with the rail hidden.
- Rows are full-width and 57 pt tall. Dynamic Type was verified at AX Large.

## Tests

| Run | Result |
|---|---|
| Focused unit suites (EvidenceReadModel, EvidenceHubUsage, EvidenceChronology, AppTab, SharedUI, RecoverySleepPolish, RecoverySleepReadModel) | 138 executed, 0 failures, 1 pre-existing skip |
| New `EvidenceHubTimelineUITests` | 3/3 passed: locked order, full-row ≥44 pt rows, Health Metrics absent, Timeline round trip, no row navigation, `Showing 8 of 124`, Sandbox has no synthesized Timeline, failure/empty/loading states |
| Regression UI: `RecoverySleepAcceptanceUITests` + `TrainingAcceptanceUITests/testCorrectedEvidenceJourneys` | 4/4 passed |
| Rerun after the final fix: Evidence unit + UI | 59 + 3 passed |
| Generic Release compile | Passed: app, embedded Watch app, Live Activity extension |

Notes on test placement:

- The new UI test class lives in `RecoverySleepAcceptanceUITests.swift`, so no file is added to the hand-generated project.
- `TrainingAcceptanceUITests` is a Batch 2 file and was not edited.

## Batch 2 integration note

These Batch 3 files are disjoint from Batch 2's changes:

- `AppEnvironment` (DEBUG lines)
- `EvidenceAPI` (DEBUG)
- `EvidenceHeaderView`
- `EvidenceStreamRowView`
- `EvidenceView`
- `TimelineView`
- `RootTabView` (one DEBUG route)
- `EvidenceReadModelTests`
- `RecoverySleepAcceptanceUITests`

None of them is touched by Batch 2 (`793462b1`), so no conflict is expected.

## Safety

- Production mutated: no. Deployed: no. TestFlight: no. Build number bumped: no.
- No secrets and no Founder media. The review data is a synthetic DEBUG fixture.

## Next step

Founder reviews Checkpoint A. On explicit approval, Checkpoint B (Training + Activity/Cardio) begins on the same branch.

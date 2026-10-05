# Redesign Batch 3 · Checkpoint D: Progress Photos + DEXA Evidence (Claude)

- Task: `batch3-bc-accepted-checkpoint-d-20261005` (prompt commit `28cbb4dd`). A, B and C were accepted and locked at `8aa2d00b`.
- Status: **D implemented, pixel-audited, tested and pushed. STOPPED for Founder review. Checkpoint E not started.**
- Generated (UTC): 2026-10-05T21:45:20Z

## Authorities

| Item | SHA |
|---|---|
| Native | `9d2d0e06` on `claude/redesign-batch3-evidence-takeover-20261005` (pushed) |
| Review package | `759d0dc9` |
| Locked design | `47ed6d1a` (P1–P6, D1–D10) plus the final Since Prior Scan correction `f208007c` (Evidence family LOCKED) |

## Review links (all HTTP 200 at `759d0dc9`)

**Primary mobile board**
- Dark: https://github.com/dustinginn/physiqueos/blob/759d0dc947419647dbc85963de8eb0d9d19a4906/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-d-20261005/checkpoint-d-primary-mobile-review-board.png
- Mineral Light: https://github.com/dustinginn/physiqueos/blob/759d0dc947419647dbc85963de8eb0d9d19a4906/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-d-20261005/checkpoint-d-primary-mobile-review-board-light.png

**Progress Photos**
- Dark: https://github.com/dustinginn/physiqueos/blob/759d0dc947419647dbc85963de8eb0d9d19a4906/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-d-20261005/photos-dark-reference-vs-simulator.png
- Mineral Light: https://github.com/dustinginn/physiqueos/blob/759d0dc947419647dbc85963de8eb0d9d19a4906/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-d-20261005/photos-light-reference-vs-simulator.png
- Synthetic-media image path and inspector: https://github.com/dustinginn/physiqueos/blob/759d0dc947419647dbc85963de8eb0d9d19a4906/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-d-20261005/synthetic-media-image-path.png
- Media states: https://github.com/dustinginn/physiqueos/blob/759d0dc947419647dbc85963de8eb0d9d19a4906/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-d-20261005/media-states-dark-light.png

**DEXA**
- Dark: https://github.com/dustinginn/physiqueos/blob/759d0dc947419647dbc85963de8eb0d9d19a4906/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-d-20261005/dexa-dark-reference-vs-simulator.png
- Mineral Light: https://github.com/dustinginn/physiqueos/blob/759d0dc947419647dbc85963de8eb0d9d19a4906/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-d-20261005/dexa-light-reference-vs-simulator.png
- Since Prior Scan: https://github.com/dustinginn/physiqueos/blob/759d0dc947419647dbc85963de8eb0d9d19a4906/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-d-20261005/since-prior-scan-dark-light.png
- Chart gesture proof: https://github.com/dustinginn/physiqueos/blob/759d0dc947419647dbc85963de8eb0d9d19a4906/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-d-20261005/dexa-chart-gesture-proof.png

**Notes**
- Parity notes: https://github.com/dustinginn/physiqueos/blob/759d0dc947419647dbc85963de8eb0d9d19a4906/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-d-20261005/PARITY-NOTES.md
- Founder photo status: https://github.com/dustinginn/physiqueos/blob/759d0dc947419647dbc85963de8eb0d9d19a4906/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-d-20261005/FOUNDER-PHOTO-VALIDATION.md

## Result

Photos and DEXA now run on a new EvidenceKit `record` family: the 360-px SF Pro harness with its exact Dark and Mineral Light tokens.

Measured residuals (Dark and Light identical):

| Area | Residual (pt) |
|---|---|
| Headers and scope | ±0.3 |
| Latest Photo Set | ≤ 0.4 |
| Photo Set detail | ≤ 1.4 |
| DEXA Latest Scan → headline metrics | ≤ 0.5 |
| Scan History | ≤ 1.3 |

The remaining lower-section offsets are truthful Sandbox content: the phase pill row, the optional weight line, and no PDF media.

The locked wraps are reproduced:
- `LATEST PHOTO / SET` beside `4 / views`;
- the `Show All` / `Close` wraps, using CSS flex-shrink and min-content plus greedy word breaking.

**DEXA chart scroll trap fixed:**
- tap selects;
- horizontal-only pan scrubs;
- a vertical swipe on a chart scrolls the page.

A UI test proves all three. Energy and the Weekly/Monthly Briefings keep the old overlay and stay as follow-ups for their owning families.

## Real Founder photos

**Not validated in this pass.** No Founder photo bytes were read, rendered or committed.

- The safe mechanism is the Sandbox photo-acceptance bridge. It needs a one-time Sandbox pairing credential on the simulator.
- Pairing to Production was avoided because it could move HealthKit delivery off the Founder's iPhone.
- After I asked for the credential, the Founder directed: continue with synthetic fixtures and do not block.

**Validated instead:** the full real-image path, using generated, labelled mannequin media through:
- aspect-fill crops in all three thumbnail and tile sizes;
- pairing;
- the inspector.

The synthetic run also exposed and fixed a real-image layout-widening bug.

**To finish:** enter a Sandbox credential in You → Sandbox connection, then open Photos. This takes about 5 minutes; see FOUNDER-PHOTO-VALIDATION.

## Preserved, and not touched

**Preserved:**
- pose and date mapping;
- staged upload and processing;
- inspector behavior (Briefing keeps its own chrome);
- Photo Briefing published/pending/unknown;
- DEXA units, data and PDF rules;
- Apple Health writeback;
- independent disclosures;
- loading, error and empty states;
- accessibility identities and 44-pt targets.

**Not touched:**
- A/B/C, apart from the opt-in `EvidenceHeaderView(exposesTexts:)`;
- Batch 2 files;
- Server;
- Home, Goals, You and Briefings.

## Tests

| Run | Result |
|---|---|
| Focused unit tests | 573 run, 0 failures (1 pre-existing skip) |
| New `EvidencePhotosDEXAUITests` | 3/3 |
| B/C UI | 11/11 |
| Hub/Timeline | 3/3 |
| Recovery | 3/3 |
| Training acceptance Evidence journeys, including Corrected Evidence through DEXA and Photos | Pass |
| Generic Release compile | Passed (app + Watch + Live Activity); zero review/synthetic strings in the binary |

**Pre-existing, outside D:** `TrainingAcceptanceUITests.testBriefingParityJourneys` ("current Briefing not available from Home") fails identically on accepted base `8aa2d00b`.

## Safety

No TestFlight upload, no build bump, no deploy, no production data. Public media is synthetic or neutral art.

## Next

Founder reviews D. On approval: Checkpoint E (Add Evidence + generic Evidence Review), plus the optional 5-minute real-photo check.

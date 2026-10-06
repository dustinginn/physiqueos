# Batch 3 · Checkpoint A — Evidence Hub + Timeline (Claude takeover)

- Implementation: `ce5c7dd8` (`b2440d37` + section-title baseline fix) on `claude/redesign-batch3-evidence-takeover-20261005` (base `49e48f1e` = Build 87 `f66c7fc6` + accepted Home correction).
- Locked design authority: design commit `f7d72f19` (`agent-handoffs/artifacts/dexa-photos-timeline-evidence-style-translation-20261004`), screens **H1** (Hub), **T1** (Timeline), **S1** (states). Lock record: report `20261004T201501Z` ("Unchanged and locked: Evidence Hub, Timeline").
- Rejected Codex CP-A (`e48e7757`) was used only as an audit input; no code was cherry-picked.

## Start here (phone)

1. `checkpoint-a-primary-mobile-review-board.png` — reference vs simulator, Hub + Timeline, Dark + Mineral Light.
2. `hub-dark-reference-vs-simulator.png`, `hub-light-…`, `timeline-dark-…`, `timeline-light-…` — larger pairs.
3. `checkpoint-a-states-dark.png` / `-light.png` — S1 loading/empty/failure vs real states.
4. `checkpoint-a-hub-end-and-dynamic-type.png` — Hub scrolled to end (Recovery → Timeline last) and AX Large text.
5. `context-build87-codex-candidate.png` — Build 87 shipping Hub · rejected Codex · this candidate.
6. `PARITY-NOTES.md` — measurements and the remaining differences.

`diffs/` holds |difference|×3 images and 50% overlays for each pair. `references/` are the exact locked PNGs (plus a clean S1 render with the PDF sheet hidden). `screens/` are unedited iPhone 17 Pro simulator captures (1206 × 2622). `source/` holds the measurement and board scripts.

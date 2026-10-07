# Build 91: remaining redesign inventory, next design batch, and Watch audit

**Status: Build 91 remaining redesign + Watch audit ready for Founder review. Implementation is held for the workout feedback.**

The Build 91 Watch/Logger batch is **DESIGN READY / IMPLEMENTATION HOLD** until the Founder finishes tomorrow's Build 90 physical workout review. Nothing here starts automatically.

## Scope and provenance

| Item | Value |
|---|---|
| Task prompt | `agent-handoffs/inbox/prompts/20261007T033100Z-claude-build91-remaining-redesign-watch-audit.md` @ `9958c8ea` |
| Base | Build 90 Native `32baf1d5` |
| Branch | `claude/native-build91-remaining-redesign-watch-audit-20261007` (design branch, not for merge) |

**Changes on the branch (all non-shipping):**
- DEBUG-only `WatchFooterProbe` and the candidate `WatchPanelPage.candidateBody`, compiled out of Release.
- Test-only `WatchFooterProbeUITests` and `Build91OperatingPlanDesignBoardTests`.
- This package.

**What did not happen:** no app-target behavior change, no build bump, no TestFlight upload, no Server change, no production mutation.

## Read in this order

1. `INVENTORY.md`: the exact remaining redesign inventory (Goal A).
2. `OPERATING-PLAN-BATCH-DESIGN.md`: the next batch (Operating Plan + DEXA routing + Peptides) and the DEXA dead-end disposition (Goal B).
3. `WATCH-MINERAL-FOOTER.md`: Mineral Light bottom-bar audit and candidate fix (Goal C).
4. `WATCH-READY-HAPTIC.md`: Watch-ready haptic event contract and recommended haptic (Goal D).

## Boards (`boards/`)

| Board | What to judge |
|---|---|
| `B91-OP-A1-dexa-routing-dark.png` | Next DEXA Scan (scheduled / not scheduled / no Coaching / failed) and the editor opened at DEXA, Dark |
| `B91-OP-A2-dexa-routing-mineral.png` | The same, Mineral Light |
| `B91-OP-A3-root-coaching.png` | Current Build 90 root vs proposed root; Coaching Updates detail with the Scheduled Evidence card |
| `B91-OP-B-strategy.png` | Energy (read-only) and Nutrition details |
| `B91-OP-C-peptides.png` | Peptide domain (paused + active) and paused execution |
| `B91-OP-D-tracking.png` | Tracking |
| `B91-W1-watch-footer-49mm.png` | Watch before/after (candidate), 49 mm |
| `B91-W2-watch-footer-42mm.png` | Watch before/after (candidate), 42 mm |

## Founder decisions

| # | Decision | Recommendation |
|---|---|---|
| D1 | Accept the Operating Plan SwiftUI translation boards (OP-A..D) as the implementation target, or give corrections | Accept. They follow the Oct 4 locks |
| D2 | DEXA dead end: approve the Native-only **Next DEXA Scan** page plus the Coaching Updates editor DEXA anchor (no Server change) | Approve |
| D3 | Add the "Scheduled Evidence" card (Next DEXA + Photos cadence) to Coaching Updates detail? This is new presentation on top of the lock | Yes. It makes the schedule findable without opening the editor |
| D4 | Operating Plan tokens: keep the locked Priority canvas (`#06121D` / `#F0EEE6`), or unify on the `redesign*` canvas (`#061019` / `#E8ECE5`) used by Home and Evidence. This decision has been open since Lane A | Keep the lock for Build 91; unify app-wide later in one token pass |
| D5 | Watch footer: report the Watch's **watchOS version**, and whether the bar also shows on the swipe-right **Controls** page (the discriminator). Approve the candidate (no ScrollView when the page fits) | Approve the candidate; verify on device |
| D6 | Watch-ready haptic: `.notification` (recommended) or `.click` (quieter); 10-minute freshness window | `.notification`, 10 min |
| D7 | Energy phase-history projection (Server gap): Build 91 or later? | Later. It needs a Server projection |
| D8 | Home Screen Widget translation (#98–#99) and the P2/P3 child-state tail: Build 91 or Build 92? | Build 92+, isolated |

## Proposed Build 91 implementation batches (after tomorrow's workout feedback)

| Batch | Owner | Content | Depends on |
|---|---|---|---|
| **B91-W: Watch/Logger** | this lane | Mineral footer fix; Watch-ready haptic (+ `preparedAt` contract field); **plus any Watch/Logger items from tomorrow's review** | Founder review, D5, D6 |
| **B91-OP-A** | OP lane | Operating Plan root (one title, Try Again), Coaching Updates detail + editor DEXA anchor, **Next DEXA Scan** (DEXA dead-end fix) | D1–D4 |
| **B91-OP-B** | OP lane | Energy / Nutrition / Training details + editors; Training builder copy | OP-A |
| **B91-OP-C** | OP lane | Peptides (domain, execution, sheets, dose plan), Recovery support, Supplements | OP-A |
| **B91-OP-D** | OP lane | Tracking + Tracking support | OP-A |
| Evidence color system | Claude A (parallel prompt `20261007T033000Z`) | Not in this lane | its own review |

**Integration order:**
1. B91-W (small, highest daily impact).
2. OP-A.
3. OP-B/C/D as checkpoints.
4. Merge with the Evidence color lane last. The only expected overlap is theme tokens.

Each batch then runs the standard gates: unit, Watch unit/UI at both sizes, iPhone UI, Release, seam scan.

## Simulator and tooling notes

- **Watch:** sims "B90 Watch Ultra3 49mm" and "B90 Watch S12 42mm" on watchOS 27.0 (the only runtime installed).
  - Fixtures: `-watchFixture <name> -watchAppearance mineralLight|dark`.
  - Probe: `-watchFooterProbe overflow|overflow-hidden|tall|tall-hidden|fixed` (DEBUG).
- **iPhone boards:** `TEST_RUNNER_B91_BOARD_DIR=<dir> xcodebuild test … -only-testing:PhysiqueOSTests/Build91OperatingPlanDesignBoardTests`.
- **Watch probe:** `TEST_RUNNER_B91_WATCH_CAPTURE_DIR=<dir> TEST_RUNNER_B91_WATCH_PROBES="start:tall,…" xcodebuild test -scheme PhysiqueOSWatch … -only-testing:PhysiqueOSWatchUITests/WatchFooterProbeUITests`.

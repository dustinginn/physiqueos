# Build 93 — Recovery card: Native implementation + OFF-by-default Server wiring (Weekly and Monthly only)

- Task id: `build93-recovery-implementation-continuation-20261008` (prompt `agent-handoffs/inbox/prompts/20261008-build93-claude-recovery-native-wiring.md`, commit `86f88be194f059ef6576a1bb94f4227fd8cd7acd`; follows backlog correction `677aebde`)
- Agent: Claude (existing Claude B / Briefings Remote Control conversation and worktree; no subagents, child sessions or extra worktrees)
- Status: **Recovery Native implementation candidate ready** and **Server wiring candidate ready**, both OFF. Recovery is **not activated, not deployed, not published, not released**.

| Candidate | Branch | SHA | Base / ancestry |
|---|---|---|---|
| Native card | `claude/native-build93-recovery-weekly-monthly-20261008` | `e0a4706d` (code `5de2f37b` + captures) | exact Build 92 `beaf5eff`; build stays **1.0 (92)**; no Server merge, not based on the on-hold Codex Energy `1bb88fb5` |
| Server wiring | `claude/build93-recovery-weekly-monthly-wiring-20261008` | `c493eb06` | `472513ef` (overnight candidate) ← live Server `84cc64e4` |

Authority (read-only): production Server `84cc64e4`, deployment `32143aa4` (unchanged). Latest release Build 92 `beaf5eff` (pointer unchanged).
Production changes: **0**. Real Founder Sleep access: **0**. Policy or authority records written: **0**. Migrations: **0**.

## 1. Approved design implemented (no new design)

The design follows the latest accepted Recovery visuals. Nothing was redesigned.
- Weekly Recovery section: `weekly-midweek-light-translation-final-20261004`.
- Monthly Recovery: `monthly-correction-dexa-photo-briefing-ui-20261004`.
- Mineral Light: the accepted rich `.recovery` field. It was already defined in the Native Briefing kit and is reused unchanged.
- Status semantics: the Recovery Briefing V1 one-card rules (`1bfa92ef`).

One shared `BriefingRecoverySection` serves both cadences. The hierarchy is:
1. RECOVERY head.
2. Statement title.
3. Coverage line with the delta, plus a textual status: dot and "Green" / "Yellow" / "Red" / "Not enough data".
4. Period (or Month) average beside "28-night baseline · Xh XXm / Personal baseline".
5. Plotted Sleep trend on a plate. The personal baseline is a dashed line.
   - Weekly plots nights at their weekday; a missing night stays a gap and is never interpolated.
   - Monthly plots Sunday-anchored week aggregates (W1…).
6. One inline Yellow/Red commentary block with a status-coloured rule. It is never a nested card.
7. Foam-rolling row, shown only for authoritative counts. Today's Server always reports foam as unavailable, so the row is hidden.
8. Caveat.

Behaviour by status:
- **Green** is quiet: title "Sleep stayed in your usual range" and no commentary.
- **Not enough data** is neutral: "—", "N of 7 nights available", and "Keep wearing Apple Watch to sleep". It shows no partial-period average.

The card shows no Recovery Score, no causal claim and no Confidence copy.

Appearance:
- **Dark:** the open canvas with the Recovery tint for Weekly, and the navy field for Monthly.
- **Mineral Light:** the accepted rich navy field.

Locked placement:
- **Weekly:** Training → **Recovery** → Coach's Take.
- **Monthly:** Energy Evolution → **Recovery** → New Baseline.

Accessibility:
- The status reads "Recovery status: Yellow".
- The chart has a full spoken summary ("Weekly Sleep trend: Sunday 6 hours 40 minutes, … Personal baseline … Status …").
- The average and baseline rows are combined elements.
- Text scales with Dynamic Type through the Briefing type system.

Copy-only deltas from the fixture-only design boards:
- The "FUTURE CONTRACT · FIXTURE ONLY" flag and "Confidence coupling: none." are omitted. Both were design-proof annotations.
- The delta is shown in the coverage line, because the task requires average, baseline **and** delta.

## 2. Confirmation images (shipping SwiftUI, real Simulator, Dark and Mineral Light)

These are code-acceptance captures from iPhone 17 Pro, iOS 27.0, of the actual Weekly/Monthly screens. The data is synthetic: production-shaped payloads come from a DEBUG-only overlay, pass through the real decoder, and use the Sandbox store. No Founder Sleep was used.

Location: Native branch `claude/native-build93-recovery-weekly-monthly-20261008` at commit `e0a4706d`, folder `agent-handoffs/artifacts/build93-recovery-card-native/` (open it on GitHub at that branch).

Each file is named `recovery-<card>-<appearance>.png`:

| Card | Dark | Mineral Light |
|---|---|---|
| Weekly · Green | weekly-green-dark | weekly-green-mineral-light |
| Weekly · Yellow | weekly-yellow-dark | weekly-yellow-mineral-light |
| Weekly · Red | weekly-red-dark | weekly-red-mineral-light |
| Weekly · Not enough data | weekly-not-enough-data-dark | weekly-not-enough-data-mineral-light |
| Monthly · Green | monthly-green-dark | monthly-green-mineral-light |
| Monthly · Yellow | monthly-yellow-dark | monthly-yellow-mineral-light |

Index: `agent-handoffs/artifacts/build93-recovery-card-native/README.md` on the Native branch.

## 3. Native contract handling (old-client compatible, fail closed)

The optional top-level `recovery` (`recovery_card_v1`) is decoded **only** for Weekly (finished detail) and Monthly (persisted detail, top-level key only). A raw stored `briefing.recoveryAssessment` is never read. The validator refuses all of the following:
- a wrong schema or presentation;
- a cadence that is not exactly the artifact's;
- a week that is not Sunday–Saturday, or a period that is not a whole calendar month;
- a period that differs from the artifact window, or a period not yet closed;
- baseline nights outside 14…28, or a lookback other than 28;
- non-finite, ≤0 or >1,440 minutes, or an absurd delta;
- unordered or out-of-period points, the wrong granularity, or a point count that doesn't match observed nights;
- oversized text, or commentary on Green or Not enough data;
- foam that is not authoritative.

Any failure means the card is missing and the rest of the Briefing is untouched. An absent key renders nothing: no section, header, placeholder or gap. `dataLimitations` codes are never read.

**Structural non-leakage:** the field exists only on `WeeklyBriefingContent` and `MonthlyBriefingContent`, so Midweek, DEXA, Photo and Daily models cannot hold one.

**Old clients:** Build 92 decodes Briefing detail as a generic JSON tree, so the extra key is ignored. The new client with no key is identical to before (tested).

Native diff vs `beaf5eff` (code commit): 13 files, +1,428/−21.
- New: `BriefingRecoveryReadModel.swift`, `BriefingRecoverySection.swift`, `BriefingRecoveryReviewFixture.swift` (DEBUG-only), `BriefingRecoveryCardTests.swift`, `BriefingRecoveryAcceptanceUITests.swift`.
- Edited:
  - `BriefingReadModel` (two optional fields);
  - `ProductionBriefingMapper` (two decode calls);
  - Weekly/Monthly sections (one line each, plus the inventories);
  - `BriefingSandboxStore` (DEBUG overlay hook);
  - one inventory test;
  - `generate_project.py`: a pinned `0x20FF` block. The pbxproj diff is additive (+20/−0, no renumbering) and regeneration is deterministic.

## 4. Native tests (sequential, lane-owned Simulator)

| Gate | Result |
|---|---|
| New `BriefingRecoveryCardTests` | 17 passed. Covers every status for both cadences, every malformed case, excluded cadences, window/closed-period checks, Midweek/DEXA/Photo injection, Monthly raw-envelope refusal, copy/no-score/no-codes, gap plotting, rendering in both appearances, and the sandbox default with no card |
| Focused Briefing suites (Recovery + `BriefingReadModelTests` + `BriefingV3PresentationTests`) | 101 passed |
| `BriefingRecoveryAcceptanceUITests` (real Simulator) | 6/6 passed (details below) |
| Full Native unit suite | **2,240 executed, 0 failures** (1 pre-existing local-only skip) |
| Existing `TrainingAcceptanceUITests.testBriefingParityJourneys` | passed |
| Release build: app + Watch app + widget/Live Activity extension (`generic/platform=iOS Simulator`, unsigned) | **BUILD SUCCEEDED** |
| `verify_release_configuration.py` | passed: version 1.0 (92) |
| Release seam scan of the binary | review flag 0 hits, synthetic ids 0, `recovery_card_v1` present |

What the 6 UI acceptance cases cover:
- Weekly order Training → Recovery → Coach's Take for every status;
- Monthly order Energy → Recovery → New Baseline;
- the accessible chart, average and foam row;
- no Recovery when absent or malformed;
- Midweek, DEXA and Photo render nothing even when a payload is injected;
- the 12 captures.

Test side effect: the full unit run rewrote 14 tracked widget snapshot PNGs under `agent-handoffs/artifacts/home-screen-widget-v1/`. They were restored to their committed bytes and are not part of any commit. The full 2-hour UI suite was not run (not required; no regression demanded it). The Watch test targets were not run separately; the Watch app is unchanged and compiled in Release.

## 5. Server wiring (completed, OFF by default)

`providerBriefingCadenceComposition.js` now builds the protected read-only `RecoverySleepInputReaderV1` and `RecoveryBriefingComposerV1`, and passes `recoveryComposer` to the **Weekly and Monthly generators only**. Untouched:
- the Midweek generator and the reconciliation (regeneration) composition. Regeneration keeps its unconditional verbatim carry-forward and never adds a card.
- settlement, Confidence, V3, recommendations, strategic eligibility, schedules and precedence.

How it behaves:
- **Authority absent (production today, none installed):** a NEW Weekly/Monthly costs exactly **one single-row authority lookup** (`healthKitConfiguration/recovery_briefing_publication_authority`). It makes **zero Sleep reads**, and the artifact is the **same object** (byte-identical). Excluded cadences read nothing.
- **Synthetic authority (tests only):** a NEW eligible Weekly or Monthly gets the envelope from one bounded ordinary `healthKitSleepDays` range read (baseline 28 + period).
  - Fewer than 14 reliable prior nights publishes **nothing**.
  - Weekly needs ≥5/7 period nights; Monthly needs ≥20, otherwise the card is "Not enough data".
  - Existing occurrences are never recomposed, and there is no backfill.
  - Read failures leave the briefing unchanged.
  - Decision logs carry codes only.
- **Performance:** at most one extra single-row query per Weekly/Monthly occurrence while OFF.
- **Still not authentic** (unchanged from the overnight candidate): foam and training-constraint context have no authoritative Recovery source yet, so both are passed as unavailable and can never set or rescue status.

Server diff vs `472513ef`: 6 files, +200/−12.
- Composition: +26 lines.
- New `providerBriefingCadenceRecoveryWiring.test.js` with 6 tests.
- The "not wired" test is converted to "wired only into Weekly and Monthly; never Midweek or reconciliation".
- Comments are updated in the reader and the two structural guard allowlists.

Server tests:

| Gate | Result |
|---|---|
| Recovery + composition + Sleep-quarantine + read-boundary suites | 10 files, **196 passed** |
| Full Server unit suite | candidate 10,309 executed. Failing set **identical to exact base `84cc64e4` at test-name level** (299 = 294 tests + 5 suite-load; 0 new, 0 fixed). These are all pre-existing on base; visible causes are the private Founder runtime store and fixtures absent from the worktree |
| ESLint (`--max-warnings 0`) on touched files | clean |
| Production Web build | **not run for `c493eb06`**: shared disk stayed at 13 GiB, next to the 12 GiB floor, while other lanes were building. The overnight base `472513ef` passed it; this delta adds two server-only imports to a module the tests import |

## 6. Weekly/Monthly-only proof (summary)

| Surface | Mechanism | Proof |
|---|---|---|
| Server write funnel | `assertRecoveryCadenceInvariantV1` on create and complete (from `472513ef`) | Recovery refused on Midweek, event and Daily, including null or empty |
| Server composition | composer passed to Weekly and Monthly only | source assertion + wiring test (Midweek options have no Recovery key) |
| Server Native read | `recovery` only for Weekly/Monthly with a valid envelope; DEXA/Photo passthrough strips it | `472513ef` tests |
| Native model | field only on Weekly/Monthly content types | unit test: Midweek/DEXA/Photo encodes with no `recovery` key |
| Native decode | decoder returns nil for Midweek, Event and Daily, or a cadence mismatch | unit tests |
| Native UI | Midweek, DEXA and Photo walked end to end with an injected Red payload: no Recovery header, status or chart | UI test |

## 7. Eligibility (unchanged; theoretical only)

- The first theoretically eligible Weekly is Oct 18–24, published **Sun Oct 25**. It needs ≥14 of the 16 Oct 2–17 nights to be reliable and ≥5/7 period nights. It is **not guaranteed**.
- Nov 1 is a Sunday, so Monthly precedence supersedes that week's Weekly. The October Monthly can never be eligible.
- The first theoretical Monthly is November, published **Dec 1**.
- Schedules and precedence are unchanged (tested in `472513ef`).

## 8. Still required before any card appears (each separately authorized)

1. Founder review of both candidates.
2. Real-data **prospective shadow calibration**: a zero-write production read of canonical Sleep days and policies, reviewing ledger rates (ambiguous revisions, late revisions) and status calibration.
3. Server **deploy** of the reviewed wiring (`c493eb06` or its successor).
4. A guarded runner (not yet written) to **install the publication authority** record (Weekly+Monthly, effective from 2026-10-18, floor 2026-10-02). Rollback = disable the record.
5. **Native release**: integrate `5de2f37b` into a Build 93 integration, bump, TestFlight. Without it a published card stays stored and invisible.
6. Web rendering of the card is not implemented.

## 9. Proposed backlog status (for reconciliation; this report does not edit the backlog)

> Recovery Briefing V1 — Weekly + Monthly only. Approved design IMPLEMENTED in Native (candidate `e0a4706d`/code `5de2f37b` on Build 92; Dark + Mineral Light captures) and Server composition WIRED OFF-by-default (`c493eb06` on `472513ef`). NOT active, NOT deployed, NOT released; no authority record; no real Sleep read. Remaining: shadow calibration, deploy, authority install, Build 93 Native integration/TestFlight, optional Web card. Keep OPEN.

## Disk / process safety

- Disk at start: 25 GiB. During the lane, other lanes' builds drove it to the 12 GiB floor.
- In response I paused heavy work and deleted only my own regenerable DerivedData (≈2.4 GB) and my lane-created simulator after results were captured. The Web build was then skipped.
- Every heavy gate ran sequentially, and I waited out the other lanes' Release builds.
- No Xcode archive, other simulator, other lane, backup, credential or receipt was touched.

## Result

production_mutated: false · deployed: false · testflight_uploaded: false · Recovery activated: no

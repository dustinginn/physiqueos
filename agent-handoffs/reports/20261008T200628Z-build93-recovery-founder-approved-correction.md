# Build 93 — Recovery Founder-approved correction (isolated Server + Native candidates)

- Generated (UTC): 2026-10-08T20:06:28Z

- Task: `build93-claude-recovery-founder-approved-correction-20261008`, from prompt `agent-handoffs/inbox/prompts/20261008-build93-claude-recovery-founder-approved-correction.md` (commit `5b5efcc7`).
- Agent: Claude (existing Claude B conversation, single Remote Control worktree).
- Authority: the Founder approved the October 4 locked Weekly/Monthly Dark and Mineral Light designs and all seven content decisions. This task produces isolated candidates only.
- **Not done:** integration, deploy, activation, real Sleep or Founder-data read, data mutation, build bump, archive, TestFlight, or release-pointer change. Production stays Server `84cc64e4` (deployment `32143aa4`) and Native Build 92 `beaf5eff`.

## 1. Candidates

| Lane | Branch | SHA | Base |
|---|---|---|---|
| Server | `claude/build93-recovery-founder-correction-server-20261008` | `208edfc7` | Recovery wiring `c493eb06` (on live `84cc64e4`) |
| Native | `claude/native-build93-recovery-founder-correction-20261008` | final `766bd9dc` (code `5cdc9106`) | Recovery Native `e0a4706d` (Build 92 `beaf5eff`), version 1.0 (92) |

Recovery stays **OFF by default**: publication authority absent = OFF. It stays prospective-only (`sleep-canon-v3` validation_only), requires at least 14 reliable prior nights, and applies to **Weekly and Monthly only** (never Midweek, DEXA or Photo).

## 2. The seven decisions, as implemented

1. **Foam row on both cadences.**
   - The Server projects it for Weekly and Monthly.
   - Native shows it whenever the schedule is authoritative (`on_track`/`mixed`).
2. **Real counts from canonical sources.** New pure `RecoveryExecutionContextProjectionV1` reads the generator's already-loaded snapshot.
   - **Sources:**
     - reminder `reminder_foam_roll_daily` `completionHistory` (plus legacy `completedAt`);
     - `dailyCheckIns` reconciliation (Universal Skip and Morning Check-In);
     - the schedule: reminder cadence/days, start and end from `execution_foam_roll.preferredSchedule` (reminder schedule as fallback), and execution-item pause windows.
   - **One disposition per date**, with deterministic precedence: completed > excused (explicit Skip) > missed.
   - **Morning dispositions:** a Morning "note" is not a Skip, so it counts as missed.
   - **Schedule dates:** no pre-effective-date denominator. The effective date is read from the canonical schedule, never hardcoded; tests use 2026-09-15, 2026-10-20, 2026-10-24 and 2026-11-09.
   - **No lookahead:** evidence recorded after the generation cutoff is ignored. Morning-reconciled completions, written with a backdated local 20:00, use the reconciliation entry's real `recordedAt`.
   - **Undatable evidence** takes the day out of the denominator, with a limitation code, instead of guessing.
   - **Without schedule authority** (no start date, inactive, unsupported shape), only observed completions are produced, and Native hides the row.
3. **Editorial titles.**
   - Green keeps its fixed title, "Sleep stayed in your usual range".
   - Yellow/Red titles are Server-authored and derived from the published values:
     - Weekly Yellow: "Sleep was persistently below baseline".
     - Monthly Yellow: "Sleep softened across the second half / first half / month", by where the Yellow weeks fall.
     - Red: "Sleep strain was severe and persistent".
   - Monthly keeps the **distinct titled amber-ruled block**: "A multi-week shift" (or "A persistent shift" for the night-count path).
4. **Summary matches the October 4 layout.**
   - Weekly: "6h 47m average · 7 of 7 nights". Monthly: "6 hr 30 min average · 28 of 31 nights".
   - The extra "−43m vs baseline" fragment is removed. The baseline metric and graph are unchanged.
   - Monthly also restores the lock's compact uppercase month-average figure.
5. **Non-escalating training sentence.** "No downstream training constraint was established." is emitted only when both hold:
   - at least 3 of the 4 preceding Sunday–Saturday weeks are comparable, with a typical count of at least 2 sessions;
   - the period's canonical resistance-training days are not materially reduced (the policy's own reduction threshold).
   - Anything missing, reduced or excluded omits the sentence. It is never a causal claim.
   - **"Training performance held" is HELD** (see §7): there is no performance-evidence authority for Recovery yet, so the projection never sets `performanceHeld`.
6. **Training-corroborated Red is disabled for publication.**
   - Policy `training.publicationCorroboration = "disabled_pending_exclusion_authority"`.
   - The projection never asserts `materialConstraint`.
   - Published assessments gate `qualifies` off (limitation `training_corroboration_disabled_for_publication`).
   - The Sleep-only Red/Yellow policy is unchanged, and shadow validation still models corroboration.
7. **Foam is execution context only.**
   - Tests prove that the same Sleep with 0/7 vs 7/7 foam gives an identical status and commentary.
   - No Confidence, strategic, narrative or recommendation coupling (the isolation contract is unchanged).
   - The fixture flag ("FUTURE CONTRACT · FIXTURE ONLY") and the "Confidence coupling: none." caveat note render **only** in DEBUG review-fixture mode, as on the locked boards. A Release card never shows them (unit-tested).
   - Caveat semantics follow the lock per cadence:
     - Weekly: "Personal baseline excludes this period. Foam rolling cannot change status. Associations do not imply causation."
     - Monthly: "Sleep uses the prior 28 reliable nights and excludes this period. Foam rolling cannot set the Recovery status. Associations do not imply causation."
     - The foam sentence appears only when the row shows.

## 3. Changed files

### Server (`c493eb06` → `208edfc7`, 10 files, +1018 / −28)

| File | Change |
|---|---|
| `RecoveryExecutionContextProjectionV1.js` (new) | Pure foam and training projections (no store, clock, write or Sleep access) |
| `RecoveryBriefingAssessmentServiceV1.js` | Publication corroboration gate; `noConstraintEstablished`; editorial headline, block title and body; Monthly Yellow week anchors |
| `RecoveryBriefingPolicyV1.js` | `training.publicationCorroboration` |
| `RecoveryBriefingPublicationV1.js` | `executionInputs` → projections (failure = context absent, never a failed card); card adds `missedOccurrences`/`excusedOccurrences` |
| `RecoveryBriefingComposerV1.js` | Reads the four in-memory snapshot lists **only after** the authority, cadence and period gates pass |
| `WeeklyNarrativeService.js`, `MonthlyBriefingService.js` | One-token change each: pass their own read-only snapshot `repositories` |
| Tests | New `RecoveryExecutionContextProjectionV1.test.js` (15), `RecoveryBriefingExecutionContextPublication.test.js` (6), plus 5 new decision tests in the assessment test |

No new production query, collection, permission or route. The provider cadence already builds `repositories` from the canonical runtime it loads each tick, so OFF still costs one authority lookup and zero Sleep or snapshot reads.

### Native (`e0a4706d` → candidate, 5 code/test files, no new files, project unchanged)

| File | Change |
|---|---|
| `Contracts/BriefingRecoveryReadModel.swift` | `Commentary.title`; `FoamRolling.missed/excused`; the split must add up and `mixed` ⇔ missed > 0; a card without the split reads not-completed as missed |
| `Presentation/Briefings/BriefingRecoverySection.swift` | Delta-free summary (Monthly "6 hr 25 min" format); Monthly compact figure; titled commentary block; per-cadence foam sub-line and caveat; review-only fixture flag and coupling note |
| `Networking/BriefingRecoveryReviewFixture.swift` (DEBUG) | Scenarios carry the locked content (Weekly Green 4 of 7 · three misses; Monthly Yellow locked title, block, 18 of 22 · 3 excused · 1 missed); `nofoam` replaces `foam` |
| `PhysiqueOSTests/BriefingRecoveryCardTests.swift`, `PhysiqueOSUITests/BriefingRecoveryAcceptanceUITests.swift` | New split, title, sub-line, annotation and locked-content tests; lower-half captures |

Foam sub-line, matching the lock per cadence:
- Weekly: "Three misses · status unchanged", "One miss · 2 excused · status unchanged", "Full execution · status unchanged".
- Monthly: "3 excused · 1 missed", "Full execution".

## 4. Tests

| Gate | Result |
|---|---|
| Server focused Recovery and wiring | 7 files, 179/179 + 6 new publication-context tests: all pass |
| Server wide filter (Briefing, Recovery, Priority, Reminder, HealthKitSleep) on the candidate | 1,699 passed / 11 failed. The failing set is **identical at base `c493eb06`** (1,673 / 11): missing private Founder runtime fixtures and route harness |
| Server cherry-pick onto Codex integrated `d2b39b6d` (same filter + DEXA) | 1,872 passed / 16 failed; **identical failing set to `d2b39b6d` alone** (1,846 / 16) |
| ESLint, changed Server files | clean |
| Native focused (`BriefingRecoveryCardTests`, `BriefingReadModelTests`) | 67/67 |
| Native Recovery UI (`BriefingRecoveryAcceptanceUITests`, real Simulator) | 8/8 (one new test fixed to use leaf text, then passed on rerun) |
| Native full iPhone unit | **2,244 passed, 0 failures** (1 designed skip); tracked widget PNGs rewritten by the suite were restored |
| Release build (generic iOS Simulator, unsigned) + `verify_release_configuration.py` | Release build succeeded (app + Live Activity/widget extension); release configuration verified 1.0 (92) |
| Seam scan | Release binary: 0 occurrences of the fixture flag, the coupling note, the review-fixture argument or the removed vs-baseline fragment; shipping copy present |

## 5. Four-surface screenshot comparison

The comparison lives on the Native branch in folder `agent-handoffs/artifacts/build93-recovery-founder-correction`:
- `comparison.html`, a side-by-side board;
- `locked/`: crops of the four October 4 boards;
- `candidate/`: real Simulator captures of the shipping SwiftUI with the DEBUG review fixture; synthetic data, **not device captures**;
- `*-lower` captures show the block, foam row and caveat.

| Surface | Locked | Candidate | Remaining delta |
|---|---|---|---|
| Weekly Dark | Green, fixed title, "6h 47m average · 7 of 7 nights", 6h 47m / baseline 6h 45m, Su–Sa graph, Foam "Three misses · status unchanged · 4 of 7 completed", caveat | identical content and order | iOS typography/metrics vs HTML |
| Weekly Mineral Light (rich field) | navy rich field above Coach's Take | same field, same content | same |
| Monthly Dark | "Sleep softened across the second half", "6 hr 25 min average · 27 of 30 nights", compact 6H 25M, baseline 6h 44m, W1–W5, "A multi-week shift" block, "18 of 22 completed · 3 excused · 1 missed", caveat | identical structure and copy | Sandbox month is August (31 days): "6 hr 30 min · 28 of 31"; the lock used a synthetic 30-night month |
| Monthly Mineral Light | as Dark on the navy field | same | as above. The lock's dim RECOVERY head (low contrast on the field) is not reproduced; the head stays legible |

## 6. Server merge guidance against `d2b39b6d`

- `d2b39b6d` carries the Recovery commits **cherry-picked** (new SHAs; the Recovery files are byte-identical to `c493eb06`). A *merge* of this branch therefore shows add/add conflicts.
- **Use `git cherry-pick 208edfc7` onto `d2b39b6d`** (or the next integration head). It was verified clean with `git merge-tree --merge-base=c493eb06`, and the combined tree's tests are listed above.
- No DEXA, Logger or other Codex file is touched, and the held Energy code is not included.
- Deploying this Server is a separately authorized step. Even once deployed, Recovery stays OFF until a separately authorized authority record exists.

## 7. Held subparts and known limitations

- **"Training performance held." — HELD.** Approved wording, but Recovery has no reviewed performance-evidence source; session counts support only "no constraint established". Wiring performance (for example Training PI observations) is a separate decision.
- **Monthly foam sub-line has no "status unchanged".** The task asked for a sub-line that "shows status unchanged", but the locked Monthly board reads "3 excused · 1 missed". The lock was followed, and the caveat carries the status statement. Adding the clause is a one-line change if preferred.
- **Morning "note" counts as missed**, not excused. Only explicit Skips are excused (decision 2).
- **Training-corroborated Red stays off** until travel, illness, injury, planned-rest and deload exclusions have authoritative handling.
- **Schedule shapes** supported: daily, specific weekdays, every-x-days. Others yield no denominator (row hidden), never a guess.
- **Native generator/pbxproj:** untouched (no new files). The existing `0x20FF` Recovery block is unchanged, and there is no overlap with the theme branch's `0x21FF` beyond what `e0a4706d` already had.
- **No real Sleep calibration or activation.**
  - The first theoretical Weekly is Oct 25 and the first Monthly is Dec 1, and only after a separately authorized zero-write shadow calibration, Server deploy and authority installation.
  - Captures are synthetic; physical acceptance needs a real device after activation.

## 8. Backlog reconciliation (for the coordinator; report-only publication)

- Recovery Founder content HOLD: **resolved by candidates** Server `208edfc7` and Native `766bd9dc`.
- Status: tested, not integrated, deployed or released.
- Supersedes Native `e0a4706d` and Server `c493eb06` for integration purposes.

## 9. Disk and coordination

- Free disk was 15–20 GiB throughout (HOLD floor 12 GiB).
- Heavy Xcode and Vitest runs were serialized; no concurrent Codex Xcode job was observed.
- One lane simulator (iPhone 17 Pro "B93 Recovery Correction") and DerivedData `dd3` are removed after capture.
- Archives 85–92, other simulators, worktrees and credentials are untouched.

## 10. Next step

1. **Founder:** review the four-surface comparison and the two held subparts in §7.
2. **Integration (Codex/Founder):**
   - cherry-pick Server `208edfc7` onto the integrated Server;
   - include Native `766bd9dc` in the combined Build 93 Native integration (resolving the generator per the theme report, keeping `0x20FF` and `0x21FF`);
   - run the full gates.
3. **Separately authorized:** Server deploy, zero-write shadow calibration, authority install, then the Build 93 release.

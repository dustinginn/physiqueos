# Build 93 — Recovery Briefing V1, Weekly + Monthly only: Server candidate

- Task id: `build93-recovery-weekly-monthly-overnight-20261008` (prompt `agent-handoffs/inbox/prompts/20261008-build93-claude-recovery-overnight.md`, commit `f332b559157bed14473cd4b6ed9107f31d23064f`)
- Agent: Claude (Claude B / Briefings lane, existing Remote Control worktree; no subagents, no extra worktrees, no child chats)
- Status: **READY FOR FOUNDER REVIEW OF RECOVERY CANDIDATE** — not active, not published, not deployed
- Candidate branch: `claude/build93-recovery-weekly-monthly-server-20261008`
- Candidate SHA: `472513efc8e107e77ced69ff654e89da5cd88931` (7 commits on exact live Server `84cc64e4e7205b2540bf78ea43afd1cbfb068d06`)
- Native candidate: **none** (see Native handoff below)
- Production changes: **ZERO**. Real Founder Sleep access: **ZERO**. Data mutation: **ZERO**.

## 1. Authority verified (read-only)

| Authority | Value | How verified |
|---|---|---|
| Live Server | `84cc64e4` (buildId `physiqueos-84cc64e4-20261008`), schema 000014, ready 9/9 | public `/api/v1/health/live` + `/ready` |
| Active deployment | `32143aa4-90d4-496a-81b2-17f35a609fde` | read-only `doctl apps get` (app metadata only) |
| Production branch head | `combined-app-platform-cutover` = `84cc64e4` | `git ls-remote` |
| Shipped Native | Build 92 `beaf5eff9d3c4147fba4dec095e8092c0fae9b91` (pointer unchanged) | `agent-handoffs/latest.json` on main |
| Original Recovery candidate | `1bfa92ef874c3c96f05b23a9d3cbdfb956384156` (base `5804e88d`) | exists only on `origin/codex/recovery-briefing-v1-shadow-assessment-server`; **not** an ancestor of `84cc64e4`; no Recovery Briefing file exists in live source → never merged, never deployed |
| Founder Weekly/Monthly lock | backlog commit `a06ed153`; latest backlog commit `7c71a6d4` (no newer Recovery change) | `git show` |
| Sleep production policy (from published reports, not re-queried) | activation `validation_only`, D0 `2026-10-02`, open-ended, Oura source preference; `sleep-canon-v3` ordinary-prospective from `2026-10-02`; strategic Sleep graduation (V3 `sleep_night`) live since 2026-10-05 | reports on main; **no production DB read was made** |

No production database query, console, paired Founder credential, raw Founder health data or artifact write was used.

## 2. Gap matrix (original `1bfa92ef` vs this candidate)

| Capability | `1bfa92ef` | Live `84cc64e4` | This candidate |
|---|---|---|---|
| Pure personal baseline (prior 28 nights, median, `max(15m, 1.4826×MAD)`), ≥14 usable nights, material/severe thresholds | yes | absent | **imported byte-identically**, semantics unchanged |
| Weekly ≥5/7, Monthly ≥20 nights, Yellow/Red rules, foam execution-context-only, training non-causal, strategic exclusion | yes | absent | unchanged |
| Midweek Recovery logic | yes (3-night rules) | absent | **removed: Midweek is refused outright** (Founder lock) |
| Mandatory availability (no-lookahead) | rows without `availableAt` were accepted | — | **corrected: unknown availability = unreliable** |
| Weekly period shape | 7 nights | — | must also be Sunday–Saturday (Server Weekly window) |
| Shadow vs publication mode | shadow only | — | explicit `mode`, bound into identity/validation |
| Prospective input authority / projection from canonical Sleep v3 | none (consumed pre-normalized rows; required `validation_only` purpose per row) | none | **new `RecoveryBriefingSleepInputProjectionV1`** (below) |
| Shadow runner | unwired, fixture rows | — | prospective mode consumes canonical days only via the projection; still unwired |
| Calibration (real data) | sanitized Jul–Sep zero-write aggregate (design phase) | — | not rerun (no real Sleep access authorized) |
| Optional artifact field | none | none | **`briefing.recoveryAssessment`** envelope, Weekly/Monthly only, OFF by default |
| Briefing composition | none | none | optional `recoveryComposer` seam in Weekly + Monthly generators; **not wired** |
| Write-boundary invariant | none | none | repository refuses Recovery on any non-Weekly/Monthly or event artifact |
| Native read model | none | none | optional top-level `recovery` (`recovery_card_v1`) in Native briefing detail |
| Native rendering | prototype only | none | **not implemented** (precise handoff below) |

## 3. Lineage and overlap proof

Commit 1 (`ebb5c2ca`) imports exactly five files from `1bfa92ef`; every blob is byte-identical:

| File | Blob (both commits) |
|---|---|
| `RecoveryBriefingPolicyV1.js` | `6fcf7b50` |
| `RecoveryBriefingAssessmentServiceV1.js` | `ff737f2f` |
| `RecoveryBriefingAssessmentServiceV1.test.js` | `4f8aab4b` |
| `RecoveryBriefingShadowServiceV1.js` | `15b2daca` |
| `RecoveryBriefingShadowServiceV1.test.js` | `827dc17c` |

Nothing else from the old `5804e88d` base was taken (no broad merge). The design artifacts and the superseded Midweek prototype screenshots were deliberately not imported. The original tests passed unchanged on the live base before any edit (2 files, 50 tests).

Whole candidate vs `84cc64e4`: 20 files, +4100 / −12. Only four existing production files change (all additive): `WeeklyNarrativeService.js`, `MonthlyBriefingService.js`, `DailyBriefingRepository.js` and `BriefingNavigationReadService.js`. Two existing structural guard tests gain reviewed allowlist entries. No file is deleted. Universal Skip, Training Variants, V3/Confidence, DEXA policy and Sleep canonicalization sources are untouched.

Commits: `ebb5c2ca` import · `c1ce0dc5` Weekly/Monthly-only assessment + Sleep v3 projection · `ab754384` publication gate + composer · `323601b6` generator seams, write invariant, Native card · `ab5ab488` Sleep-quarantine allowlist · `d6d77474` fail-closed hardening + JSONB proof · `472513ef` read-boundary allowlist.

## 4. Prospective-only, non-strategic Sleep input boundary

`RecoveryBriefingSleepInputProjectionV1` (pure; no clock, repository or mutation) takes stored canonical Sleep day records plus the raw Sleep activation and canonical-algorithm policy records, and accounts for **every** sleep day of the prior-28-night baseline and of the closed period exactly once:

- `reliable` — `validation_only` provenance (ingestion purpose and origin agree), `sleep-canon-v3`, ordinary id for that exact sleep day, owner matches, main sleep episode from a **sensor** source, 0 < asleep ≤ 24 h, sleep-day window closed at the cutoff, and this stored revision **computed at or before the cutoff**.
- `withheld` with a reason — `duplicate_sleep_day_rows`, `not_an_ordinary_canonical_day`, `owner_mismatch`, `provenance_not_prospective` (incl. `operational` and conflicting labels), `algorithm_not_canon_v3`, `availability_unknown`, `revised_after_cutoff`, `sleep_day_window_unknown`, `sleep_day_window_open_at_cutoff`, `after_activation_window`, `no_main_sleep`, `duration_implausible`, `manual_only_source`, `revision_selection_unreadable`, `ambiguous_revision_continuation`.
- `missing` — no canonical row.
- `before_prospective_floor` — earlier than max(Recovery floor, Sleep D0, v3 effective day): pre-policy/historical-era nights can never count, whatever a row says.
- Blocked whole: any historical-import provenance (categorical), Sleep activation off, v3 policy off/absent, non-Weekly/Monthly period, invalid cutoff/floor.

Unreliable nights are never borrowed, substituted or interpolated. The canonical store keeps only the latest revision, so a night revised after the cutoff has no recoverable as-of-cutoff value and is withheld — late data cannot change a closed assessment. Ambiguous v3 copy continuations (possible with the Oura preference) are withheld conservatively; this is an explicit, documented calibration parameter. Time-zone-uncertain nights count for duration only, never clock metrics. The projection does not read the strategic Sleep graduation scope and never emits `sleep_night` V3 evidence; output carries `strategicEvidenceEligibility: "excluded"` and the ledger carries no Sleep values.

Test fixtures are produced by the real path (synthetic samples → real `sleep-canon-v3` canonicalizer → real stored-day payload builder), not hand-written imitations.

## 5. Future-only Weekly/Monthly publication (OFF)

- **Authority** `recovery_briefing_publication_authority_v1` — absent = OFF. Any cadence other than `weekly`/`monthly` (e.g. a Midweek, DEXA or Photo grant), weakened isolation (`strategicEvidenceEligibility`, `historicalBackfill`, `artifactRewrite`, `publishBeforeBaselineEligible`), invalid dates or a missing `authorizationRef` turn it fully OFF (never silently narrowed). Proposed record location: `healthKitConfiguration` / `recovery_briefing_publication_authority`. **No such record exists in production and none was written.**
- **Gates in order:** cadence (excluded types never read anything) → authority → per-cadence grant → future-only `effectiveFromPeriodStart` → closed window + cutoff (derived for closed-window contracts) → projection → publication-mode assessment → **baseline gate: < 14 reliable prior nights = NO field at all**. Once eligible, the card publishes Green / Yellow / Red / Not enough data (period coverage below 5/7 or 20 nights = Not enough data).
- **Envelope** `briefing.recoveryAssessment` (`briefing_recovery_assessment_v1`): assessment, eligibility accounting, authority ref, isolation contract (strategic excluded; Confidence/Narrative/recommendation/settlement coupling `none`; historical rewrite false) and a stable-JSON integrity digest, bound to the artifact id, cadence and exact evidence window. Proven to re-validate after a key-reordering JSON (JSONB) round trip for every status.
- **Composer seam:** `createWeeklyNarrativeService` / `createFounderMonthlyBriefingService` accept an optional `recoveryComposer`; absent (every composition today) they are byte-identical. It runs only for a NEW occurrence (never an existing artifact), after artifact build and before V3 finalization, never throws, never holds or fails a briefing, and makes zero Sleep reads when disabled.
- **Regeneration/correction** carries a published envelope forward verbatim and never adds one (unconditional, so a later unwiring can never drop a published card).
- **Write invariant** (`createDailyBriefing`, `completeScheduledBriefing`): a Recovery field — including `null`, `{}` or any placeholder — is refused on Midweek, Daily, event (DEXA/Photo) and every non-Weekly/Monthly artifact, and on Weekly/Monthly unless it is a valid envelope for that exact artifact/window.
- **Native read:** Weekly/Monthly detail gains an optional top-level `recovery` only when a valid envelope exists; otherwise the key is omitted (not null). The raw stored envelope is never forwarded; DEXA/Photo passthroughs strip it defensively. Build 92 Native decodes briefing detail as a generic JSON tree and reads keys by name (`ios/PhysiqueOS/Networking/ProductionBriefingMapper.swift`), so old clients ignore the key.

Not changed: settlement readiness, Goal/Strategy Confidence, Narrative V3 decisions, recommendations, strategic eligibility, algorithm selection, the cadence registry, schedules and precedence. Foam rolling and training corroboration inputs are passed as unavailable (no authoritative foam schedule or bounded training-constraint source exists for Recovery yet); they surface as data limitations and can never set, escalate or rescue status.

## 6. Eligibility accounting (calendar facts only; real reliability unknown)

Sleep D0 = 2026-10-02, so at most these prospective nights can exist:

| Briefing (publishes) | Period | Baseline window | Max prospective baseline nights | Outcome |
|---|---|---|---|---|
| Weekly (Sun Oct 18) | Oct 11–17 | Sep 13–Oct 10 | 9 | never eligible → no field |
| **Weekly (Sun Oct 25)** | **Oct 18–24** | **Sep 20–Oct 17** | **16** | **first possible eligible Weekly**: needs ≥14 of Oct 2–17 reliable (≤2 withheld/missing) and ≥5/7 period nights |
| Weekly (Sun Nov 1) | Oct 25–31 | — | — | **superseded by Monthly** (Nov 1 is a Sunday; Monthly precedence) → no Weekly that day |
| Monthly (Sun Nov 1) | October | Sep 3–30 | 0 | never eligible → no field |
| Weekly (Sun Nov 8) | Nov 1–7 | Oct 4–31 | 28 | eligible if data reliable |
| **Monthly (Tue Dec 1)** | **November** | **Oct 4–31** | **28** | first possible eligible Monthly: ≥14 baseline + ≥20 November nights |

(DST ends Nov 1; registry tested at 03:30 PST.) The Oct 25 Weekly is a target, **not guaranteed**: it needs Founder review, a real-data shadow validation, wiring, a Server deploy and the authority record — all separately authorized — before Sun Oct 25 03:00 PT, plus genuinely reliable nights. Without them that Weekly is published exactly as today, with no Recovery field.

## 7. Tests (exact candidate `472513ef`)

Focused Recovery suites — **6 files, 164 tests, all passed**:

| Suite | Tests |
|---|---|
| `RecoveryBriefingAssessmentServiceV1.test.js` (ported + Midweek/excluded-type refusal, Sunday Weekly, availability, mode) | 46 |
| `RecoveryBriefingShadowServiceV1.test.js` (ported + canonical prospective path, no mixing, historical block) | 13 |
| `RecoveryBriefingSleepInputProjectionV1.test.js` (every ledger state/reason, floors, revisions, lookahead, determinism, no values/no V3, Green/Yellow/Red/Not enough data, Oct Weekly/Monthly eligibility) | 34 |
| `RecoveryBriefingPublicationV1.test.js` (authority, gates, envelope, invariant, carry-forward, Native card, composer zero-read/no-throw, reader, JSONB round trip, not wired) | 50 |
| `RecoveryBriefingCadenceIntegration.test.js` (real Weekly/Midweek generators, write funnel, registry collisions, Native read service) | 19 |
| `RecoveryBriefingMonthlySeam.test.js` (real Monthly path + real V3 finalization) | 2 |

Key proofs: Recovery off (no composer, or composer with absent authority) → Weekly publish command byte-identical and zero Sleep reads; Recovery on → only `briefing.recoveryAssessment` differs and V3 inputs (period evidence, PI envelope, operating state, goal/phase) are identical; a Red card changes nothing else; Monthly V3 Confidence assessment identical with/without Recovery; Midweek generator ignores a supplied composer and emits no Recovery marker; Midweek/DEXA/Photo/Daily/event writes with a Recovery field (even null/empty) are refused; existing occurrences are never recomposed; regeneration keeps/never adds; deterministic outputs.

Structural guards (reviewed allowlist widening, same commits): `HealthKitSleepStrategicQuarantine` and `HealthKitStrategicReadBoundary` pass (10 tests) with the projection/reader registered.

Full Server unit suite (`vitest.unit.config.js`, 4 workers):

| Run | Executed | Passed | Failed | Skipped |
|---|---|---|---|---|
| Base `84cc64e4` | 10,139 | 9,840 | 294 (+5 suite-load) | 5 |
| Candidate `472513ef` | 10,303 | 10,004 | 294 (+5 suite-load) | 5 |

The failing set is **identical at the individual test-name level** (299 entries each): 0 new, 0 fixed. All are pre-existing on the identical base; the visible causes are environment-bound (e.g. the private Founder runtime store and fixture files absent from this worktree, which were deliberately not copied). ESLint (`--max-warnings 0`) clean on every touched file; `node --check` clean on all seven new source modules; `git diff --check` clean.

Production Web build (`next build --webpack`, provider build env with the full candidate SHA, `nice 10`): **passed** — compiled successfully, 50/50 static pages, exit 0. Local verification only; nothing was deployed.

Review: no independent review agent was spawned (one-conversation rule). Structured adversarial self-review covered strategic leakage, lookahead/revisions, cadence contamination, JSONB integrity, failure isolation and old-client compatibility; it produced two fixes (fail-closed Weekly existing-occurrence check; JSONB round-trip proof) and the window-binding check. Limit: self-review is not independent review.

## 8. Shadow gate state

- Shadow runner: still **unreachable** from every composition (test-enforced).
- Prospective validation-only input: implemented (canonical days via the projection), **not run on real data**. Running it needs a separately authorized zero-write production read of the bounded `healthKitSleepDays` range plus the two Sleep policy records; nothing in this candidate performs it.
- Publication: authority absent = OFF; composer and reader not wired.

## 9. Native contract / presentation handoff (not implemented)

No Native work exists. Codex owned Xcode overnight (a Release build was running during this lane), so no Native file was patched.

Contract — Native briefing detail response, Weekly and Monthly only:

```
recovery (optional; key ABSENT when not published — render nothing, no placeholder)
  schemaVersion  "recovery_card_v1"
  presentation   "single_recovery_card_v1"
  cadence        "weekly" | "monthly"
  assessmentId   string
  status         { state: "green"|"yellow"|"red"|"unavailable", label: "Green"|"Yellow"|"Red"|"Not enough data" }
  period         { startDate, endDate, expectedNights, observedNights }
  sleep          { averageMinutes, baselineMinutes, deltaFromBaselineMinutes, baselineNights, baselineLookbackNights (28),
                   trend { granularity: "night" (Weekly, Sun–Sat points) | "week" (Monthly weekly aggregates),
                           points: [{ label, totalSleepMinutes }] } }
  commentary     { visible, headline, body }   Green/Not enough data: visible=false
  foamRolling    { state, scheduledOccurrences, completedOccurrences }   currently always "unavailable" → hide row
  dataLimitations [codes]   diagnostic; do not render verbatim
```

Presentation (approved design, no new concepts): exactly one contiguous Dark/Mineral Recovery card; textual status (never color-only); period average vs prior-28-night baseline; the Sleep trend; Green quiet (no commentary); Yellow/Red commentary inline in the same card; Not enough data neutral; foam as a small execution row only when available. Placement only in the Weekly and Monthly briefing screens. Midweek, DEXA, Photo and every other surface must never render a Recovery card, section, placeholder or graph — even if a payload unexpectedly carries the key.

Native acceptance tests to write: decode with and without `recovery`; snapshot per status for Weekly and Monthly; Monthly week-granularity trend; Midweek/DEXA/Photo never render it (defensive test with the key injected); VoiceOver label carries the textual status; base on exact Build 92 `beaf5eff` in a separate Native branch (`claude/native-build93-recovery-weekly-monthly-20261008` was reserved but not created).

## 10. Disk / process safety

- Disk before heavy gates: 25 GiB free at start, 23 GiB before the full suites and the Web build (never below the 20 GiB start preference; floor 12 GiB never approached).
- Heavy gates were deferred until Codex's Xcode Release build exited; Vitest ran with 4 workers; the Web build ran at `nice 10`.
- `node_modules` in this worktree is a symlink to the main checkout (lockfile identical to `84cc64e4`; untracked, ignored).
- After the Web build (22 GiB free), only this worktree's regenerable `.next` (674 MB) was deleted, after recording results. No Xcode archive, simulator, other lane, backup, credential or evidence was touched.

## 11. Next activation / publication blockers (all separately authorized)

1. Founder review of this candidate (and Codex/independent review if wanted).
2. Real-data prospective shadow validation: zero-write production read of canonical Sleep days + policies, reviewing the per-night ledger (especially `ambiguous_revision_continuation` and `revised_after_cutoff` rates under the Oura preference) and Green/Yellow/Red calibration.
3. Wiring diff (not in this candidate): in `providerBriefingCadenceComposition.js`, construct `createRecoverySleepInputReaderV1({ query, ownerUserId })` and `createRecoveryBriefingComposerV1(reader)`, pass `recoveryComposer` to the Weekly and Monthly generators only (never Midweek). Regeneration needs no composer.
4. Server deploy of the reviewed candidate.
5. A guarded runner (does not exist yet) to install the publication authority record (`cadences: ["weekly","monthly"]`, `effectiveFromPeriodStart: 2026-10-18`, `recoveryEffectiveSleepDay: 2026-10-02`, isolation flags, `authorizationRef`), with rollback = disable the record.
6. Native rendering in a tested Native build (until then a stored card is invisible to Native; it stays artifact-bound and would render once Native ships). Web rendering is not implemented either.
7. To target the Oct 25 Weekly, items 1–5 must complete before Sun Oct 25 03:00 PT and ≥14 of the Oct 2–17 nights must actually be reliable.

## 12. Proposed backlog status (for reconciliation; this report does not edit the backlog)

> Recovery Briefing V1 — Weekly + Monthly only. **Server candidate READY FOR FOUNDER REVIEW** (`472513ef` on `claude/build93-recovery-weekly-monthly-server-20261008`, on live `84cc64e4`): Midweek removed from the assessment; non-strategic prospective-only Sleep v3 input projection; disabled-by-default publication authority; optional Weekly/Monthly composer seam (unwired); write-funnel NO-RECOVERY-OUTSIDE-WEEKLY/MONTHLY invariant; optional Native `recovery` card contract. NOT active, NOT deployed, NOT published; no real Sleep read. Remaining: real-data shadow validation, wiring, deploy, authority record, Native one-card rendering. First possible eligible Weekly: Oct 18–24 (Sun Oct 25), not guaranteed; first possible Monthly: November (Dec 1). Keep the item OPEN.

## Result

- production_mutated: false · deployed: false · testflight_uploaded: false
- Real Founder Sleep data accessed: none · historical artifacts touched: none · policy records written: none

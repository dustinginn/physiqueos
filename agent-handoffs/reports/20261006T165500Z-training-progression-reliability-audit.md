# Training Logger progression reliability audit

- Audit date: 2026-10-06 (America/Los_Angeles)
- Audit type: read-only diagnosis; no implementation
- Shipped source authority: `7fce3b9708c063f3c6b58571778c595012b5de6d` (Build 88)
- Task authority: `1e34c8f0edfd587b56a4041302006460ce60207d`
- Founder case: Cable Machine Front Raises
- Canonical exercise ID: `cable_machine_front_raise`
- Build 89 recommendation: **DO NOT BLOCK BUILD 89**
- Production mutation: **none**

## Executive finding

The reported behavior is reproducible in the exact shipped Build 88 progression engine. It is not a four-set volume-calculation problem and there is no source evidence that Native drops a correctly generated recommendation. The primary defect is a split progression authority plus a moving time anchor:

1. The active Training Strategy advertises and stores `successfulSessionsRequired: 2`, `reach_top_of_rep_range`, then `increase_load`.
2. `TrainingLoggerProgressionService` never reads that strategy. It independently requires three identical comparable best-set performances plus an elapsed cadence.
3. The elapsed cadence is measured from the **latest** comparable session (`daysSinceLatest`), not from the beginning of the stable run. A completed weekly repeat therefore resets the clock to seven days every week. With the 12-day gain fallback, a 14-day movement cadence, a 28-day maintenance cadence, or any other cadence longer than the workout interval, the movement can remain `maintain_current_performance` forever while the Founder continues to complete it weekly.
4. The exact same three-session history becomes `progression_opportunity` if the next weekly occurrence is skipped and the Logger is opened 14 days after the last performance. The implementation therefore rewards the absence of a workout and suppresses the prompt after a successful workout.

This is literal expected behavior under the current code, but it is not coherent with the Founder-approved two-successful-session contract. Classify it primarily as **K (split authority / concrete policy defect)** with **C (progression-window anchor bug)** and a secondary **E (best-set/target math does not implement the advertised double-progression rule)**. The evidence does not support F (identity), G (relationship), I (Native drop), or J (stale cache) as the primary cause.

The repository's approved production SQL path is explicitly PC-only. This audit ran in the isolated Mac worktree, so it did not invent a credential path or query production. The current four visible rows, their exact session IDs, current relationship groups, and the effective live calibration branch (movement cadence versus user cadence versus phase fallback) remain unverified. That limitation does **not** affect the source-level root cause or deterministic reproduction; it only prevents stating the exact numeric `effectiveCadenceDays` used by the live request.

## Founder case reconstruction

### Current visible sequence

The task handoff provides the minimum private-data-safe reconstruction below. Values are observational until the approved PC read is run.

| Local date | Canonical/session identity | Visible performance | Relationship / variant | Canonical verification |
| --- | --- | --- | --- | --- |
| 2026-10-06 | session ID not read | 4 × 10 @ 150 lb; 6,000 lb | not live-read; apparently ordinary/standalone | Founder-visible evidence only |
| 2026-09-29 | session ID not read | 4 × 10 @ 150 lb; 6,000 lb | not live-read | Founder-visible evidence only |
| 2026-09-22 | session ID not read | 4 × 10 @ 150 lb; 6,000 lb | not live-read | Founder-visible evidence only |
| approximately 2026-09-15 | session ID not read | reported as the same current load/performance | not live-read | task says at least one additional consecutive session |

Two repository-backed historical facts materially reduce the identity uncertainty:

- The sanitized production Training Library audit dated 2026-09-08 found `cable_machine_front_raise` with eight sessions / eight occurrences / 32 sets from 2026-07-13 through 2026-09-08, zero stored-ID gaps, zero duplicate/orphan findings, no execution variant, and five performance events.
- The production-bound weekly fixture through 2026-09-19 classified Cable Machine Front Raises as plateauing and explicitly said it had been stable for several sessions.

Those facts are consistent with the Founder report and with the moving-anchor reproduction. They are not a substitute for a current bounded SELECT.

### Exercise identity

Build 88 defines four deliberately distinct front-raise identities:

| Canonical ID | Display name | Relevant aliases |
| --- | --- | --- |
| `cable_machine_front_raise` | Cable Machine Front Raises | cable machine front raise; cable machine front raises |
| `barbell_front_raises` | Barbell Front Raises | barbell front raise(s) |
| `dumbbell_front_raise` | Dumbbell Front Raise | dumbbell/db front raise(s) |
| `front_raise` | Front Raise | front raise(s) |

Stored canonical IDs win. Old rows without an ID fall back through exact normalized aliases. The exact Cable Machine labels resolve to `cable_machine_front_raise`; the generic `Front Raises` resolves to the separate `front_raise` identity. The 2026-09-08 production audit found no identity break for Cable Machine Front Raises.

## Actual shipped progression policy

The recommendation authority is Server-side `createTrainingLoggerProgressionRecommendation` in `src/domain/services/TrainingLoggerProgressionService.js`. Native explicitly does not derive progression.

| Concern | Actual Build 88 behavior |
| --- | --- |
| Evidence universe | Active, non-superseded canonical Training evidence loaded owner-scoped by `CoreNavigationReadService.getTrainingLogger` |
| Comparable identity | exact canonical exercise ID + exact execution variant + exact relationship comparison key |
| Performance representation | the single best set per exercise occurrence, ordered load-first and reps-second |
| Set count / volume | ignored by progression policy |
| Minimum to emit guidance | two comparable performances; fewer returns `insufficient_evidence`, which the projection omits |
| Minimum for opportunity | at least three comparable performances and the newest three must have identical best-set load and reps |
| Consecutive meaning | last three comparable occurrences for that exact context; intervening workouts for other exercises do not matter |
| Time gate | `daysBetween(nowDate, latest.date) >= effectiveCadenceDays` |
| Cadence precedence | median movement progression interval after at least three prior movement progression intervals; else median user-wide progression interval after at least four events; else phase fallback |
| Phase fallbacks | gain 12 days; unknown 21; maintenance 28; cut 35 |
| Phase resolution | regex over phase/type/label/name, Goal type/title/strategy; gain regex is checked before maintenance/cut |
| Regression | latest best set below prior -> `recover_prior_performance`, target prior best set |
| Recent progress | latest above prior and younger than cadence -> `on_pace`, projected to Native as Maintain |
| Stable + old enough | `progression_opportunity` |
| Otherwise | `maintain_current_performance` |
| Target with load history | if at least two historical positive load increments <= 50 exist, add the smallest increment and reduce reps by two |
| Target without load history | keep load and add one rep while latest reps are below 20 |
| Rounding / equipment increments | none; no exercise-specific increment table |
| Confidence | low for two comparable sessions, moderate for three/four, high for five+; evidence quality does not otherwise change math |
| Persisted decision code | none; status, action, reason, calibration and history references are generated on read |

### What breaks or changes the apparent streak

- A different best-set load or rep count in any of the newest three comparable occurrences breaks `stableAcrossRecent`.
- A lower newest best set produces Recover immediately.
- Variant and relationship changes do not break one shared streak; they create separate comparison partitions.
- A canonical ID mismatch creates a different exercise partition.
- A skipped date does not break a streak. It increases `daysSinceLatest` and can create an opportunity.
- A partly completed Logger exercise still enters canonical history if it has at least one completed set. Uncompleted sets are removed before commit, and the progression service does not require the planned set count. If a remaining set has the same best load/reps, the occurrence counts the same as a full four-set performance.
- An exercise with zero completed sets is removed before commit and contributes no future progression evidence.
- `Keep previous` and `Use suggestion` are not persisted as progression-policy signals. Only the sets actually completed and committed influence later reads.

### The separate two-session contract

`TrainingProtocolBuilderService` persists:

```text
type: double_progression_confirmed_sessions
successfulSessionsRequired: 2
condition: reach_top_of_rep_range
action: increase_load
```

The Native Training Strategy builder also tells the Founder, “Reach the top of the rep range across two successful sessions before increasing load.” That strategy object simultaneously records a limitation that exercise-level progression evaluation is not active. No code outside the builder reads `successfulSessionsRequired` or `defaultRule`; the Logger service has its own hard-coded policy. The Founder recollection is therefore accurate for the product contract but not for the shipped Logger algorithm.

## Pipeline trace

| Boundary | Input | Output / behavior | Founder-case disposition |
| --- | --- | --- | --- |
| Native durable Finish | draft exercises, completed flags, variants, relationships | `TrainingPerformedSessionProjection` removes uncompleted sets/exercises and relationships with fewer than two performed members | four completed sets survive; one incomplete set would simply disappear |
| Server commit | structured `commitTrainingSession` command | durable canonical Training object plus separately derived performance records | progression later reads the canonical object; performance records are not progression inputs |
| Training Logger read | owner-scoped `canonicalEvidenceObjects` | all Training records except superseded rows | no explicit `quality.status == complete` check beyond canonical durability/supersession |
| Evidence selection | canonical exercise ID, requested variant and relationship | sorted comparable best-set performances | exact Cable ID/ordinary/standalone history remains eligible; set count and volume disappear |
| Decision | comparable series, Goal phase, all-user history, local date | status/action/target/reason/calibration/history references | weekly repeats can hold `daysSinceLatest` below cadence indefinitely |
| Server projection | internal recommendation | `initialProgressionRecommendations`; insufficient results omitted; on-pace becomes Maintain | Maintain is a generated Server recommendation, not a Native heuristic |
| Native decode | recommendation keyed by canonical ID; optional contextual recommendations | catalog exercise recommendation | malformed contextual rows are isolated; standalone lookup uses the standalone recommendation |
| Draft creation | latest Native comparable performance + Server recommendation | previous sets prefilled; `progressionChoice = previous` by default | recommendation remains present; previous is initially selected |
| Logger presentation | recommendation on draft exercise | eyebrow, prescription, Use suggestion, Keep previous | `Maintain current performance` is literal Server output; no rewrite/drop was found |
| Choice behavior | user taps Use/Keep | incomplete draft rows are refilled; completed rows are preserved | choice flag is local-only and does not enter the canonical commit |
| Cache/reload | cached `training-logger` read | default 90-second cache; training/workout command invalidates it; view model refetches after durable Finish | no multi-week stale-cache mechanism found |

The Server makes the decision from the full active canonical collection. Only the Native history projection is capped at the newest 120 sessions, so the displayed previous-performance window does not truncate the Server's decision evidence in this case.

## Deterministic reproduction using the real decision path

The exact Build 88 files were exported to `/tmp/physiqueos-progression-audit-7fce3b97` and executed with Node. Product source was not changed. The primary fixture used ordinary, standalone `cable_machine_front_raise` sessions, four sets each, all 10 @ 150 lb, one week apart, with Goal title `Build Lean Mass`.

“After session” below means the recommendation when opening the next weekly Logger; the current workout date is excluded from evidence by design.

| Prior sessions available | Logger date | Result | Prescription / reason code |
| --- | --- | --- | --- |
| Session 1: Sep 15 | Sep 22 | `insufficient_evidence` | no projected Logger recommendation; `manual_or_previous` |
| Sessions 1–2: Sep 15, 22 | Sep 29 | `maintain_current_performance` | 150 lb × 10; `maintain` |
| Sessions 1–3: Sep 15, 22, 29 | Oct 6 | `maintain_current_performance` | 150 lb × 10; 7 days < gain fallback 12 |
| Sessions 1–4: Sep 15, 22, 29, Oct 6 | Oct 13 | `maintain_current_performance` | 150 lb × 10; latest session resets age to 7 again |

Boundary results from the same real service:

| Variant | Result |
| --- | --- |
| Reopen 12 days after Sep 29 without another session | `progression_opportunity`, 150 lb × 11, `use_suggestion` |
| Skip the Oct 6 occurrence and open Oct 13 | `progression_opportunity`, 150 lb × 11 |
| Supply three prior weekly load increases (movement cadence becomes 7 days) | `progression_opportunity`, 160 lb × 8 |
| Commit only three of four planned sets, all 10 @ 150 | same Maintain result as four sets |
| Latest best set falls from 10 to 9 reps | `recover_prior_performance`, restore 150 × 10 |
| Request standalone against three exact superset occurrences | `insufficient_evidence` |
| Request the matching exact superset partner context | normal three-session Maintain result |
| Remove stored ID but retain exact Cable Machine Front Raises alias | same canonical Maintain result |
| Store distinct `front_raise` identity | no Cable Machine comparables; insufficient |

This proves the inversion: continuing the weekly workout suppresses the opportunity; skipping it allows the clock to mature.

## Cross-exercise sanity controls

Because the approved PC production-read runner was unavailable, this audit did not claim a live production sample. It ran the small source-backed controls already represented by Build 88 tests:

| Exercise fixture | History | Phase/date | Shipped result | Why |
| --- | --- | --- | --- | --- |
| Pull-Ups | Aug 1/8/15, 25 lb × 6 | gain, Aug 29 | Progression opportunity, 25 lb × 7 | three stable sessions and 14 days since latest >= 12 |
| Spider Curls | Jul 5/12/18, 35 lb × 12 | maintenance, Aug 10 | Maintain, 35 lb × 12 | three stable sessions but 23 days since latest < 28 |
| Cable Machine Front Raises | Sep 15/22/29, 150 lb × 10 | gain, Oct 6 | Maintain, 150 lb × 10 | three stable sessions but only 7 days since latest |

The engine can produce both labels correctly according to its own code. The defect is the suitability of the eligibility clock, not a universal failure to project labels.

## Root cause assessment against requested categories

| Category | Finding |
| --- | --- |
| A. Expected under actual policy | **Yes, literally.** Weekly stable sessions remain Maintain when effective cadence exceeds seven days. |
| B. Eligibility/history recognition bug | Secondary risk only; current production rows were not queried. Historical identity evidence is clean. |
| C. Ordering/window bug | **Yes: semantic time-window bug.** The clock anchors to latest performance instead of plateau/run start. Date sort itself is correct for distinct dates. |
| D. Canonical/display mismatch | No source evidence. Current live rows remain unverified. |
| E. Load/reps/volume math bug | **Secondary.** Policy uses one best set, ignores full-set success/volume, and does not implement top-of-range two-session double progression or equipment rounding. |
| F. Identity/alias mismatch | No evidence through the Sep 8 production audit; exact aliases resolve correctly. |
| G. Relationship classification | No evidence for this movement; exact context partitioning works as coded. Live current groups remain unverified. |
| H. Performance-record interaction | No. Progression recomputes from canonical sessions and does not read performance records. |
| I. Generated then dropped before UI | No. Server projection and Native presentation preserve the recommendation. |
| J. Stale/cache/reconciliation | No multi-week mechanism found. Cache is bounded and invalidated after training writes. |
| K. Other concrete cause | **Primary: split authority.** Founder-approved strategy and Logger algorithm are independent. |

## Affected scope and severity

- Severity: **high coaching-reliability defect, non-corrupting**.
- Scope: any exercise whose actual workout interval is shorter than its movement-specific, user-wide, or phase fallback cadence, especially weekly movements with a cadence > 7 days.
- Movement-specific cadence takes precedence, so the defect can appear exercise-specific even when other exercises progress correctly.
- No canonical workout, load, rep, volume, performance record, or relationship is changed by the defect.
- The incorrect output is regenerated on every read; there is no durable recommendation record to repair.

## Build 89 comparison and blocking decision

Exact pins inspected:

- Claude A: `f3579d87b2f111bd6da0e78ff928e7492efffc00`
- Claude B: `156808fae50fc99ddbd6e1f0e3e90abec69ed26b`
- Codex small fixes: `5b79118f84ac15ac190e0d73e13e71606c2f6d2f`

Claude A changes `ProductionDailyDriverAPI.swift` only for Priority action routing in the relevant shared file. Claude B has no progression-path intersection. The Codex small-fixes lane changes the **category-level Suggested Today selection control** and Logger numeric typography; it does not change exercise progression calculation, progression recommendation mapping, or the progression-guidance controls.

**Decision: DO NOT BLOCK BUILD 89.**

The progression defect predates Build 89, Build 89 does not worsen or corrupt it, and the accepted changes do not alter decision semantics. Fix it through the next Server-safe lane (and include Native only if copy/presentation is intentionally revised).

## Recommended narrow fix plan

1. Establish one progression authority. Prefer the active Operating Plan's `trainingStrategy.progression.defaultRule`; if that rule is not ready to be executable, stop presenting it as the Logger's active rule.
2. Correct the time anchor in `TrainingLoggerProgressionService`: calculate the stable run explicitly and measure plateau age from the oldest qualifying performance in that run, not from the latest performance. Do not let a successful repeated session reset eligibility.
3. Make qualifying-session semantics explicit. For the advertised rule, require the configured number of successful sessions and define whether success means every completed working set reaches the top of a known rep range. Do not silently use one best set as a proxy.
4. Keep relationship and variant partitioning; it prevents unlike contexts from being compared.
5. Keep the recommendation Server-owned. A Native-only heuristic would create a third authority.
6. Prefer an explicit exercise/equipment increment policy and rounding rule. Until that exists, a rep-first target is safer than inventing arbitrary load increments from historical noise.

The smallest safe immediate correction is item 2 plus regression coverage. Fully honoring the two-session contract requires item 1 and a real rep-range/success definition.

## Regression-test plan

Server/domain tests:

- four weekly identical 4 × 10 @ 150 sessions do not remain Maintain forever;
- completing the next weekly session cannot delay an opportunity that would appear after skipping it;
- stable-run age anchors to the first qualifying stable occurrence;
- configured `successfulSessionsRequired` is consumed, or the test explicitly documents why it is not active;
- one incomplete planned set is either deliberately disqualifying or deliberately accepted; no accidental best-set-only behavior;
- changed reps/load resets or changes the run with explicit reason codes;
- exact ID, alias fallback, variant, standalone, and exact superset partner partitions;
- movement cadence, user cadence, and phase fallback precedence;
- explicit phase wins over conflicting Goal-title keywords;
- target increment and rounding for cable/machine/free-weight/bodyweight cases;
- recommendations exclude same-day current work and handle multiple same-date sessions deterministically.

Server-to-Native contract tests:

- `insufficient_evidence` omission;
- on-pace-to-Maintain mapping is intentional;
- Maintain and Opportunity target fields/labels survive decode;
- malformed contextual entries do not remove valid standalone guidance;
- training commit invalidates `training-logger` cache and the completion refresh receives the new recommendation.

Native tests:

- Maintain versus Progression Opportunity presentation;
- Use suggestion changes only incomplete rows;
- Keep previous restores the exact prior set shape;
- neither local choice flag is represented as canonical policy evidence;
- standalone/superset/variant changes refresh previous performance and the matching Server recommendation without cross-context fallback.

## Data migration / deployment assessment

- Historical data repair: **not indicated** by the evidence available.
- Migration/backfill: **none required** for the moving-anchor or authority fix; recommendations are generated on read.
- Production read follow-up: one approved PC-only, owner-scoped, repeatable-read audit should capture the exact current Cable rows, relationship groups, quality/supersession state, and compute the three cadence candidates. It should also sample one live Opportunity and one live Maintain movement. This closes the remaining calibration uncertainty without changing data.
- Server deploy: **required** for the decision fix.
- Native-only next-build fix: **insufficient**. Native can change copy/presentation, but it must not reimplement progression math.
- Build bump/TestFlight: not part of this audit and not performed.

## Exact relevant files and functions

Build 88 (`7fce3b97…`):

- `src/domain/services/TrainingLoggerProgressionService.js`
  - `createTrainingLoggerProgressionRecommendation`
  - `listComparablePerformances`
  - `inferProgressionCadenceDays`
  - `inferUserProgressionCadenceDays`
  - `deriveEvidenceSupportedTarget`
- `src/domain/services/TrainingProtocolBuilderService.js`
  - `trainingStrategy.progression.defaultRule`
- `src/domain/models/trainingExerciseIdentity.js`
  - `cable_machine_front_raise`
  - `resolveTrainingExerciseOccurrenceIdentity`
- `src/domain/models/trainingExerciseRelationship.js`
  - `deriveTrainingExerciseRelationshipContext`
  - `getTrainingExerciseRelationshipComparisonKey`
- `src/application/core/CoreNavigationReadService.js`
  - `getTrainingLogger`
  - `projectTrainingHistorySession`
  - `projectTrainingLoggerRecommendation`
- `src/application/native/NativeProductionContractService.js`
  - `training-logger` -> `readers.core.getTrainingLogger()`
- `ios/PhysiqueOS/Contracts/TrainingPerformedSessionProjection.swift`
  - `make(from:)`
- `ios/PhysiqueOS/Networking/TrainingWriteAPI.swift`
  - `ProductionTrainingWriteAPI.commit`
- `ios/PhysiqueOS/Networking/ProductionDailyDriverAPI.swift`
  - `ProductionTrainingLoggerAPI.fetchConfiguration`
  - `history(for:defaultLoadType:in:)`
- `ios/PhysiqueOS/Contracts/TrainingLoggerReadModel.swift`
  - `TrainingLoggerCatalogExercise.progressionRecommendation(variant:relationship:)`
  - `addExercise`
  - `applyProgressionSuggestion`
  - `keepPreviousPerformance`
  - `refreshPreviousPerformance`
- `ios/PhysiqueOS/Presentation/TrainingLogger/TrainingLoggerView.swift`
  - `progressionGuidance`
- `ios/PhysiqueOS/Presentation/TrainingLogger/TrainingLoggerViewModel.swift`
  - `load`
  - `commitSubmission`
- `ios/PhysiqueOS/Networking/FounderServerAPI.swift`
  - `readResource`
  - `resourcesAffected(by:)`

## Commits inspected

- Task: `1e34c8f0edfd587b56a4041302006460ce60207d`
- Shipped Build 88: `7fce3b9708c063f3c6b58571778c595012b5de6d`
- Progression service introduction: `d717ae1e25392959066e36b2dfcaa22edbe8f316`
- Native load-semantics alignment: `c4ee580952f0c71cc5d2b47033e0bf08c6ad4749`
- Build 89 Claude A: `f3579d87b2f111bd6da0e78ff928e7492efffc00`
- Build 89 Claude B: `156808fae50fc99ddbd6e1f0e3e90abec69ed26b`
- Build 89 Codex small fixes: `5b79118f84ac15ac190e0d73e13e71606c2f6d2f`
- Historical identity audit: `0259133ffd0b9638b915154c4226d884aded3e96`

## Read-only methods and known uncertainties

Methods used:

- fetched exact Git commit objects without merging;
- inspected source and tests with `git show`, `git grep`, `git diff`, and history queries;
- inspected the sanitized 2026-09-08 production identity ledger and production-bound September briefing fixtures already committed to the repository;
- executed the exact Build 88 progression service from a temporary Git archive with deterministic local fixtures;
- compared the three pinned Build 89 candidates read-only;
- performed no production writes, Server changes, merges, rebases, build bumps, or TestFlight actions.

Production SQL was not executed. `agent-handoffs/PRODUCTION_READONLY_ACCESS.md` says the approved runner and saved context are on the Founder's PC and explicitly forbids inventing a Mac credential path. The exact remaining read should use `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, verify `transaction_read_only = on`, run bounded owner-scoped SELECTs only, sanitize output, and `ROLLBACK`.

Remaining uncertainties requiring that approved read:

- exact current session/workout IDs and timestamps for the visible four sessions;
- exact current relationship groups and execution variants;
- exact per-set canonical rows and quality/finalization fields;
- whether live `effectiveCadenceDays` came from movement, user-wide, or 12-day gain fallback;
- exact live next target (for example 150 × 11 versus a learned load increment);
- a live production control sample of one correct Opportunity and one correct Maintain recommendation.

These uncertainties should be closed before implementation, but they do not change the Build 89 decision or the proven moving-anchor and split-authority defects.

## Stop statement

Audit/report only. No fix was implemented. No product source, Server, canonical data, build number, integration lane, or TestFlight state was changed.

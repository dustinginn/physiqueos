# Protocol State Diagnostic — 2026-07-23

Classification: **High Risk — diagnostic only**

This report reads `private/founder/runtime-store.json` directly. It does not call application routes, repositories, transition services, briefing generators, or persistence methods. No reconciliation described below has been executed.

## Executive finding

The completed Visible Abs → active Build Lean Mass transition recorded a coherent set of review dispositions, then materialized 15 new protocol records in `planned` state. It did **not** retire, supersede, or relink the nine legacy active protocol records, and it did not replace the legacy Energy Strategy or Nutrition Context read-model sources.

The result is two overlapping graphs:

- the operational graph still selected by Today and Operating Plan: legacy active records and commitments, principally linked to Visible Abs;
- the intended Build Lean Mass graph: 15 planned transition records linked to the new goal but not selected as canonical.

The old protocols were therefore not closed automatically. `update` was persisted as a planned replacement while the original remained active. `keep` frequently produced a planned copy while the original remained active and retained its old goal relationship. The activation contract expresses intended disposition, but the production activation result stops before canonical reconciliation.

## Safety baseline

| Check | Before diagnostic |
| --- | --- |
| Runtime SHA-256 | `DA47BAA8A62B5289756740C8211A4321E571F3648015497BC4D8A318CB742E9A` |
| Runtime size | 8,889,829 bytes |
| Store revision | 4 |
| Goals | 4 total: 1 completed, 3 active |
| Protocols | 24 total: 9 active, 15 planned |
| Execution items | 15 active |
| Reminders | 15 |
| Transition drafts | 2 goal, 2 protocol |
| Canonical evidence | 179 |
| Briefings | 28 |

The final verification must match this baseline byte-for-byte. Existing unrelated worktree changes were present before this diagnostic and were not modified.

## Transition provenance

| Field | Value |
| --- | --- |
| Applied protocol transition draft | `protocol_transition_goal_transition_live_goal_visible_abs_at_rest_6353e12e1ef8fbc3` |
| Source goal | `goal_visible_abs_at_rest` |
| Target goal | `goal_transition_live_goal_visible_abs_at_rest_6353e12e1ef8fbc3_objective_lean_mass` |
| Activation plan fingerprint | `800bf770b48d39f42c9d1f4977a95c788f5f56301f88cc1df4e4aacbc4a0d410` |
| Draft fingerprint at consumption | `b1e08c0132323c9e9205e7038bac816571af718f9873e7437770e70c763a18eb` |
| Commit ID | `83ba0ea7-df91-452c-9156-4d367cc6ade5` |

The records do not expose a consistent parent/superseded pointer or transition provenance field. Planned-record ancestry is recoverable from the generated record ID and the applied review source ID, but that is weaker than an explicit canonical link.

## Authoritative inventory

| Domain | Legacy operational state | Build Lean Mass transition state | Current conflict |
| --- | --- | --- | --- |
| Energy | `energy_strategy_founder_cut`, active, Visible Abs, Moderate Cut | one planned maintenance-calibration record | Operating Plan reads the legacy Energy Strategy singleton |
| Nutrition | `protocol_nutrition_founder_cut`, active, Visible Abs | one planned 167 g protein record | legacy protocol and 1,900–2,200 Nutrition Context remain authoritative |
| Activity | `protocol_activity_founder_cut`, active; active version still belongs to the cut | one planned update | active legacy version remains selected |
| Training | `protocol_training_founder_maintenance`, active, Visible Abs | one planned copy despite `keep` | keep did not reuse/relink the original |
| Recovery | no canonical protocol; Foam Rolling is an active execution item/reminder | one planned recovery record | commitment and planned protocol are disconnected |
| Coaching updates | existing briefing cadence/history remains operational | one planned briefing update | planned cadence is not canonical; historical briefings remain intact |
| Peptides | Retatrutide and Tesamorelin active and linked to old goals | two planned copies | originals drive reminders; copies are inert |
| Supplements | Tongkat Ali, Fadogia Agrestis, Multivitamin, Electrolytes active | four planned copies | Operating Plan counts all eight because it filters category without status |
| Weight | active legacy execution commitment | one planned record | parallel commitment and planned protocol |
| Photos | active legacy execution commitment | one planned update | parallel commitment and planned protocol |
| DEXA | active legacy execution commitment | one planned record despite `keep` | parallel commitment and planned protocol |

All 15 planned records are linked to Build Lean Mass. None is active. The nine active protocol records are Retatrutide, Tesamorelin, Tongkat Ali, Fadogia Agrestis, Multivitamin, Electrolytes, cut Activity, maintenance Training, and cut Nutrition.

### Active execution inventory

Fifteen execution items are active:

- six legacy Visible Abs commitments: morning weigh-in, Foam Rolling, Retatrutide, Tesamorelin, Progress Photos, and DEXA;
- nine Build Lean Mass commitments: weight, nutrition, training, activity, DEXA, photos, energy weekly, recovery daily, and briefings.

There is no persisted “Today priority occurrence” collection to count safely. Today occurrences are derived at read time. The persisted source baseline is 15 reminders and 15 active execution items.

## Disposition versus actual outcome

| Domain/source | Reviewed disposition | Persisted outcome | Intended authoritative result for a future patch | Risk |
| --- | --- | --- | --- | --- |
| `virtual_energy` | update | planned replacement created; cut Energy Strategy remains active | activate maintenance strategy and retire/supersede the cut link | high |
| cut Nutrition | update | planned replacement created; original remains active | activate replacement, supersede original, update Nutrition Context atomically | high |
| maintenance Training | keep | planned copy created; original remains active and stale-linked | retain and relink original; retire planned copy | medium |
| cut Activity | update | planned replacement created; original remains active | activate replacement and supersede original/version | high |
| `virtual_recovery` | keep | planned record created; Foam commitment remains detached | establish one canonical recovery record and merge/relink commitment | high |
| `virtual_weight` | keep | planned record plus legacy commitment | retain one canonical commitment and relink/merge | medium |
| `virtual_photos` | update | planned record plus legacy commitment | activate updated cadence and merge the legacy commitment | medium |
| `virtual_dexa` | keep | planned record plus legacy commitment | retain canonical cadence and relink; do not duplicate | medium |
| `virtual_briefings` | update | planned record; existing schedules/history unchanged | activate new cadence without rewriting history | high |
| Retatrutide | keep | planned copy created; original active and old-linked | retain/relink original and dose history; retire planned copy | high |
| Tesamorelin | keep | planned copy created; original active and old-linked | retain/relink original; retire planned copy | high |
| four supplements | keep | four planned copies; four originals active | retain/relink originals; retire planned copies | medium |

No historical evidence, completed-goal data, DEXA, photos, briefing artifacts, or goal IDs should be rewritten by that future reconciliation.

## Retatrutide source tracing

There is **one**, not two, active Retatrutide protocol:

- active: `protocol_retatrutide_founder`;
- planned copy: the generated transition record whose ID contains `protocol_retatrutide_founder`;
- active reminder: `reminder_retatrutide`;
- date-effective dose-change occurrence: `dose-change-protocol_retatrutide_founder-2026-07-23`.

The duplicate Today presentation is emitted from the same active legacy protocol through two paths:

1. its normal reminder occurrence;
2. `DailyFocusService`’s date-effective dose-change occurrence for the July 23 taper.

The source retains Visible Abs relationships and has no Build Lean Mass relationship, which explains the incorrect goal detail. Its dose field is 2 mg and its preserved history contains the taper sequence: 1.5 mg on July 23, 1 mg on July 30, and 0.5 mg on August 6. The authoritative future candidate is the original record, relinked to Build Lean Mass with dose history intact; the planned copy should not become a second active regimen.

Tesamorelin has the same active-original/planned-copy topology, without the date-effective dose-change duplication.

## Energy, Nutrition, and Operating Plan

Operating Plan does not select the planned transition graph:

- Energy reads `energy_strategy_founder_cut`, goal `goal_visible_abs_at_rest`, so it renders “Moderate Cut.”
- Nutrition reads `nutrition_context_founder_alpha`, still 1,900–2,200 kcal.
- The planned maintenance-calibration and 167 g protein records are not active canonical inputs.
- Supplements are filtered by category without a status predicate, so four active originals plus four planned copies can be counted as eight.
- The execution section renders all 15 active execution items without goal-lifecycle or supersession filtering.

These are read-model selection defects caused by incomplete reconciliation, not missing transition intent.

## Foam Rolling

Foam Rolling is not a protocol record. It is:

- active execution item `execution_foam_roll`;
- active reminder `reminder_foam_roll_daily`;
- linked to the completed Visible Abs goal;
- represented as recovery, but without a protocol ID.

It can disappear from active-goal-filtered Home surfaces while remaining visible wherever all active execution items are rendered. A future patch must decide explicitly whether it is a Build Lean Mass recovery commitment, historical-only, or retired; this diagnostic does not make that product decision.

## Downstream impact

- **Today/Home:** stale reminders can be filtered inconsistently by goal linkage; Retatrutide passes through an unscoped reminder and then exposes the stale protocol goal. Its dose-change path creates a second occurrence.
- **Operating Plan:** legacy Energy/Nutrition/Activity/Training inputs remain authoritative; planned supplements are incorrectly included; all active executions are displayed.
- **Reminder counts:** reminders remain attached to originals, not planned replacements.
- **Goal detail:** legacy protocols can continue to report Visible Abs after completion.
- **History:** completed-goal evidence and briefing artifacts remain intact. The defect is selection and lifecycle state, not historical loss.

## Proposed reconciliation matrix — not executed

The next patch should be a separately reviewed high-risk atomic migration:

1. acquire the current revision and verify transition/draft fingerprints;
2. construct an explicit per-domain plan using the matrix above;
3. reuse and relink `keep` records rather than cloning them;
4. activate `update` replacements and mark their predecessors superseded/retired with explicit provenance;
5. merge execution/reminder duplicates and preserve occurrence history;
6. update Energy Strategy and Nutrition Context canonical pointers in the same transaction;
7. require Operating Plan and Today to filter/select canonical active records;
8. verify no historical artifact or evidence mutation;
9. commit once, or roll back the entire reconciliation.

Ambiguous item requiring product approval: Foam Rolling’s future disposition.

## Diagnostic tests

`ProtocolStateDiagnosticService` is a pure read-only projection. Its production-backed tests assert:

- the file is byte-identical before and after projection;
- 24/9/15 protocol counts and 15 active commitments;
- transition disposition versus persisted outcome;
- single-active-protocol Retatrutide source tracing;
- legacy Operating Plan inputs;
- Foam Rolling’s commitment-without-protocol state;
- active-legacy plus planned-transition overlaps.

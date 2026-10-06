# Training progression corrected production shadow — DEPLOY recommendation

- Generated: 2026-10-06 16:27 PDT / 2026-10-06T23:27:00Z
- Task authority: `24ef0ab87bdbd4c91075ca3b89e90d85b894dc8e`
- Prior zero-row report: `5d3bc9a4d1d9e082cd710b63038230199750d252`
- Production-read tooling: `d789ce2770eda2f9bdb13a48bbc572901f2c61e2`
- Current production Server: `b7eb1e397f0238df9ae904fd182ddbb51602e8d8`
- Progression candidate: `999a225a38ced9ddb16a65bbe840896472265468`
- Recommendation: **DEPLOY** — recommendation only; Founder deployment authorization still required
- Production deployment: **NO**
- Production mutation: **NO**
- Native Build 89 / Build 90 touched: **NO**

## Executive verdict

The bounded structural discovery found the precise reason the previous query returned zero rows: production canonical Training records do not populate `occurrence_date`. All 80 sampled Training rows had `occurrence_date = null`, while all 80 carried the Logger-authoritative timestamp at nested `payload.observed_at`, mirrored by wrapper `lastObservedAt`, and had a populated table `observed_at`. Requiring `occurrence_date BETWEEN ...` therefore excluded the entire Training history.

The discovery established one uniform, production-consistent record shape and an unambiguous corrected predicate. The authorized corrected read then loaded only active/non-superseded canonical Training wrappers containing one of the three predeclared canonical exercise IDs, capped at 120 rows and ordered by canonical source authority. It returned 49 target-bearing records and produced exact-context shadows for Cable Machine Front Raises, Pull-Ups, and Spider Curls.

Cable Machine Front Raises is **progression-eligible now** under the real active Training Strategy and candidate `999a225a`: 5 qualifying successes versus 2 required, first qualifying success 2026-09-08, 28 exposure days versus the 14-day Founder floor, ordinary variant, standalone relationship, both gates true. Two compatible historical +10 lb increments support the evidence-derived target **160 lb × 8**. No load was invented.

The controls are coherent: Spider Curls remains Maintain because its 13-day exposure is one day short despite satisfying the count gate; Pull-Ups becomes a progression opportunity after 2 qualifying sessions and 16 days, but correctly emits `consider_progression` with no target because no safe compatible load increment is proven.

Combined with the existing 128/128 focused gate, 167/167 Phase 6 Training gate, clean three-commit fast-forward, no migration/backfill, and backward-compatible Native contract, the recommendation is **DEPLOY `999a225a` after separate Founder authorization**. This task did not deploy it.

## 1. Production authority and safety

The production authority was freshly verified before discovery and remained exact after both authorized reads.

| Authority | Result |
| --- | --- |
| App | `bf57cf56-48cc-4cd6-90e4-a23ee5381741` / `physiqueos-foundation-staging` |
| Active deployment | `6fa4e887-8849-450b-b068-5bdb11b90009` |
| Deployment phase | ACTIVE, 9/9 successful steps |
| In-progress deployment | none |
| Web / worker source | exact `b7eb1e397f0238df9ae904fd182ddbb51602e8d8` |
| Health / build | `ok` / `physiqueos-b7eb1e39-20261005` |
| Approved context | `physiqueos-final-cutover-config` only |
| Operational tooling | byte-identical to `d789ce27`; later branch commits are report-only |

Both production calls used one owner-scoped `REPEATABLE READ READ ONLY` transaction, required `transaction_read_only=on`, accepted SELECT-only parameterized SQL, enforced hard row/output bounds, rolled back explicitly, emitted one sanitized canonical frame and success marker, exited zero, and passed the post-read deployment/source/build check. No raw record, owner identifier, note/free text, credential, database URL, or certificate was returned.

## 2. Canonical Training evidence shape

Discovery sampled the newest 80 owner-scoped Training records in `physiqueos.canonical_evidence_records` / `canonicalEvidenceObjects`. It emitted structural counts only.

| Concern | Discovered production shape |
| --- | --- |
| Wrapper/session layout | canonical wrapper object with the Training session nested at `record.payload` |
| Evidence type | `training` present on both wrapper and nested session for 80/80 rows |
| Logger date | nested `session.observed_at` present and parseable for 80/80; wrapper `lastObservedAt` also present |
| Table `observed_at` | populated for 80/80 |
| Table `occurrence_date` | populated for **0/80** |
| Exercises | nested `session.exercises` array for 80/80 |
| Canonical identity | direct `exercise.canonicalExerciseId` string for 134/134 sampled exercises |
| Snapshot/reference indirection | none observed; no `exerciseReference`, snapshot ID, alternate snake-case ID, or linked identity required |
| Names | present, but canonical ID is the stable predicate |
| Execution variant | no variant field on 134/134 sampled exercises; production interpretation is `ordinary` |
| Relationships | session-level `exerciseRelationshipGroups`; two sampled groups, both `superset`, with member occurrence IDs |
| Lifecycle | wrapper `quality.status`: 77 active, 3 superseded; all 3 superseded rows also carried `supersededBy` |
| Table status | absent for 80/80; not lifecycle authority |
| Completed working sets | persisted set arrays; no `completed` or `isCompleted` booleans in 531 sampled sets |
| Legacy shape | no materially different wrapper/session/exercise identity shape in the bounded sample |

Target recognition in the 80-row discovery sample was direct and redundant with normalized names:

| Canonical exercise | Direct ID occurrences | Matching name occurrences | Relationship-group occurrences |
| --- | ---: | ---: | ---: |
| `cable_machine_front_raise` | 7 | 7 | 0 |
| `pull_up` | 6 | 6 | 0 |
| `spider_curl` | 8 | 8 | 0 |

### Why the prior predicate returned zero

The prior query required `occurrence_date BETWEEN 2026-06-01 AND 2026-10-06`. Production Training wrappers have no top-level `occurrenceDate`, `localDate`, `date`, or `scheduledDate`, so the database metadata projector leaves `occurrence_date` null. The actual Logger reader loads canonical payloads and sorts/projects with nested `session.observed_at ?? record.lastObservedAt`; it does not require `occurrence_date`.

The JSON text/canonical-name portion of the prior predicate was not the blocker. The discovery directly found the requested canonical IDs. The date-column predicate alone was sufficient to reduce the result to zero.

## 3. Corrected bounded predicate

The corrected read matched production application semantics:

1. exact owner and collection `canonicalEvidenceObjects`;
2. evidence type `training` on canonical wrapper or nested session;
3. wrapper `quality.status != superseded` and no `quality.supersededBy`;
4. a nested exercise whose direct `canonicalExerciseId` is one of exactly:
   - `cable_machine_front_raise`;
   - `pull_up`;
   - `spider_curl`;
5. canonical `source_ordinal` ordering;
6. hard 120-row cap;
7. no `occurrence_date` predicate;
8. nested `observed_at` used only after retrieval for the exact progression calculation;
9. exact variant and relationship comparison partitions retained;
10. only sanitized date/load/reps/set-profile/context values emitted after rollback.

The corrected query returned 49 target-bearing records. Exact latest-context comparison produced 12 Cable occurrences, 12 Pull-Up occurrences, and 21 Spider Curl occurrences; rows belonging to a different comparison partition were not allowed to leak into a recommendation.

## 4. Real active Training Strategy

Exactly one active Training authority was verified.

| Field | Production value |
| --- | --- |
| Protocol | `protocol_training_founder_maintenance` |
| Current version | `protocol_training_founder_maintenance_v2` |
| Version effective date | 2026-07-11 |
| Phase / objective | Maintenance / recomposition |
| Rule type | `double_progression_confirmed_sessions` |
| Condition | `reach_top_of_rep_range` |
| Action | `increase_load` |
| Successful sessions required | **2** |
| Configured minimum exposure | absent |
| Exercise overrides | 0 |

Candidate `999a225a` correctly resolves the absent minimum to the Founder-locked legacy compatibility floor of **14 days**. Because the persisted strategy has no exercise-level rep-range maximum, qualification uses the candidate's conservative transitional rule: an exact repeated complete persisted set profile at the current load/context.

## 5. Cable Machine Front Raises shadow

### Exact evidence and gates

| Field | Result |
| --- | --- |
| Matched exact-context occurrences | **12** |
| Canonical exercise | `cable_machine_front_raise` |
| Variant | `ordinary` |
| Relationship | `standalone` |
| Current load/type/unit | **150 lb / external load** |
| Current-load run | **7 occurrences**, 2026-08-25 through 2026-10-06 |
| Current qualifying profile | **4 × 10 @ 150 lb** |
| Qualifying successful sessions | **5**: 2026-09-08, 09-15, 09-22, 09-29, 10-06 |
| Configured requirement | **2** |
| First qualifying success / exposure anchor | **2026-09-08** |
| Exposure days as of 2026-10-06 | **28** |
| Candidate minimum exposure | **14 days** |
| Count gate | **PASS** |
| Exposure gate | **PASS** |
| Progression eligible now | **YES** |

The two prior current-load occurrences on 2026-08-25 and 2026-09-01 were 4 × 9 @ 150 lb. They are part of the seven-occurrence current-load run but not the current exact qualifying set-profile run. This is why the candidate reports five, not seven, qualifying successes.

### Current versus candidate

| Calculation | Current `b7eb1e39` | Candidate `999a225a` |
| --- | --- | --- |
| State | `progression_opportunity` | `progression_opportunity` |
| Action | `use_suggestion` | `use_suggestion` |
| Eligibility authority | inferred 7-day movement cadence; latest prior session because same-day excluded | real strategy: 5 ≥ 2 and 28 ≥ 14 from first qualifying success |
| Suggested target | 160 lb × 8 | 160 lb × 8 |
| Target provenance | historical load increments | `historical_minimum_load_increment` |

The current production engine happens to reach the same recommendation now because the movement cadence has calibrated to seven days and it excludes the same-day 2026-10-06 session. The candidate reaches it for the durable, strategy-owned reasons the Founder approved; completing another successful session no longer resets the exposure clock.

### Safe target provenance

The exact compatible standalone/ordinary history contains at least two same-type, same-unit positive load increments:

- 130 lb → 140 lb: +10 lb;
- 140 lb → 150 lb: +10 lb.

The candidate selects the minimum proven compatible increment (+10 lb), producing 160 lb. With no stored rep-range minimum, its transitional target rule reduces the latest 10 reps by two to 8. This is evidence-derived and bounded; no equipment increment or load was invented.

## 6. Bounded controls

### Maintain control — Spider Curls

| Field | Result |
| --- | --- |
| Context | `spider_curl` / ordinary / standalone |
| Exact-context occurrences | 21 |
| Current run | 3 occurrences at 50 lb, 2026-09-23 through 2026-10-03 |
| Qualifying profile | 4 × 11 @ 50 lb |
| Count | 3 ≥ 2 — PASS |
| Exposure | 13 days < 14 — **PENDING** |
| Current state/action | Maintain / maintain |
| Candidate state/action | Maintain / maintain |
| Candidate reason | `minimum_exposure_gate_pending` |
| Target | not eligible; none |

This proves the candidate does not turn every repeated profile into an opportunity. It holds the exact one-day-short boundary.

### Progression-Opportunity control — Pull-Ups

| Field | Result |
| --- | --- |
| Context | `pull_up` / ordinary / standalone |
| Exact-context occurrences | 12 |
| Current run | 6 occurrences at 25 lb |
| Qualifying profile | 4 × 7 @ 25 lb |
| Qualifying count | 2 ≥ 2 — PASS |
| First success | 2026-09-20 |
| Exposure | 16 days ≥ 14 — PASS |
| Current state/action | Maintain / maintain |
| Candidate state/action | Progression opportunity / `consider_progression` |
| Target | **unavailable** — no evidence-supported compatible load increment |

The control validates the required no-invention behavior: candidate eligibility can be true while target selection remains unavailable.

## 7. Candidate and integration gates

| Gate | Result |
| --- | --- |
| Focused progression suite | **128/128 passed** |
| Exact Phase 6 Training suite | **167/167 passed** |
| Merge base | exact `b7eb1e397f0238df9ae904fd182ddbb51602e8d8` |
| Ahead/behind | candidate 3, base 0 |
| Candidate commits | `12ee18da`, `3dfbc4c3`, `999a225a` |
| Integration | clean normal fast-forward |
| Migration/backfill | none |
| Native contract | backward-compatible additive metadata |
| Native progression math | none introduced |
| Native Build 89 / Build 90 | untouched |

## 8. Deployment recommendation

**DEPLOY `999a225a38ced9ddb16a65bbe840896472265468` after separate Founder authorization.**

Rationale:

- the production strategy exactly matches the candidate's supported rule;
- Cable is eligible under both gates and has a safe evidence-derived target;
- the Maintain control holds at the 13/14-day boundary;
- the Opportunity control becomes eligible without inventing a target;
- exact exercise, variant, load type/unit, and relationship partitions remain isolated;
- source tests and integration topology are green;
- no migration, backfill, Native change, topology change, or cost change is required.

This recommendation is not deployment authorization and no deployment was performed.

## 9. Prepared deploy/rollback identities — not executed

### Deploy

- production ref: `refs/heads/combined-app-platform-cutover`
- expected pre-deploy source: `b7eb1e397f0238df9ae904fd182ddbb51602e8d8`
- candidate: `999a225a38ced9ddb16a65bbe840896472265468`
- expected operation: exact normal fast-forward only
- app: `bf57cf56-48cc-4cd6-90e4-a23ee5381741`, to be freshly reverified
- migration/backfill: none
- topology/cost delta: none / `$0`

After separate Founder authorization, the reviewed ref update is:

`git push origin "999a225a38ced9ddb16a65bbe840896472265468:refs/heads/combined-app-platform-cutover"`

The established guarded deployment flow must preserve the live spec except the four web/worker release stamps, force exactly one rebuild, and require ACTIVE 9/9, exact web/worker source/runtime identity, no pending deployment, and green live/readiness checks. Post-deploy acceptance must rerun the same bounded Cable and controls shadow.

### Rollback

- rollback source: `b7eb1e397f0238df9ae904fd182ddbb51602e8d8`
- lease expectation after deploy: production ref exactly `999a225a38ced9ddb16a65bbe840896472265468`

If rollback is required after an authorized deployment:

`git push --force-with-lease=refs/heads/combined-app-platform-cutover:999a225a38ced9ddb16a65bbe840896472265468 origin "b7eb1e397f0238df9ae904fd182ddbb51602e8d8:refs/heads/combined-app-platform-cutover"`

Then repeat the guarded stamp update and one forced rebuild for `b7eb1e39`, requiring exact authority, ACTIVE 9/9, green health/readiness, unchanged migration state, and the bounded shadow matching the captured pre-deploy baseline.

## 10. Stop state and notification

- Structural discovery: **PASS / unambiguous**
- Corrected bounded read: **PASS**
- Cable eligibility: **YES**
- Maintain control: **PASS**
- Opportunity/no-target control: **PASS**
- Recommendation: **DEPLOY after separate Founder authorization**
- Deployment/mutation performed: **NO / NO**
- Native Build 89/90 touched: **NO**

Notification: **The production Training shape is resolved, the corrected Cable/control shadow is green, and `999a225a` is recommended for deployment after separate Founder authorization. No deployment or production mutation occurred.**

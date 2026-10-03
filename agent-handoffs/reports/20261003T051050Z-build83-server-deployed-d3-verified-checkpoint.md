# Build 83 Server deployed + D3 verified — checkpoint

- Task: `build83-first-real-workout-comprehensive-correction-20261003`
- Status: **Server deploy and bounded D3 repair complete; Native release work continuing**
- Agent: Codex
- Takeover prompt authority: `5afbfd77cb50921425c86575373dd5fa0812698d`
- Continuity checkpoint authority: `b2e1779aa8b639ca8508c817204b96df4b4ba511`
- Previous main checkpoint: `7ef64f4488625565a5783f40a993dd1ee5edd8a9`

## Exact authorities

| Item | Authority |
|---|---|
| Deployed Server SHA | `89fe0a0340adee22d15b92a1f074a0bbd348ac77` |
| Production deployment | `28678d4a-e3cc-4b2b-a479-1851ab7093bf` |
| Production build id | `physiqueos-89fe0a03-20261003` |
| Native candidate continuing | `3e61dd215e8474c52bd54230d2d9dfb2f3a93534` |
| Withdrawn Server SHA | `22925625ba377e67943ac5d63dd2c9613c897936` — never deploy; not an ancestor of the deployed SHA |

The Founder directly authorized the exact Server SHA and the tightly bounded Oct. 2 D3 repair in the active session. The production branch was fast-forwarded to the exact SHA through the established guarded workflow. The live spec was changed only to stamp the exact web/worker Git SHA and build id before the forced rebuild.

## Deployment verification

- Deployment `28678d4a-e3cc-4b2b-a479-1851ab7093bf` reached `ACTIVE`, progress `9/9`.
- Web and worker source commit hashes are exactly `89fe0a0340adee22d15b92a1f074a0bbd348ac77`.
- Web and worker runtime authority stamps report that exact SHA and build id.
- `/api/v1/health/live` returned healthy with the exact build id.
- `/api/v1/health/ready` returned ready with all `9/9` checks passing, including database, minimum schema and runtime authority.
- Fresh worker and web logs reported the exact runtime SHA/build id; no deployment errors were found.
- No schema or migration change was part of this Server candidate.

## D3 fail-closed dry run

The byte-verified production console runner was used. Its SHA-256 was `aa2d3247917184199b718d5e7558a74cc8dcf46bf34713b3f73b8e506816a608`.

The dry run selected exactly two Founder-owned, Oct. 2, `source_only` / `unsupported_workout_type` observations and no others:

1. HealthKit type `44`, observation hash `cd914367d433`
   - expected canonical hash `dc9994d78f4a`
   - label `Stair Stepper`
   - reporting family `cardio`
   - canonical type `stair_climbing`
   - strategic role `graduation_candidate`
   - strategically eligible and joins current Cardio evidence
2. HealthKit type `80`, observation hash `e946af40a4a3`
   - expected canonical hash `83e5d0102690`
   - label `Cooldown`
   - reporting family `other`
   - canonical type `cooldown`
   - strategic role `history_only`
   - strategically ineligible and does not join Cardio evidence

The dry run predicted exactly six writes and found no pre-existing fixed audit row. Owner, local date, source state, reconciliation state, canonical identities and outputs all matched the reviewed facts, so the Founder-authorized apply gate was satisfied.

## D3 mutation ledger

The apply completed once with exactly six scoped writes:

- one fixed repair audit row;
- two canonical workout creates;
- one Stair Stepper coexistence update;
- two source-observation reconciliation updates.

No links or claims were added. The repaired source observations remain quarantined/non-additive. The repair did not change workout/graduation policies, canonical Activity days, evidence, historical strategic artifacts, or any record outside the exact mutation contract and audit row.

## Independent post-apply verification

A fresh independent reviewer returned **APPROVE** with no blocking findings for exact Server SHA `89fe0a0340adee22d15b92a1f074a0bbd348ac77` and deployment `28678d4a-e3cc-4b2b-a479-1851ab7093bf`.

- Read-only replay returned `already_repaired`, exact runtime authority and the exact fixed audit.
- Exactly three Oct. 2 canonical workouts exist: the pre-existing Strength workout, one Stair Stepper and one Cooldown.
- Canonical workout total is exactly `25`, the prior `23 + 2`.
- Duplicate canonical workouts: `0`; possible duplicates: `0`; one-to-one integrity violations: `0`.
- Stair Stepper is canonical Cardio and strategically eligible under the accepted Cardio graduation policy.
- Cooldown is canonical workout history labeled Cooldown, reporting family `other`, strategic role `history_only`, and never joins Cardio evidence.
- Read-model projection checks returned Stair Stepper as a Cardio history row, Cooldown as an `other` history row, zero Cooldown-only Cardio sessions/totals/flags, exactly one Cardio session in the mixed pair, and only Stair Stepper in strategic projection.
- Current live Oct. 2 Activity authority is one canonical day at revision `66`, `1024.9881320075506` move calories and `111` exercise minutes. These are cumulative live values, distinct from the synthetic `905 / 52` fixture.
- The canonical-day count/digest was identical before and after D3: `24 / 2a7d2ac83973cec50a8118a2621f70a1`. Therefore D3 changed neither Activity calories nor exercise minutes.
- Links remain `7`; claims remain `14`.
- Evidence remains `583 / 781e85acabd106ffa71464145b4cb8a1`.
- Historical Daily Briefings, work items, analyses, Confidence snapshots and Confidence history retained their exact pre-apply counts/digests; no historical strategic artifact was rewritten.
- Exact-SHA focused Server tests passed `24/24`. The earlier exact-candidate changed-test set passed `321/321`; the independent candidate review also passed `88/88` focused D1-D3 tests.

A supplemental combined read-model probe returned the correct classification/reporting/strategic data but its local wrapper contained stale expected display durations (`11/5` versus live `12/4`) and therefore exited on that wrapper invariant. It was read-only, changed nothing, and is not relied upon for the approval above.

## Native continuation authority

Native remains exact candidate `3e61dd215e8474c52bd54230d2d9dfb2f3a93534` on `claude/build83-first-real-workout-corrections-20261003`. Fresh independent review is **APPROVE** with no blocker, major or minor findings. Existing local Home Widget PNG modifications in that worktree are unrelated user work and remain untouched/uncommitted.

Remaining work is intentionally continuing rather than stopping:

1. complete resource-safe Watch UI and erased-simulator Training acceptance gates;
2. verify deterministic Build 83 generation and release metadata;
3. create and inspect the signed archive for iPhone, Widget/Live Activity and Watch, including Watch icon, HealthKit, `WKBackgroundModes` workout processing, companion, Sleep v3 compatibility and Progress Photos preservation;
4. run the normal guarded TestFlight-first release flow and wait for `VALID`;
5. publish the final Build 83 main checkpoint with exact Native/archive/delivery authority.

DEXA HealthKit writeback remains **READY/HOLD**. Sleep v3 was not changed or disturbed.

## Local/private evidence

Production result files and raw observation identifiers remain owner-only in local temporary storage and were intentionally not pushed. This report contains only sanitized hashes, counts and durable authorities. No credentials, private production exports or Founder evidence bytes are included.

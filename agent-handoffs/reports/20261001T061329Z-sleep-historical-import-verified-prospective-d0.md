# HealthKit Sleep v2 — historical import verified; October 2 prospective D0 activated

Generated: 2026-10-01T06:13:29Z  
Task: `sleep-verify-import-oct2-d0-20261001`  
Governing prompt: `agent-handoffs/inbox/prompts/20261001T060000Z-sleep-verify-import-oct2-d0.md`  
Status: **complete for import verification and D0 policy activation; empirical 2–3-night acceptance pending**  
Strategic Sleep: **OFF / quarantined**

## Outcome

Build 74's historical Sleep Evidence import is verified in production: exactly **8,601 unique samples**, **87 unique batches**, and **87 unique canonical sleep days**, beginning **2026-07-06** and ending **2026-09-30**. Every imported sample and day is in the dedicated historical collections, uses `sleep-canon-v2`, carries the permanent historical quarantine, and is strategically ineligible.

There are exactly **0 historical samples and 0 historical days on or after the planned 2026-10-02 D0**, and ordinary prospective Sleep remained **0 samples / 0 days** immediately before activation. No deletion, trimming, rewriting, or other destructive operation was performed. The live Recovery/Sleep projection was also adversarially exercised with colliding historical and prospective rows for one sleep day; it selected the prospective row exactly once in landing, trends, weekly totals, and night detail. Thus a later historical replay within the source-controlled Jul 6–Oct 6 import authorization cannot double-count a day in the read model, even though historical storage remains immutable and separate.

After a fresh zero-write drift check, the guarded production policy transaction activated prospective Sleep for **D0 2026-10-02**, floor **2026-10-02T01:00:00.000Z**, timezone `America/Los_Angeles`, mode `validation_only`, source preference `oura`, open-ended. The stored policy has `historicalBackfill: false`, `strategicEvidenceEligibility: quarantined`, and no `strategicEffectiveAt`. Served capability is enabled, but strategic Sleep remains categorically off.

## GitHub and production authority

- Native reviewed branch: `codex/healthkit-sleep-canon-v2-20260930` at exact `b6d98889a9ebac2fd6755ec126c1b5ba394545fa`.
- Native Sleep implementation commits: `cf00c234`, `b6d98889`.
- Build 74 App Store Connect delivery: `7583455f-9a81-4636-9002-86d05915cd70`, processing/import `VALID / VALID`.
- Server reviewed branch: `codex/sleep-evidence-server-deploy-20261001` at exact `b81c784e5b8a6d5b82ed02a649b5fa3d0edeeff8`.
- Production branch `combined-app-platform-cutover`: exact `b81c784e5b8a6d5b82ed02a649b5fa3d0edeeff8`.
- Claude Native proposal branch: `claude/sleep-evidence-native-20261001` at exact `d550c629e6028fef2db44e98cd51f2a4d2d6ff2f`.
- Active production deployment: `8008f928-02b6-46b0-99ab-d403b870499a`.
- Public live: `ok`, build `physiqueos-b81c784e-20261001`.
- Public ready: `ready`, all 9 checks green, exact runtime authority and migration `000014` verified.

These GitHub refs were read directly immediately before publication. No code deploy or Native upload occurred in this task.

## Historical import proof

The production verifier ran inside the exact active web runtime. It gated exact SHA and owner before database access, opened `REPEATABLE READ READ ONLY`, required `transaction_read_only=on`, used bounded owner/collection/date-scoped reads, and rolled back. It printed no raw samples, per-night durations, source identifiers, or private timestamps.

| Invariant | Result |
|---|---:|
| Historical samples | 8,601 |
| Unique sample record ids | 8,601 |
| Unique external sample ids | 8,601 |
| Unique ingestion batches | 87 |
| Historical canonical days | 87 |
| Unique sleep days | 87 |
| First sleep day | 2026-07-06 |
| Last sleep day | 2026-09-30 |
| `sleep-canon-v2` days | 87 / 87 |
| `asleep_recorded` days | 87 / 87 |
| Permanently quarantined samples | 8,601 / 8,601 |
| Permanently quarantined days | 87 / 87 |
| Ordinary samples / days | 0 / 0 |
| Historical samples / days on or after Oct 2 | 0 / 0 |
| Audit mutations | 0 |

The categorical strategic-eligibility service rejected all 87 historical days even when challenged with a synthetic broad future strategic policy. Quarantine therefore does not depend on the current policy merely remaining narrow.

## September v2 parity and Oura duplicate-copy behavior

September historical output was compared against both the stored 2,878-sample validation corpus and a fresh canonicalization of the 8,601 imported samples. Comparisons used recursively key-sorted JSON; a preliminary byte-order comparison correctly exposed that object insertion order differed, but a field/value diff proved no semantic difference. The corrected canonical comparison produced:

- 30 historical days and 30 validation days.
- Historical stored day vs re-canonicalized imported input: **30/30 exact**.
- Historical stored day vs prior validation canonical output: **30/30 exact**.
- Timeline: **30/30 exact**, same segment count 30/30, same stage sequence 30/30.
- Staged main sleep: 30/30.
- Oura primary: 30/30.
- Duplicate-copy-affected nights: 11.
- Candidate shape: 8 two-copy nights and 3 three-copy nights.
- v2 selected one copy: 11/11.
- Selected copy conflict-free: 11/11.
- Selected totals within tolerance: 11/11.
- Affected asleep total stable where required: 10/10.
- Unaffected nights semantically equivalent: 19/19.

The independent source-bundled historical-shape audit then reran the **exact 2,878-sample** production validation after activation, zero-write. It reproduced 30/30 nights, 2,878/2,878 Oura samples, 30/30 Oura-primary, the 11-night duplicate shape above, and zero strategic leaks.

## Permanent strategic quarantine / zero downstream impact

Using the earliest production import creation timestamp as the lower bound, the verifier found no record updated or created since import, and no Sleep/historical-import reference, in the protected strategic collections:

- Goal, phase strategy, expected trajectory, and lifecycle records: 0 updates; 0 Sleep references.
- Daily Briefings (including their embedded Narrative/recommendation output): 0 updates; 0 Sleep references.
- Goal Confidence/history, analyses, confidence initialization/activation artifacts: 0 updates; 0 Sleep references.
- Canonical strategic Evidence, packages, and reviews: 0 updates; 0 Sleep references.

The independent source audit also reported all eight leak counters at zero: canonical Evidence objects, packages, reviews, Briefings, Goal Confidence snapshots/history, analyses, and ordinary HealthKit canonical Sleep days. Historical Sleep did not trigger V3, Goals, Briefings, Confidence, Narrative, recommendations, or historical artifact recomputation.

## Recovery/Sleep live read-model proof

The deployed production service was exercised directly against the real 87-day historical dataset:

- Landing: schema `recovery-sleep-evidence-v1`; 14 bounded nights; last night present; seven-night aggregate present; `strategicUse: quarantined`; all 14 uncertain historical clocks excluded from window consistency; source output label-only.
- Trends: first 20-night page and second 20-night page returned with a next cursor and zero duplication across pages.
- Long range: Server selected weekly granularity and produced 13 weekly points.
- Night detail: schema `recovery-sleep-night-v1`; stage status `available`; all stage values present; continuity and timeline present; provenance `historical_evidence_import`; timezone basis `device_at_ingest`; uncertainty true; algorithm `sleep-canon-v2`; strategic eligibility false.
- Query shape: 10/10 reads constrained by owner, collection, and occurrence-date range. Maximum rows in any query: 87. Slowest observed query: 172.4 ms.

The synthetic collision test fed the live service one historical and one prospective row for the same sleep day. Landing returned one day, trends returned one day, weekly `nightCount` summed to one, and night detail selected the prospective provenance. This is the non-destructive overlap reconciliation. No historical row was deleted.

## Claude Native contract reconciliation

Claude's `d550c629` implementation is coherent against its checked-in proposed v0 contract, but it is **not decode-compatible with the live Server contract**. No claim of integrated Native acceptance is made. Exact differences:

| Area | Claude Native proposal | Live Server b81c784e | Required Native adapter |
|---|---|---|---|
| Landing resource | `recovery-sleep` | `recovery-sleep-landing` | Rename resource |
| Trends query | `range=2w|1m|3m|6m|1y|all` | required `startDate`, `endDate`; optional `limit`, `cursor` | Translate range to bounded dates and consume paging |
| Nights list | separate `recovery-sleep-nights?cursor&limit` | no separate resource; paged nights are in `recovery-sleep-trends` | Route list paging through trends or add a Server alias later |
| Landing envelope | `state`, `priorSevenNightAverage`, `trailingAverages`, `sleepWindow`, typed sources, `evidenceStartSleepDay` | `schemaVersion`, `lastNight`, `nights`, `sevenNightAverage`, `window`, label-only `sources`, `strategicUse` | Adapt shape; Native must not assume absent aggregates |
| Average/window names | `asleepSeconds`, `windowNights`, minimums; `typical*`, `nightsIncluded`, `nightsExcludedUncertainTime` | average `{seconds,nightCount}`; window `{medianStartMinute,medianEndMinute,startSpreadMinutes,endSpreadMinutes,nightsUsed,inferredNightsExcluded}` | Map exact names and optionality |
| Night summary | flat `asleepSeconds`, episode count, start/end, certainty, consistency/window flags, source family, origin enum | `mainSleep`, `sleepWindow`, label source, `timeZoneUncertain`, provenance object | Build Native summary from live projection or extend Server deliberately |
| Stage enum | `available`, `pending_correction`, `absent`, `unknown` | `available`, `unavailable` | Add tolerant mapping; never display numbers unless available |
| Trends envelope | Server-derived `totalSleep`, `windowRows`, `continuity`, `stageMix`, overall average/count | `range {startDate,endDate}`, `granularity`, `series`, `nights`, `page`, `strategicUse` | Adapt charts to live `series`/`nights`; proposed per-chart arrays do not exist |
| Night detail | nested `{night,main,secondary,provenance}` with typed families/roles and nested status objects | one flat projected night: `mainSleep`, `sleepWindow`, `timeline`, `stageStatus`, `stages`, `continuity`, `timeInBedSeconds`, `secondarySleep`, label sources, completeness, timezone basis/uncertainty, algorithm/provenance | Rewrite decoder/model adapter to the live flat schema |
| Origin values | `prospective`, `historical_import` | live provenance currently emits `validation_only` or `historical_evidence_import` | Tolerant enum mapping |

Claude's production API currently requests resources/fields that the deployed Server does not serve, so merging `d550c629` unchanged would fail-soft to “not available” or fail decoding. The correct next Native integration is limited to `RecoverySleepReadModel.swift`, `RecoverySleepAPI.swift`, and its fixture/tests; the existing UI/view-model separation makes that reconciliation bounded. Strategic UX remains absent.

## October 2 activation

### Fresh dry run

Immediately before apply, the exact b81 runtime returned:

- outcome `dry_run`;
- target D0 `2026-10-02`;
- activation floor `2026-10-02T01:00:00.000Z` (strictly future);
- timezone `America/Los_Angeles`;
- mode `validation_only`;
- open-ended true;
- current activation digest absent;
- Oura source-preference digest `3b9d61a2018968b883dd103cd262a1ba`;
- validation-policy digest `c32221dbcf30883dc2d2b0a047bc2a73`;
- ordinary Sleep 0 samples / 0 days;
- validation corpus 2,878 samples.

The dry-run facts were embedded exactly into the apply payload. The first attempt to open a component console with the deployment-only control-plane context was rejected by the provider before a console was created; no payload executed and no mutation occurred. The established app-console execution path then ran the reviewed policy operation with the prompt path as its authorization reference.

### Applied state

- Outcome: `applied`.
- Policy record: `healthkit_sleep_canonical_activation_policy`.
- Audit record: `healthkit_sleep_policy_audit_e1c42bfdde58631ddad116dd3dc0814b`.
- D0 / floor: `2026-10-02` / `2026-10-02T01:00:00.000Z`.
- Mode: `validation_only`.
- Timezone: `America/Los_Angeles`.
- Source preference: Oura.
- Open ended: true.
- `historicalBackfill`: false.
- `strategicEvidenceEligibility`: `quarantined`.
- `strategicEffectiveAt`: absent.

The guarded runner used one `READ COMMITTED` transaction under the owner advisory lock, matched the fresh expected facts, and committed once. The only intended production mutation was the activation policy plus its authorization audit row.

### Independent post-apply proof

Two independent read-only, rollback-fenced audits then passed:

- raw/resolved policy exactly enabled for Oct 2, `validation_only`, correct floor/zone, no backfill, strategic quarantine, no strategic-effective field;
- served capability enabled;
- historical import still 8,601 / 87 / 87 and permanently quarantined;
- overlap still 0 historical rows on/after D0; ordinary prospective still 0/0 before the floor;
- September 30/30 semantic parity and v2 duplicate resolution unchanged;
- live read model still correct;
- exact validation corpus still 2,878;
- strategic leak total still 0;
- audit record-store mutations 0.

October 3 was not needed; the October 2 future-floor and all other guards passed without weakening.

## Required 2–3-night empirical acceptance

Keep strategic Sleep off throughout this acceptance. For each of the first 2–3 sleep days after D0:

1. Build 74 delivers Sleep automatically in the background without opening Log or manually invoking the historical importer.
2. Oura is primary whenever its staged record is present; family labels remain sanitized.
3. Late HealthKit updates revise the same canonical day deterministically; no second canonical day or double-count appears.
4. The Native recent-window manifest advances without requesting history before the Oct 2 floor.
5. Exactly one prospective canonical day exists per sleep day and is `sleep-canon-v2`.
6. Stages, timeline, and continuity render only when the Server says `available`; incomplete/unstaged input withholds those numbers.
7. Recovery/Sleep Evidence landing, trends, weekly aggregation, paging, and night detail update from the prospective row while historical history remains display-only.
8. Strategic leak total remains zero across V3, Goals, Briefings/Narratives/recommendations, Confidence, and strategic Evidence.

If a night fails, preserve the raw/canonical records and investigate the bounded manifest/late-update path. Do not delete historical Evidence and do not weaken the D0 floor or quarantine.

## Safety and mutation ledger

- Historical deletion/trim: none.
- Historical sample/day rewrite: none.
- Strategic record mutation: none.
- Code deploy: none.
- Native upload/device operation: none.
- Prospective data backfill: none.
- Production mutation: exactly the guarded Sleep activation policy and its audit row.
- Credentials, provider specs, raw Sleep samples, source UUIDs, per-night durations, and production exports were not printed or committed.

## Flags

`GH_AUTHORITY_VERIFIED` · `BUILD74_IMPORT_VERIFIED` · `8601_SAMPLES` · `87_BATCHES` · `87_DAYS` · `FIRST_DAY_2026_07_06` · `PERMANENT_HISTORICAL_QUARANTINE` · `D0_OVERLAP_0` · `NO_DELETION` · `PROJECTION_PRECEDENCE_PROVEN` · `SEPTEMBER_30_OF_30_PARITY` · `V2_DUPLICATE_11_OF_11` · `2878_SAMPLE_ZERO_WRITE_AUDIT_PASS` · `READ_MODEL_PASS` · `CLAUDE_CONTRACT_DIFF_PUBLISHED` · `OCT2_D0_APPLIED` · `VALIDATION_ONLY` · `OURA_PREFERRED` · `NO_BACKFILL` · `STRATEGIC_OFF` · `STRATEGIC_LEAK_0` · `EMPIRICAL_2_3_NIGHT_ACCEPTANCE_PENDING`

# HealthKit Sleep Phase A: dormant Server foundation

- task.id: `healthkit-sleep-phase-a-server-foundation-20260930`
- prompt: `agent-handoffs/inbox/prompts/20260930T163000Z-healthkit-sleep-phase-a-server-foundation.md` (origin/main 098b6259)
- agent: Claude
- status: **candidate complete** (implemented, tested, three fresh-review rounds; no remaining blockers or should-fix items). **NOT DEPLOYED.** No policy written, no Founder Sleep ingested, no Native work.
- State was reconstructed from GitHub only: the architecture report, the prompt, and the GH stop-checkpoint protocol. No pushed Phase A branch existed, so this work starts fresh from the production SHA.
- Inbox note: `agent-handoffs/inbox/latest.json` still points at the completed 2026-09-23 Strength task. The Founder named this prompt directly, so this handoff is published without `--inbox-task-id`, as the discovery handoff was.

## 0. Authority (re-verified live, read-only)

| Item | Value |
|---|---|
| Production Server | **372c306b** (`/api/v1/health/live` buildId `physiqueos-372c306b-20260930`) |
| Active deployment | **efd356b0** (2026-09-30 16:54Z, cause "app spec updated"). web and worker `source_commit_hash` = 372c306ba45f…, and spec GIT_SHA/BUILD_ID = 372c306b. It supersedes 4dac1b07, which the discovery report recorded, but the code is the same. |
| `combined-app-platform-cutover` | 372c306b |
| Candidate base | 372c306b (the production SHA), not the older worktree HEAD 0a07132c |
| Candidate branch | `claude/healthkit-sleep-phase-a-server-20260930` |
| Candidate SHA | **e1e56be696b558762544cd59fa801d7d749a8b76** (e1e56be6) |
| Sleep ingestion in production | none (not deployed; no policy record) |

## 1. What changed

Commits on `claude/healthkit-sleep-phase-a-server-20260930` (base 372c306b):
- `f039fbcd` feat(healthkit-sleep): dormant Phase A Server foundation
- `f5e51abf` fix(openapi): register healthkit.sleep.ingest.v1 command type
- `b52aaf4d` fix(healthkit-sleep): address fresh-review findings
- `09a6f441` fix(healthkit-sleep): converge under extreme zone skew; surface recompute cap
- `e1e56be6` fix(healthkit-sleep): zone-skew load margin for recompute closure

Files (28 files, +3,119/−4, most of it tests):

**New code**
- `src/domain/services/HealthKitSleepContract.js`: wire contract, privacy allow-list, stage mapping, identity, sleep-day time arithmetic.
- `src/domain/services/HealthKitSleepPolicies.js`: activation policy and source-preference policy, both fail-closed, plus the Native capability description.
- `src/domain/services/HealthKitSleepCanonicalizer.js`: the pure `sleep-canon-v1`.
- `src/application/commands/HealthKitSleepIngestPort.js`: the `healthkit.sleep.ingest.v1` port.
- `src/application/native/HealthKitSleepCapabilityReadService.js`: a single-record reader used by the manifest.

**Changed code**
- The Phase3 command and port registry, the Native write set, manifest and request bound, and the OpenAPI command enum.
- `phase4DomainCollections` (2 collections added).
- `Phase4CanonicalRecordStore.listByOccurrenceDateRange` (Postgres and in-memory).
- The quarantine detector (sleep id prefixes and schema).
- Structured-log redaction (`sleep|sourcename|devicename`).

## 2. Contracts

### Command `healthkit.sleep.ingest.v1`

- Payload: `{batchId, samples?[], deletions?[], windowManifest?}`, with at least one of the three present.
- Limits:
  - ≤100 samples and ≤100 deletions per request
  - ≤1000 manifest IDs
  - manifest window ≤96 h
  - request bound 1.5 MiB, checked against a derivation (derived worst case ≈1.40 MiB)

### Sample fields (allow-list)

- `externalId`: HealthKit UUID, lowercased.
- `categoryValue`: raw `HKCategoryValueSleepAnalysis` value.
- `startedAt`, `endedAt`: ISO-8601 with `Z` or an explicit offset, a real calendar date, and hour ≤23. A zone-less value is refused. They are ≤24 h apart, with end ≥ start. A zero-length sample is stored but carries no time.
- `timeZone` (IANA) and `timeZoneSource`: `sample_metadata` or `device_at_ingest`.
- `wasUserEntered`.
- `source{bundleIdentifier, sourceVersion, productType}`. The Server stores only `productTypeFamily` (`watch|iphone|ipad|other`), never the model string.
- `com.apple.health.<device UUID>` is normalized to `com.apple.health` before storing, fingerprinting or ranking, so no per-device identifier is persisted.

The Server derives:
- `stage`: `in_bed | asleep_unspecified | awake | asleep_core | asleep_deep | asleep_rem | unknown`, with `stageSchemaVersion hk-sleep-v1`.
- `sourceClass`: `apple_watch | apple_iphone | apple_other | third_party | user_entered`.
- `sourceFamily`: `apple_watch | apple_iphone | apple_other | oura | sleep_cycle | whoop | autosleep | third_party_other | manual`. This comes from a technical bundle-prefix classifier. The Sleep Cycle bundle id is unverified, and an unlisted writer is still ranked and preferable by exact bundle id.

Also derived:
- `contentFingerprint`: covers the immutable HealthKit content. A device-derived zone is excluded, so a replay after travel does not look like a conflict.
- Provenance `ingestion{firstReceivedAt, batchId, deliveryDeviceId}`.
- `lifecycle{state, deletedAt, deletionSource, deletionBatchId}`.
- `ingestionPurpose`, which comes from the Server policy, not the client.

Unknown future raw values are stored as `unknown`. They are never rejected and never asleep.

### Privacy

The following keys are refused by name in sample or source, and the whole request gets `400 HEALTHKIT_SLEEP_PRIVATE_FIELD_REJECTED` with nothing stored:
- `sourceName`, `name`, `deviceName`, `device`
- `localIdentifier`, `udiDeviceIdentifier`/`udi`
- `firmware/hardware/softwareVersion`, `manufacturer`, `model`/`deviceModel`
- `metadata`, `operatingSystemVersion`, `privacySafeDeviceProvenance`

Records are built only from the allow-list, so unknown extra keys are ignored and never persisted.

### Deletion and retraction

- `deletions[{externalId}]` marks a live sample `deleted(hk_deleted_object)` and recomputes the affected days.
- An unknown UUID is **tombstoned** (identity only). If the sample arrives later, it stays deleted, with its content kept as provenance. HealthKit never reuses UUIDs.
- Replay returns `already_deleted`.

### Window manifest

`{windowStart, windowEnd, liveExternalIds}`. A stored sample is marked `deleted(window_manifest)` only when all of these hold:
- it is live
- its `endedAt` is within `[windowStart, windowEnd)`
- its `endedAt` is at or after the activation floor
- it is missing from the list

Samples outside the window or before the floor are never touched. The read is scoped to the window's sleep days ±2. No Native producer exists yet.

### Idempotency

- Receipts: the existing `Idempotency-Key` command receipt.
- Sample identity: `sha256("sleep"␀owner␀uuid)`.
- A duplicate sample returns `replayed`.
- The same UUID with different content returns `refused_identity_conflict` for **that sample only**, with an incoming content digest and no timing. The rest of the batch commits.
- A recompute with an unchanged `inputDigest` writes nothing.

## 3. Storage, indexes, migration

- New collections: `healthKitSleepSamples` and `healthKitSleepDays`, both in `canonical_training_records` as map entries (no DDL).
- Sample `occurrenceDate` = the candidate sleep day of the sample's own end in its own zone.
- Day `occurrenceDate` = the sleep day.
- New `records.listByOccurrenceDateRange({ownerUserId, collection, startDate, endDate})`:
  `WHERE owner_user_id=$1 AND collection_name=$2 AND occurrence_date BETWEEN $3 AND $4`.
- **No migration is needed.** The existing index `canonical_training_records_owner_collection_idx (owner_user_id, collection_name, occurrence_date, observed_at)` (db/migrations/000003) has exactly this prefix.
- Sleep never calls `records.list` and never touches `healthKitObservations`. A test asserts every read the port makes.

## 4. Source-preference policy

- Record: `healthKitConfiguration/healthkit_sleep_source_preference_policy`, schema `healthkit-sleep-source-preference-v1`.
- Shape: `{status:"enabled", preferredSources:[{sourceFamily}|{bundleIdentifier}], ≤8}`.
- Absent or malformed: generic ranking, never throws. `manual` can never be preferred.
- **Nothing writes it.** The Founder's Oura preference is a later authorized one-record write (`preferredSources:[{sourceFamily:"oura"}]`). Nothing is hard-coded to Oura; tests prove the same mechanism selects Watch or an arbitrary bundle.

## 5. Canonicalization: `sleep-canon-v1` (pure; versioned parameters digest)

**Sleep day**
- Wake date D covers `[D-1 18:00, D 18:00)` in the episode zone, which is the zone of the last primary asleep sample.
- An end at exactly 18:00 belongs to D+1.
- Durations always come from absolute instants. Tests cover DST: the spring window is 23 h and the fall window is 25 h.

**Episodes**
- Episodes cluster the asleep and awake intervals of all sources, merging gaps of ≤60 min (a versioned parameter).
- A cluster with no asleep interval is not an episode.
- In-bed clusters that are not near any asleep episode become an `in_bed_only` episode.
- The main episode is the one with the greatest asleep time. All others are `secondary` and preserved. No Nap or Additional Sleep labels are assigned.

**Primary lane.** A lane is sourceClass + bundle id. Lanes are ranked lexicographically:
1. Usable sensor > usable manual > insufficient sensor > insufficient manual. "Usable" means the lane's own asleep union is ≥50% of the episode's all-source asleep union. This is a technical parameter, not a coaching threshold.
2. The Server preference applies only among lanes in the same tier.
3. Staged over unspecified-only.
4. More asleep coverage.
5. Class tie-break: `apple_watch > third_party > apple_other > apple_iphone > user_entered`, then bundle id, then lane key.

The reason is recorded as one of: `only_candidate`, `usable_sensor_over_manual`, `usable_over_insufficient_coverage`, `server_source_preference`, `stage_detail`, `greater_asleep_coverage`, `deterministic_tie_break`.

**Totals**
- Totals come from the primary lane only. There is no cross-source gap filling and no hybrid total.
- Each instant has exactly one state, by precedence deep > REM > core > awake > unspecified. So a nested stage overrides unspecified sleep and nothing is double counted.
- In-bed and awake are never asleep. A gap is not awake. Awake outside the primary asleep extent is not counted.
- `inBedSeconds` is set only when same-lane in-bed covers ≥90% of the episode. Otherwise it is null.
- Each in-bed sample is assigned to at most one episode (greatest overlap, then smallest gap, then earliest).
- Zero-length samples never form or extend an episode.
- No efficiency, awakening count or score.

**Day record (supports a future Evidence design without prescribing it)**

Day-level fields:
- `sleepDay`, `status` (`asleep_recorded | in_bed_only | no_sleep_recorded`)
- `timeZone`, `timeZoneShift`, `windowClosesAt`, `ingestionPurpose`
- `mainEpisodeIndex`, `mainSleep{asleep/awake/core/deep/rem/unspecified/inBed seconds, stageCoverage}`
- `totalAsleepIncludingSecondarySeconds`
- `episodes[]`
- `inputSampleIds`, `inputDigest`, `algorithmVersion`, `algorithmParametersDigest`, `sourcePreference{configured,digest}`
- `revision`, `computedAt`
- `evidenceEligibility: quarantined`

Each episode has:
- `kind`, `start`, `end`, `timeZone`, `timeZoneSource`
- `primarySource`, `reconciliation{reason, primaryUsable, preferenceApplied, candidateCount}`
- stage seconds and `stageCoverage`
- a `timeline[]` of resolved primary-lane stage segments
- `completeness{asleepData, stageDetail, sourceBasis}`
- `sourceSampleIds`, `corroboratingSources[]` with per-lane asleep seconds, and `corroboratingSampleIds`

"Provisional vs settled" is left to readers, which compare `computedAt` with `windowClosesAt`. It is not stored, because storing a time-dependent flag would break no-op recomputation.

**Recompute: a bounded fixed-point closure**
- Each changed sample touches the sleep days from its start's day −2 through its end's day +2 (zone skew).
- Each pass reads samples for every contiguous run ±3 (scoped; zone-skew margin, with an edge meaning any bucket within 2 days of the loaded edge).
- Any computed day whose inputs touch an affected day joins the set, together with all its inputs' days. This rewrites a day that lost samples to a merged episode.
- Inputs at a loaded edge widen the range.
- The closure is also seeded from **stored** day records (read in a scoped range ±2): any stored day whose `inputSampleIds` include a relevant sample is rewritten along with its `inputSampleDays`, wherever zone skew had placed it.
- In-bed samples assigned to an asleep episode are inputs of that episode, so in-bed-only suppression is tracked by the digest.
- Caps: 8 passes and 45 days. If a cap is hit, the result reports `recomputeTruncated: true`.
- When every sample of a day is deleted, the day becomes an explicit empty day (`no_sleep_recorded`) with `revision+1`. It never keeps stale totals.
- Seeded randomized tests (adds, deletions and manifests) assert after every batch that the stored days equal a fresh canonicalization of all stored samples. They cover LA/NY with samples ≤10 h, and LA/Tokyo and Kiritimati/Pago Pago/UTC with samples ≤24 h.

## 6. Activation policy (dormant, absent = OFF)

- Record: `healthKitConfiguration/healthkit_sleep_canonical_activation_policy`, schema `healthkit-sleep-activation-policy-v1`.
- Shape: `{status:"enabled", mode:"validation_only"|"operational", effectiveSleepDay, timeZone, openEnded:true | endSleepDay (≤7 days), strategicEvidenceEligibility:"quarantined"?, historicalBackfill:false?}`.
- Any malformed value disables it, and it never throws.
- Floor = `(effectiveSleepDay − 1) 18:00` in the policy zone.
  - A sample that ends before the floor is refused and **never stored**.
  - A sample that starts before the floor and ends after it is kept.
  - No backfill path exists.
- Disabled: **409 `HEALTHKIT_SLEEP_INGESTION_NOT_ENABLED`**, thrown before any read of Sleep data or any write. The transaction rolls back, so there is **no receipt**. A route-level test proves the store is byte-identical and that a retry after enablement is not blocked.
- `validation_only` marks samples and days `validation_only`, which future Evidence readers must honour.
- **D0 is not chosen and the policy is not written.** Current intent: the first sleep night after the prospective canary is activated.

## 7. Native capability (dormant)

- The manifest gains a `healthKitSleepIngestion` block:
  - `{commandType, contractVersion, enabled, mode, effectiveSleepDay, endSleepDay, activationFloor}`
  - plus limits and semantics text.
- The static manifest says `enabled:false`. The served manifest resolves the owner's policy through a single-record reader. An absent reader or policy, a malformed policy, or any read error keeps it `enabled:false`. The manifest never fails because of Sleep.
- Every other manifest field is unchanged, and a test asserts this.
- The write entry is added. Activity, Nutrition, Cardio and Strength behavior is untouched.

## 8. Strategic quarantine

- `HealthKitEvidenceEligibilityPolicy` now detects `healthkit_sleep_sample_`, `healthkit_sleep_day_` and `healthkit-sleep-*` schemas. The strategic write guard refuses samples, days and tombstones.
- Structural test: only the Sleep contract/ingest files and the transport/composition files mention Sleep. None is in `domain/intelligence`, briefing, confidence or core-read directories.
- The existing HealthKit read-boundary allowlist is extended only with the Sleep files.
- Graduation: a policy naming `sleep` invalidates both scopes, because `SUPPORTED_DOMAINS` is unchanged.
- `DEFAULT_SETTLEMENT_POLICY.readinessDomains` is still `["activity","nutrition"]`.
- The V3 evidence adapter, given Sleep collections, yields `[]`.
- A route test shows every strategic collection, `canonicalEvidenceObjects` and `healthKitObservations` untouched.
- Not added anywhere: evidenceEligibility, readinessDomains, V3, Briefings, Goal/Strategy confidence, recommendations, Home.

## 9. Privacy

- Refusal by name plus allow-list construction (see §2).
- Tests assert that stored records contain no source or device names, model strings, or extra keys.
- Structured logs now redact any key matching `sleep`, `sourcename` or `devicename`, in addition to `health` and `evidence`.
- Command results carry UUIDs, outcomes, sleep-day keys and revisions only, with no times or durations.
- The existing workout `sourceName` issue is **not** fixed here; it remains separate backlog.

## 10. Tests and results (all run on the exact candidate)

**New Sleep tests** (`npx vitest run --config vitest.unit.config.js`): **all pass at e1e56be6**. There are 81 new tests in total:

| Suite | Tests |
|---|---|
| `src/domain/services/HealthKitSleepCanonicalizer.test.js` (matrix and reconciliation) | 32 |
| `src/domain/services/HealthKitSleepContract.test.js` (contract, time, policies) | 16 |
| `src/application/commands/HealthKitSleepIngestPort.test.js` (dormancy, idempotency, deletion, manifest, convergence, randomized incl. extreme zone skew) | 21 |
| `src/application/native/HealthKitSleepNativeBoundary.test.js` (route 409 with no receipt, manifest capability, request bound, V3 adapter) | 6 |
| `src/domain/services/HealthKitSleepStrategicQuarantine.test.js` (structural quarantine, graduation, readiness, logs) | 5 |
| `phase4PersistenceSecurity.test.js` (scoped Postgres range read SQL) | 1 |

**Prompt matrix coverage**

| Case | Status |
|---|---|
| Simple overnight | ✔ |
| Staged night | ✔ |
| Unspecified + nested stages | ✔ |
| inBed + asleep | ✔ |
| Awake | ✔ |
| Oura/Watch overlap | ✔ |
| Manual alone / manual + sensor | ✔ |
| Daytime secondary | ✔ |
| Evening secondary | ✔ |
| Split sleep | ✔ |
| ≤60 min cluster | ✔ |
| DST spring/fall | ✔ |
| Timezone travel / fallback | ✔ |
| Deletion | ✔ |
| Revision | ✔ |
| Duplicate delivery | ✔ |
| Out-of-order | ✔ |
| Same UUID, conflicting content | ✔ |
| Window manifest deletion | ✔ |
| Activation floor | ✔ |
| Unknown future stage | ✔ |
| inBed-only | ✔ |
| Explicit Oura preference: preferred / unspecified-vs-staged / missing / insufficient / Sleep Cycle overlap / Sleep Cycle only | ✔ |
| No-preference generic ranking | ✔ |
| Strategic quarantine | ✔ |
| Privacy / source-name rejection | ✔ |

**Regression, updated for the new command.** These are the existing expectations that list every command or collection:
- `Phase3CommandParity.test.js`
- `NativeProductionContractService.test.js`
- `phase4Schema.test.js`
- `HealthKitStrategicReadBoundary.test.js` (Sleep files allowlisted, Sleep needles added)
- `openApiConsistency.test.js` (OpenAPI enum)

**Full unit suite** (`vitest.unit.config.js`), run from a clean checkout of **e1e56be6**:
- Result: **304 failed / 9460 passed / 5 skipped**.
- Base **372c306b**, same method: **304 failed / 9379 passed**.
- The failing-test set is **byte-identical** between the two, so there are **no new failures**. The 304 failures are pre-existing and environmental in this local tree: date- and fixture-dependent Training/Weight/Briefing/screens suites. Examples include `phase7bWorkPackage2ReferenceIndex` (expects 39 collections, the base has 41) and `HealthKitStrategicReadBoundary` (two unrelated Workout files missing from the allowlist at base).
- **Not changed here:** the Sleep boundary is enforced by its own green quarantine test instead of relying on that already-red test.

**HealthKit ingest and Activity/Nutrition/Cardio/Strength regression**
- These suites all pass except the pre-existing base failures listed above: `src/application/native`, `src/application/commands`, `src/domain/services/HealthKit*`, `src/platform/operations/HealthKit*`, and `src/platform/database`.
- The existing `ingestHealthKitObservations` path is byte-unchanged.

**Other checks at e1e56be6**
- **Production build:** `npm run build -- --webpack` with `PHYSIQUEOS_GIT_SHA=e1e56be6…`, `PHYSIQUEOS_BUILD_ID`, `PHYSIQUEOS_PROVIDER_ISOLATED_BUILD_ROOT`, and `NEXT_PHASE=phase-production-build`. Result: **exit 0**. The only warnings were about the NO_COLOR/FORCE_COLOR environment.
- **Lint:** `eslint` on every changed file is clean.
- **Diff:** 28 files, 3,119 insertions and 4 deletions, mostly tests. There are no migrations and no deletions of existing behavior.

**Not run**
- Postgres integration against a live database. The scoped read's SQL is unit-asserted, and the index is verified from the migration.
- Any production read or write.
- Native tests (no Native work).
- Playwright or simulator runs (not applicable).

## 11. Fresh architecture review

An independent fresh-context reviewer (a read-only subagent) did three rounds against requirements 1–10 of the prompt. It used scratch probes plus its own randomized harness, which checks after every batch that the stored days equal a fresh canonicalization.

**Round 1 (f039fbcd)**
- **Blocker:** a zero-length asleep sample crashed lane ranking. That would wedge the batch and cause infinite Native retries.
- **Should-fix:**
  - The recompute range was too narrow: a long sample merging into an earlier day's episode left a stale day and double counting.
  - The per-device `com.apple.health.<UUID>` identifier was persisted and copied into day records.
  - Timestamp parsing was lenient: zone-less values were read in the Server's own zone.
  - The Sleep read boundary relied on a test already failing at base.
- **Nits:**
  - tier reason label
  - in-bed counted in two episodes
  - in-batch duplicate outcome
  - no recompute on a preference change
  - tombstone growth
  - logger now redacts all `sleep*` keys
  - silent recompute cap
- **Fixed in b52aaf4d:** all of the above except the documented nits below. The Sleep boundary got its own green quarantine test with widened needles; the pre-existing red test was not repaired.

**Round 2 (b52aaf4d)**
- The blocker is confirmed closed: no throw on any contract-valid input across 900+ fuzz runs.
- **Should-fix:** stale days remained under mixed zones ≥12 h apart, and in-bed-only suppression was not tracked.
- **Fixed in 09a6f441:**
  - the closure is also seeded from stored day records, and days carry `inputSampleDays`
  - `touch` is widened ±2
  - suppressed in-bed samples are episode inputs
  - `recomputeTruncated` is reported
  - calendar-date and hour checks are strict

**Round 3 (09a6f441)**
- **Should-fix:** 24 h samples chained across a ≥16 h zone gap could still be truncated at the load edge.
- **Fixed in e1e56be6:** a ±3 load margin, and an edge is any bucket within 2 days of the loaded edge.

**Final (e1e56be6).** Reviewer fuzz, 150 runs each, 0 failures in every case:

| Zones | Samples | Failures |
|---|---|---|
| LA (control) | 24 h | 0 |
| LA+Tokyo, seed 3 | 24 h | 0 |
| LA/Kiritimati/Pago Pago/UTC, seed 7 | 24 h | 0 |
| LA/Kiritimati/Pago Pago/UTC, seed 99 | 24 h | 0 |

- No throws, and the recompute cap was never hit.
- My own local heavy fuzz (450 worlds, 24 h samples, extreme zones, not committed) also passed.
- **Reviewer verdict: no remaining blockers or should-fix items.**

**Requirement verdicts (final)**

| Requirement | Verdict |
|---|---|
| No backfill | PASS |
| No whole-collection scan (scoped reads, existing index, no migration) | PASS |
| Deterministic, policy-driven precedence (not hard-coded to Oura) | PASS |
| No double counting | PASS |
| No strategic leak | PASS |
| No private metadata leak | PASS (after normalization) |
| Deletion/revision convergence | PASS |
| Timezone/DST | PASS |
| Future Evidence model supported without prescribing UI | PASS |
| No change to existing ingestion/manifest | PASS |

**Documented, not changed**
- **Preference change:** a change to the preference policy does not recompute existing days. Each day stores `sourcePreference.digest`, so the mismatch is detectable. A future activation runner should recompute a bounded window when the preference is written.
- **Tombstones:** stored for any unknown deleted UUID (identity only). Phase B should forward only deletions from the Sleep anchored query after activation.
- **Log redaction:** the logger now redacts every key containing `sleep`, `sourcename` or `devicename`. This is safer, but it is a global behavior change. No existing log call uses such keys.
- **Shared Watch lane:** two Apple Watches would share one `com.apple.health` lane; overlaps are resolved by the within-lane precedence.
- **Pre-existing red tests:** the `HealthKitStrategicReadBoundary` and `phase7bWorkPackage2ReferenceIndex` failures at base were left for a separate fix.

## 12. Deployment status

**NOT DEPLOYED.**
- Production mutated: no.
- Policy records written: none.
- Founder Sleep ingested: none.
- Native: untouched.
- TestFlight: no.

Deploying this dormant code later needs Founder authorization. After a deploy, dormancy verification is:
- the served manifest shows `healthKitSleepIngestion.enabled:false`
- a zero-row audit of `healthKitSleepSamples` and `healthKitSleepDays`

## 13. Phase B Native requirements (exact)

**1. Gate**
- Add `.sleepAnalysis` to the automatic coordinator streams **only while** `manifest.healthKitSleepIngestion.enabled == true`. Otherwise stay `.localOnly`.
- Re-check the manifest before each Sleep upload cycle.

**2. Query**
- Query all category values, not only `allAsleepValues`.
- Use an anchored query with `activationFloor` (from the manifest) as a `.strictEndDate` floor on sample end. Enforce the floor twice: in the query and in the engine.
- Use a new cursor namespace, for example `healthkit-automatic-sleep-v1`.
- Register an explicit observer for the sleepAnalysis type at launch, with a test so it never repeats the Nutrition zero-types gap.
- Delivery frequency: `.hourly`.

**3. Wire sample (exactly these keys)**
- `externalId`: `uuid.uuidString.lowercased()`
- `categoryValue`: raw Int
- `startedAt`, `endedAt`: ISO-8601
- `timeZone`: the `HKMetadataKeyTimeZone` value if present, else the device zone
- `timeZoneSource`: `sample_metadata` or `device_at_ingest`
- `wasUserEntered`: from `HKMetadataKeyWasUserEntered`, default false
- `source.bundleIdentifier`: `sourceRevision.source.bundleIdentifier`
- `source.sourceVersion`: `sourceRevision.version`
- `source.productType`: `sourceRevision.productType`
- **Never send** `sourceName`, `HKDevice`, or any metadata dictionary. The Server rejects the whole request if you do.

**4. Deletions**
- Send `deletions[{externalId}]` for `HKDeletedObject`s from the Sleep anchored query, in the same or a separate batch.

**5. Window manifest**
- At most every 12 h, on foreground, re-read Sleep samples ending in about the last 3 sleep days (≤96 h) with a plain sample query.
- Send `windowManifest{windowStart, windowEnd, liveExternalIds}` with **every** source's UUIDs.
- The window start must be ≥ `activationFloor`. The Server also enforces this.

**6. Limits**
- ≤100 samples, ≤100 deletions, ≤1000 manifest IDs, ≤1.5 MiB per request.
- `Idempotency-Key` = the existing partition identity.

**7. Responses**
- `200`: per-sample outcomes, which are:
  - `stored`, `replayed`
  - `refused_identity_conflict`: permanent for that sample; log the digest only, no retry
  - `refused_before_activation_floor`, `refused_after_activation_window`
  - `deleted_before_arrival`
- `409 HEALTHKIT_SLEEP_INGESTION_NOT_ENABLED`: disabled. Keep staged changes, do **not** advance the cursor, and re-check the manifest. This is not a permanent rejection.
- `400 HEALTHKIT_SLEEP_PRIVATE_FIELD_REJECTED` / `HEALTHKIT_SLEEP_CONTRACT_INVALID`: a contract bug.

**8. Local state**
- Bound `deferredChanges` before any Sleep query is enabled.
- Add a `protectedDataDidBecomeAvailable` bootstrap trigger.
- Do not relax file protection.

**9. Out of scope for Native**
- No notifications, no Log dependency, and no UI in Phase B.

## 14. Remaining decisions

- **D1:** Founder start sleep day D0 and zone for the activation policy, plus mode. Recommended: `validation_only` for 2–3 nights, then `operational`. This is needed before Phase C only.
- **Source preference write:** the Founder selected Oura. Write `preferredSources:[{sourceFamily:"oura"}]` when Phase C is authorized; it needs a runner or an operation.
- **Deploy authorization** for this dormant Server code, which can ship with any later Server deploy.
- **D3 (optional):** a bounded historical read for design validation. Not implemented, and the floor forbids it by design.
- Nap labels (D4) and Evidence layout are deferred to Phase D/E by design.

## 15. Recommended next prompt

> "HealthKit Sleep Phase B: implement the dormant Native Sleep read path against Server contract `healthkit-sleep-ingestion-v1` (report 20260930T180653Z-healthkit-sleep-phase-a-server-foundation.md §13), gated on manifest `healthKitSleepIngestion.enabled`, with activation-floor anchored query, deletions, 12 h window manifest, bounded deferredChanges, explicit observer mapping, and unit tests with a fake store. Build only; no upload, no policy write. In parallel (Server), prepare but do not run a guarded activation/preference policy runner for Founder D0 + Oura, and include this Phase A branch in the next authorized Server deploy (dormant)."

## 16. Local-only state

- **Nothing unpushed.** All code is on the candidate branch.
- Scratch-only, deleted with the job:
  - two throwaway checkouts (base 372c306b and the candidate) used for the regression and build comparisons
  - build and test logs
- No private Founder data, exports or harnesses exist locally.

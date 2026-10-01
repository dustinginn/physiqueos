# HealthKit Sleep canon v2 correctness candidate

- Task: `sleep-canon-v2-correctness`
- Prompt: `agent-handoffs/inbox/prompts/20260930T221500Z-sleep-canon-v2-correctness.md`
- Status: **CANDIDATE COMPLETE — NOT DEPLOYED; prospective Sleep remains OFF**
- Repository: `PhysiqueOS/native-production-read-foundation`
- Branch: `codex/healthkit-sleep-canon-v2-20260930`
- Exact candidate commit: **`133d838eac81b0b02da392d88b28d0eea4779706`**
- Production authority: **`08aeecdeb9f02e311efa2cd037940fbf0b249bb7`**, build `physiqueos-08aeecde-20260930`
- Native authority inspected: Build 73 source **`0591267480a4e1ece98e7855ecaecfdbb4dc8944`**

## Outcome

The Server candidate implements `sleep-canon-v2`, resolves the 11 real Oura duplicate-copy nights without stage blending, preserves the old v1 implementation for immutable audit comparison, and fixes the guarded prospective runner so an equal or later D0 can safely follow the historical window.

Authority was reverified by `/api/v1/health/live` (exact build ID), `/ready` (200), and the console entrypoint's exact runtime-SHA gate. The saved audit-only `doctl` context returned 401, so the provider deployment list itself was not independently refreshed; the accepted console transport used its separate scoped context and all runtime/database identity gates passed.

The exact 2,878-sample production validation replay passed the required zero-write and quarantine checks. No Server deploy, Native upload, policy apply or prospective activation occurred.

## Oura synchronization-metadata investigation

The retained historical payload cannot identify a source-declared Oura revision:

- The Server Sleep wire allow-list retains the HealthKit UUID, category/stage, start/end instants, timezone provenance, user-entered flag, bundle identifier, source version and product family. It rejects arbitrary `metadata` and device identity fields.
- Build 73 can access `HKSample.metadata`, but its Sleep mapper deliberately retains only timezone provenance and `HKMetadataKeyWasUserEntered`; the Sleep wire model has no sync identifier/version fields and sends an empty arbitrary-metadata allow-list.
- Therefore the 2,878 already-stored validation records cannot prove whether Oura supplied a stable `HKMetadataKeySyncIdentifier` / `HKMetadataKeySyncVersion`, nor whether such values would identify the copy Oura currently considers authoritative.

A minimal Native contract extension would be technically possible only after a dedicated on-device probe proved those exact keys exist and are stable. Broad metadata ingestion would violate the existing privacy contract. Because the Server-only rule below is deterministic and passed the real replay, **no Native change is required or proposed for this candidate**.

## Selected sleep-canon-v2 rule

Source preference and technical lane selection still happen first. Within the selected source lane only:

1. Specific sleep stages and Awake intervals are deterministically partitioned into coherent non-overlapping copy candidates. Two stable equal-start orderings are evaluated to avoid making an arbitrary interval-coloring tie decide the night.
2. Genuine non-overlapping complementary intervals remain in one copy. Unspecified sleep may remain an envelope around specific stages.
3. Candidate copies rank by technical usability, asleep coverage, staged coverage, resolved coverage, sample count, stable content signature, then stable ID tie-break.
4. Exactly one selected copy supplies asleep, stage, Awake and timeline totals. When duplicate-copy resolution applies, the matching in-bed candidate is selected independently by the same deterministic principles.
5. Other copies remain in `corroboratingSampleIds`; all observations remain in the input digest so late arrivals, revisions and deletions still trigger deterministic recomputation.
6. No cross-source filling or cross-copy stage blending occurs.

`algorithmVersion` and the parameter digest advance to `sleep-canon-v2`; the day schema stays `healthkit-sleep-day-v1`. `canonicalizeHealthKitSleepV1` remains available only for historical comparison; production recomputation uses v2.

## Adversarial tests and review

The required synthetic matrix covers:

- exact duplicate UUID-distinct copies;
- shifted near-duplicates;
- complete plus partial copies;
- complete copies with conflicting stages;
- three copies;
- legitimate complementary samples;
- stage copies plus an in-bed envelope;
- Awake disagreement;
- Oura preference before within-lane selection and a competing Watch lane;
- selected-copy deletion and deterministic remaining-copy fallback through the real ingest port;
- late arrival of a more authoritative copy;
- out-of-order convergence;
- v1-equivalent semantics when no duplicate exists;
- no asleep/stage/timeline double count;
- selected and corroborating provenance.

Runner tests cover equal D0, later D0, earlier refusal, zone mismatch, overlap refusal, malformed historical anchor refusal, a closed historical run, and the unchanged strict-future guard.

Exact candidate verification:

| Check | Result |
|---|---|
| All seven Sleep test files | **111/111 passed** |
| Changed-file ESLint | **passed** |
| Audit payload build | **passed** |
| Production Next build | **passed** (19 existing NFT tracing warnings) |
| `git diff --check` | **passed** |

The repository-wide unit command was also run. It is not globally green in this authority checkout: 314 tests and 5 suites failed across missing private Founder fixtures, production-state/diff guards, legacy parity expectations and sandboxed socket/process tests. The focused Sleep suite above is green, and no Sleep test failed in the full run.

Fresh review included a replay-driven adversarial pass. A proposed one-second copy-boundary tolerance made the historical result worse (9/11 v1-stable affected nights), so it was removed before the final candidate. Exact overlap remains the candidate rule. No remaining Sleep correctness blocker was found.

## Exact 2,878-sample zero-write replay

The final replay bundled candidate source from `133d838e` while enforcing deployed runtime SHA `08aeecde`. It ran through the accepted console transport inside `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, verified `transaction_read_only = on`, rolled back, emitted its single success marker and exited remotely with status 0.

Sanitized result:

| Check | Result |
|---|---|
| Isolated validation samples | **2,878** |
| v1 / v2 canonical nights | **30 / 30** |
| Oura primary and technically usable | **30 / 30** |
| Fully staged / with Awake / with in-bed | **30 / 30 / 30** |
| Duplicate-copy nights | **11** |
| Candidate copies | **8 nights with 2; 3 nights with 3** |
| Resolved to one selected copy | **11 / 11** |
| Selected copy conflict-free | **11 / 11** |
| Selected totals independently reproduced within ±2%/rounding | **11 / 11** |
| Unaffected nights semantically equivalent to v1 | **19 / 19** |
| Stage sum equals asleep | **30 / 30** |
| Ordinary Sleep samples / days | **0 / 0** |
| Strategic leakage | **0** |
| Record-store mutations | **0** |

### Sanitized v1 versus v2 comparison

V2 changes the fields expected from removing blended copies:

- Awake changed beyond tolerance on 9 affected nights.
- Core changed on 8, Deep on 9 and REM on 8.
- In-bed and unspecified changed on 0.
- Total asleep stayed within ±2% of v1 on 10/11 affected nights.

The remaining affected night is defensible rather than a correctness failure: v1 measured the blended union, while v2 selects one internally consistent copy. That selected copy is conflict-free and every reported total was independently reproduced from its selected provenance within tolerance. The candidate does not claim agreement with the Health or Oura UI.

## Prospective D0 runner fix

Historical validation no longer binds prospective activation forever to its original D0. The candidate now enforces:

- same historical/prospective timezone;
- prospective D0 equal to or later than the historical anchor;
- prospective floor at or after the historical validation end instant;
- no overlap even when the historical run is closed;
- a later uncovered gap is allowed;
- the activation floor must still be strictly future;
- `historicalBackfill` remains `false`.

Malformed historical anchor facts fail closed before date comparison.

## Prepared D0 facts — dry run only

Recommended next clean D0: **2026-10-04, America/Los_Angeles**, conditional on deployment and separately authorized activation occurring while its floor is still safely future.

The exact candidate dry run passed without applying anything:

- mode: `validation_only`
- D0: `2026-10-04`
- activation floor: `2026-10-04T01:00:00.000Z` = 2026-10-03 18:00 PDT
- open-ended: true
- planned record digest: `858032d05fd52dd5dddc1f459978f627`
- observed facts: ordinary samples 0, ordinary days 0, validation samples 2,878
- outcome: `dry_run`
- remote exit: 0

These facts are preparation evidence, not reusable authorization. The dry run must be repeated immediately before any separately authorized apply; if the strict-future guard no longer passes, advance D0 rather than weakening the guard.

## Quarantine, deployment and next decision

- Prospective activation policy: **absent / OFF**.
- Served prospective capability: **disabled**.
- Historical samples remain isolated and strategically quarantined.
- No Sleep data was added to Evidence, V3, Briefings, Confidence, Goals, analyses or canonical HealthKit days.
- Server deployment: **NOT DEPLOYED**.
- Native upload/change: **NONE**.
- Required next authorization: review and deploy Server candidate `133d838e`; prospective activation remains a separate later decision.

Rollback is trivial while unshipped: production remains at `08aeecde`. If deployed later, revert the candidate commits and redeploy the prior authority; no schema migration or DDL is involved.

## Local-only/privacy state

No raw Founder Sleep sample, timestamp, UUID, bundle value or per-night duration was exported or committed. Temporary bundled audit and dry-run payloads remain outside the repository and contain code only. No credentials were printed or added. The worktree has no uncommitted candidate changes at report creation time.

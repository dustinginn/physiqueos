# Production deploy: Photo Intelligence `446bc964`, deployed and verified

- **Authorization:** `agent-handoffs/inbox/decisions/20260929T170500Z-photo-intelligence-guarded-production-deploy.md`.
- **Reviewed candidate:** `dd05ef2ba619bf4f11e0f77c1e33bda4d1215b45` on `codex/photo-intelligence-canonical-holistic-20260929`.
- **Deployed integration descendant:** `446bc964dc31318ea48261400e8b243cdd1d4ab1` on `combined-app-platform-cutover`.
- **Status:** DEPLOYED and verified.
- **Scope:** Server only. No Native/TestFlight, auth, peptide, schema, migration, historical regeneration, or production-data mutation.

## Why an integration descendant was required

The first exact-candidate force rebuild (`04d07bab-fca0-44f2-aeee-09c7ca9e746d`) was stopped by the provider artifact privacy gate before any deploy step. Four accumulated control-plane reports in the candidate tree contained a protected owner identifier. Production remained on the prior healthy deployment throughout.

`446bc964` is a direct child of `dd05ef2b` and deletes only those four unrelated control-plane reports (388 deleted lines). The complete `src/`, test, Photo Intelligence artifact, dependency, lockfile, schema, migration, infrastructure, and Native trees are byte-identical to the reviewed candidate. A fresh-context review approved the descendant for deploy.

## Authority

| | Before | After |
|---|---|---|
| Web and worker source SHA | `98534bf8e91dd48da62fc807beae5d14c282aa04` | **`446bc964dc31318ea48261400e8b243cdd1d4ab1`** |
| App Platform deployment | `ab7fe481-abd9-4334-bfcd-f224560bb801` | **`3e87b8a7-8af6-4280-9cfd-b7437ff5f995`** (`ACTIVE`, 9/9) |
| Production branch | `98534bf8e91dd48da62fc807beae5d14c282aa04` | **`446bc964dc31318ea48261400e8b243cdd1d4ab1`** |
| Runtime build ID | `physiqueos-98534bf8-20260929` | **`physiqueos-446bc964-20260929`** |
| Schema | `PROVIDER_MIGRATION_000014_APPLIED` | unchanged |

The app specification changed only four values: `PHYSIQUEOS_GIT_SHA` and `PHYSIQUEOS_BUILD_ID` for web and worker. The automatic spec deployment was canceled in favor of the required manual force rebuild. No other deployment remained in progress after activation.

## Exact-SHA gates

- Focused Photo Intelligence suite: **99/99 passed** across 12 test files.
- Targeted ESLint: passed.
- Exact-SHA production build: passed.
- Fresh, provider-full-runtime build: passed.
- Provider artifact privacy scan: **4,043 files, 88,683,895 bytes, zero violations**.
- Source-scoped diff check: passed.
- Fresh-context review: approved with no findings.
- Frozen blind artifacts remained byte-identical:
  - Case 1 SHA-256: `52f45d6261b81528873c62575eee40117709fd7d63fdc69e1d9965472aba3a7d`
  - Case 2 SHA-256: `255249d13d49f6e99c261bf283f161ee7cce88a6c5064954d2c0623657899f03`

## Post-deploy verification

### Health and source parity

- `/api/v1/health/live`: HTTP 200, `status: ok`, build `physiqueos-446bc964-20260929`.
- `/api/v1/health/ready`: HTTP 200, `status: ready`; all nine checks ready.
- Readiness retained schema code `PROVIDER_MIGRATION_000014_APPLIED`.
- App Platform reports exact source commit `446bc964dc31318ea48261400e8b243cdd1d4ab1` for both web and worker.
- GitHub `combined-app-platform-cutover` resolves to the same exact SHA.
- The running web container reports the same SHA and build ID.

### Running contract markers

A read-only scan of `/app/.next/server` found the deployed canonical and safety contracts:

| Marker | Matching compiled files |
|---|---:|
| `canonical_photo_intelligence_set_v1` | 1 |
| `canonical_photo_intelligence_v1` | 1 |
| `availability_unknown` | 1 |
| `nonPhotoEvidenceUsed` | 1 |
| `Canonical Photo Intelligence must remain photo-only.` | 1 |

These confirm the canonical set/item producer, time-causal unknown-availability fail-closed behavior, and photo-only isolation are present in the running artifact. No production Photo Intelligence replay or historical briefing regeneration was executed.

### Historical immutability and zero unintended drift

Before and after deployment, the same audit ran inside a repeatable-read, read-only database transaction and rolled back. Excluding the expected runtime SHA/build fields, the complete snapshots are **exactly identical**:

- all **41** populated canonical collection groups: row counts and payload/version digests unchanged;
- every command-receipt type: counts and digests unchanged;
- relationships: 7,446 rows, digest `91b326c4942ee95e9aa21d7de893f2e7`;
- media: 701 rows, digest `4f591b894c66a73c728d0e713dbbeb48`;
- migrations: 14 rows, latest `000014_evidence_intake_text_provenance`.

Key immutable histories also match exactly:

| Collection | Rows | Digest |
|---|---:|---|
| Daily briefings | 54 | `8f05fc402a55c5091ebe59b7e7fd5674` |
| Progress photos | 49 | `8cead3c0288a3e1eae14a9e88f99baa6` |
| Canonical evidence objects | 578 | `16d557b7409962de7db42e40b39dd273` |
| Analyses | 413 | `0a24a332cabb2185e77afde596a13355` |

Result: historical Photo Intelligence inputs/results and existing briefings were not mutated, and there was zero unintended production data drift.

## Rollback

Fast-forward or restore the production branch to `98534bf8e91dd48da62fc807beae5d14c282aa04`, restore the four web/worker SHA and build stamps, and force rebuild. There is no schema or data rollback because this deployment changed neither.


# HealthKit Sleep Phase C: dormant Server deployed, Build 73 VALID (stopped before D0)

- task.id: `healthkit-sleep-phase-c-historical-validation-and-rollout-20260930`
- prompt: `agent-handoffs/inbox/prompts/20260930T193000Z-healthkit-sleep-phase-c-historical-validation-and-rollout.md`
- Founder authorization (chat, 2026-09-30):
  - "Deploy Server candidate 08aeecde dormant to production now."
  - Upload Build 73 only if dormancy acceptance passes.
  - Stop before choosing D0 or opening the historical-validation window.
- status: **waiting for the Founder's D0 decision.** Sleep remains fully inert:
  - No prospective activation.
  - No Oura preference written.
  - No historical-validation window opened.
  - No Founder Sleep read.

## 1. Server deployment

| Item | Value |
|---|---|
| Production SHA | **`08aeecdeb9f02e311efa2cd037940fbf0b249bb7`**. `combined-app-platform-cutover` fast-forwarded 372c306b → 08aeecde. |
| Deployment | **`1e7d28e6-b142-4d8c-9fac-96dd1498ffd8`** (cause manual, force-rebuild), ACTIVE 20:02Z. It supersedes `01d9c20f`. |
| Spec change | Exactly 4 stamp lines (web and worker `PHYSIQUEOS_GIT_SHA` / `PHYSIQUEOS_BUILD_ID`). Every other env var is unchanged, including the closed enrollment state. |
| Contents | 372c306b + Phase A dormant Sleep foundation (e1e56be6) + Phase C historical-validation lane, guarded Sleep policy runner and zero-write Sleep audit (db73036a, 08aeecde). No migration or DDL. Auth, pairing, Photo Intelligence and migration 000015 are untouched. |
| Pre-deploy validation | Full unit suite failure set identical to 372c306b (304 pre-existing); production build exit 0; fresh review with no remaining blockers or should-fix. |

## 2. Dormancy acceptance: **PASSED**

**Source and runtime**
- `source_commit_hash` is 08aeecde on **both** web and worker.
- Log envelope `gitSha` is 08aeecde on **both** web and worker.
- `/api/v1/health/live` returns 200 with buildId `physiqueos-08aeecde-20260930`.
- `/api/v1/health/ready` returns 200.

**In-database probe.** It ran through the accepted read-only console runner (tooling SHA 4025f175) on `web`, in a `REPEATABLE READ READ ONLY` transaction with `transaction_read_only = on`. It used the exact 08aeecde modules and exited remotely with 0 and the success marker.
- **Served manifest** (computed with the same `withHealthKitSleepCapability` function and owner readers the endpoint uses):
  - `healthKitSleepIngestion.enabled = false`
  - `healthKitSleepHistoricalValidation.enabled = false`
  - Both Sleep commands are listed in `writes`.
- **Operational ingest:** `healthkit.sleep.ingest.v1` is refused with **409 `HEALTHKIT_SLEEP_INGESTION_NOT_ENABLED`**.
- **Historical validation:** `healthkit.sleep.historical-validation.ingest.v1` is refused with **409 `HEALTHKIT_SLEEP_HISTORICAL_VALIDATION_NOT_ENABLED`**.
- **Policies:** activation, source preference and historical validation are all **absent** and disabled.
- **Counts:** `healthKitSleepSamples` = **0**, `healthKitSleepDays` = **0**, `healthKitSleepValidationSamples` = **0**.
- **Strategic leakage:** `canonicalEvidenceObjects`, `evidencePackages`, `evidenceReviews`, `dailyBriefings`, `goalConfidenceSnapshots`, `goalConfidenceHistory`, `analyses` and `healthKitCanonicalDays` all show **0** Sleep-shaped records.
- **Record-store mutations: 0.**

**Notes**
- Historical artifacts: this deploy has no migration and no writer outside the two refused Sleep commands and the not-yet-run runner, so no historical artifact could change.
- The first probe run's wrapper exited 1 only because of a local `NO_COLOR`/`FORCE_COLOR` Node warning on stderr; the remote exit was 0 with the marker. A clean re-run with the variable unset passed (exit 0).
- The probe was a scratch bundle of the reviewed modules; it is not committed.

## 3. Native Build 73: **UPLOADED, VALID**

| Item | Value |
|---|---|
| Source | `claude/healthkit-sleep-phase-c-native-20260930` @ **`0591267480a4e1ece98e7855ecaecfdbb4dc8944`**. This is Build 72 (27910310) + Phase B dormant Sleep (62d6b01b) + the Phase C Founder-only historical-validation diagnostic (4256f591, 7052279e) + the build bump. |
| Build | 1.0 (73), bundle `com.physiqueos.native.dev` |
| Archive | Xcode `xcodebuild archive` → `~/Library/Developer/Xcode/Archives/2026-09-30/PhysiqueOS-Build73.xcarchive` (retained) |
| Upload | Guarded tool (Xcode `-exportArchive`, API key): dry run passed every guard, then `--execute`. |
| Delivery | **`32e7ff54-bc9d-423d-a8b6-e8096f51a9e8`**, processing state **VALID**. `last-uploaded-build` = 73. |
| dSYM | 26B103AE-5C44-3E14-B907-8AC4571CFC69 |
| Validation | Full `PhysiqueOSTests` 1632/1633 (the single failure is the known date-dependent Peptide sandbox test in untouched code); Release compile passed; fresh review with no blockers. |

**Installed behavior:** inert.
- The ordinary Sleep gate stays off because the manifest reports disabled.
- The historical-validation button in the Founder canary reports "Not authorized" and does nothing.
- Build 72 persistent pairing, Build 71 background Strength reconciliation, and photo inspection are unchanged.

## 4. Next (requires Founder decisions; nothing has been run)

**1. Founder chooses D0** (the prospective start sleep day), in America/Los_Angeles unless changed.
- The runner refuses any D0 whose floor, (D0−1) 18:00, is not strictly in the future.

**2. Guarded operations** (bundle, dry-run, then apply with the dry-run facts and an authorization reference), in this order:
- `set-source-preference` (Oura, through the generic record)
- `open-historical-validation --effective D0` (window D0−30…D0−1, run id `hv-<D0>-30d`)
- Build each with `node scripts/operations/buildHealthKitPayload.mjs --kind sleep-policy ...`.

**3. On device, Founder canary:**
- Enable the canary, then request authorization.
- Tap "Check Server window", then "Run historical Sleep validation".
- The screen shows counts only.

**4. Zero-write shape audit** (`--kind sleep-audit --audit-kind historical-shape`), sanitized. Then publish the Evidence-design handoff.

**5. Prospective activation** (`activate-prospective --effective D0 --sleep-mode validation_only`) runs **only** on separate explicit Founder authorization. After it: foreground once, observer/floor acceptance, then 2–3 nights of transport acceptance.

**Rollback**
- Server: fast-forward-safe revert, then push 372c306b with the 4 stamps restored, then force-rebuild. Everything Sleep-related is inert, so rollback is low-risk.
- Native: Build 72 remains available in TestFlight.

## 5. Local-only state

- None unpushed.
- The Build 73 archive is retained locally, as required.
- Scratch probe and deploy spec live in the job folder only.
- The prepared deploy spec contains no secrets.
- No Founder data was read.

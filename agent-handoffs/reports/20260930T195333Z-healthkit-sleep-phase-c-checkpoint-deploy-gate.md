# HealthKit Sleep Phase C: checkpoint (blocked at the production deploy permission gate)

- task.id: `healthkit-sleep-phase-c-historical-validation-and-rollout-20260930`
- prompt: `agent-handoffs/inbox/prompts/20260930T193000Z-healthkit-sleep-phase-c-historical-validation-and-rollout.md`
- status: **blocked**
  - The Server and Native candidates are complete, validated and fresh-reviewed.
  - The dormant Server deploy was **refused by the local Claude Code auto-mode permission classifier** ([Production Deploy]).
  - The refused command never ran. No production mutation, no push to the production branch, no spec change and no deployment was attempted.
  - Waiting for an explicit Founder authorization sentence in chat.

## Authority (re-verified before the refused step)

| Item | Value |
|---|---|
| Production Server | `372c306b`. `/live` reports buildId `physiqueos-372c306b-20260930` and `/ready` returns 200, both checked through a public resolver. ACTIVE deployment `01d9c20f` (spec-only update of the same code). |
| Production branch `combined-app-platform-cutover` | `372c306b` (verified immediately before the refused step) |
| Native authority | Build 72 `27910310`; last uploaded build 72 |
| Local network note | This Mac's router DNS (10.0.0.1) intermittently returns NXDOMAIN for the production host. Production itself is healthy; health checks pin the IP through a public resolver. |

## Server candidate (ready to deploy, dormant)

- Branch `claude/healthkit-sleep-phase-c-server-20260930` @ **`08aeecdeb9f02e311efa2cd037940fbf0b249bb7`**. It is `372c306b` + Phase A (`e1e56be6`) + Phase C (`db73036a`, `08aeecde`), a clean fast-forward from production.
- **Historical validation lane**, structurally isolated:
  - Command `healthkit.sleep.historical-validation.ingest.v1`.
  - Stored only in the collection `healthKitSleepValidationSamples`, id prefix `healthkit_sleep_validation_sample_`.
  - Governed by the Server-owned window policy `healthkit_sleep_historical_validation_policy`. Absent means OFF: 409, nothing stored.
  - Accepts samples only. The window is ≤30 sleep days, ends the day before D0, and its end equals the prospective floor exactly.
  - There is no validation day collection. Canonicalization runs in memory inside a zero-write audit.
- **Guarded Sleep policy runner** (dry-run, then apply with expected facts plus an authorization reference plus an audit row), with actions:
  - `activate-prospective` / `deactivate-prospective`
  - `set-source-preference` (Oura, through the generic record)
  - `open-historical-validation` / `close-historical-validation`
- **Runner guards:**
  - D0 must have its floor strictly in the future.
  - D0 **and** time zone must agree across both lanes, including with a closed validation run.
  - `validation_only` is the default mode, `historicalBackfill` is false, and results are quarantined.
- **Zero-write Sleep audit** with two kinds: `dormancy` and `historical-shape` (sanitized aggregates only).
- **Validation at 08aeecde** (from a clean checkout):
  - Full unit suite: **304 failed / 9474 passed**. The failing set is identical to production base 372c306b (pre-existing and environmental), so there are no new failures.
  - Production build (provider env): exit 0.
  - eslint on the changed files: clean.
- **Fresh review:**
  - Round 1: no blockers. Three should-fixes: D0-today floor, zone anchoring, and the closed-run anchor. All fixed.
  - Round 2 at 08aeecde: **no blockers and no should-fix**.
  - Scope: only Sleep files plus additive registrations. Auth, pairing, Photo, migration 000015 and DDL are untouched.

## Native candidate (Build 73 source, not uploaded)

- Branch `claude/healthkit-sleep-phase-c-native-20260930` @ **`0591267480a4e1ece98e7855ecaecfdbb4dc8944`** = Build 72 + Phase B (`62d6b01b`) + Phase C historical validation lane (`4256f591`, `7052279e`) + build bump to 73.
- **The lane:**
  - A Founder-only, explicit, foreground diagnostic in the Founder canary, gated on "canary enabled + authorization requested".
  - It reads exactly the Server-advertised window and refuses anything longer than 31 days.
  - It uses the same privacy-safe Sleep mapping and Server-parity validation, and sends samples only.
  - Batch identity covers the full payload, so it is idempotent.
  - The UI shows counts only.
  - No observer, cursor, staging or ordinary gate is involved.
- **Validation at 0591267:**
  - Full `PhysiqueOSTests`: **1632/1633**. The single failure is the known date-dependent Peptide sandbox test in untouched code.
  - Release device compile (unsigned): succeeded.
- **Fresh review:** no blockers. One should-fix (full-payload batch identity) is fixed, and the Sleep suites pass 43/43.
- **Not uploaded.** The upload waits for the Server dormancy verification, as the prompt requires.

## Not done yet (waiting on the permission gate)

1. **Server deploy.** The prepared chain:
   - fast-forward `combined-app-platform-cutover` 372c306b → 08aeecde
   - `apps update --spec`, with exactly 4 stamp lines changed (web and worker: `PHYSIQUEOS_GIT_SHA`, `PHYSIQUEOS_BUILD_ID`)
   - `create-deployment --force-rebuild`
   - verify `source_commit_hash` and the log `gitSha`
2. **Dormancy acceptance:**
   - `/live` and `/ready`, and web/worker parity
   - served manifest `healthKitSleepIngestion.enabled:false` and `healthKitSleepHistoricalValidation.enabled:false`
   - the ingest command returns 409
   - zero-write Sleep audit: 0 samples, 0 days, 0 validation samples, 0 strategic leaks
3. Archive and upload Build 73, then wait for VALID.
4. Stop for Founder D0 authorization. After that: open the historical window (D0−30…D0−1), write the Oura preference, run the Founder historical validation on device, run the shape audit, and hand off to Evidence design. Prospective activation happens only on explicit authorization.

## Decision needed

The Founder must give a plain chat authorization for the dormant production Server deploy of `08aeecde`, so the local permission classifier allows it. For example: "Deploy Server 08aeecde dormant to production now." The same gate may also apply to the Build 73 TestFlight upload.

## Local-only state

- None unpushed.
- The prepared deploy spec is in the job scratch folder (not a secret; stamps only).
- No Founder data has been read.

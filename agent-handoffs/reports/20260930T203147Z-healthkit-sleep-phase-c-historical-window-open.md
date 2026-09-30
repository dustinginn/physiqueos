# HealthKit Sleep Phase C: Oura preference + Sep 1–30 historical window OPEN; waiting for the Founder's device run

- task.id: `healthkit-sleep-phase-c-historical-validation-and-rollout-20260930`
- decision: `agent-handoffs/inbox/decisions/20260930T203000Z-sleep-d0-oura-historical-validation.md`
  - D0 anchor 2026-10-01, America/Los_Angeles.
  - Oura preference.
  - Historical window 2026-09-01…2026-09-30.
  - Prospective ingestion OFF.
- status: **waiting for the Founder** to run the historical validation on the physical iPhone.
  - No historical Sleep has been read.
  - Prospective activation has **not** been run.

## Authority (re-verified before the operations)

| Item | Value |
|---|---|
| Production Server | **`08aeecdeb9f02e311efa2cd037940fbf0b249bb7`**, deployment **`1e7d28e6`** ACTIVE. `/live` reports `physiqueos-08aeecde-20260930`; `/ready` returns 200. |
| Native | **Build 73** (`0591267480a4e1ece98e7855ecaecfdbb4dc8944`), delivery `32e7ff54`: build-status **VALID**, import **VALID**. |
| Pre-operation state | Zero-write audit showed every Sleep policy absent, all Sleep counts 0, strategic leakage 0. |

## Operations applied

Each one was a guarded dry run, then an apply with the dry run's exact facts. The authorization reference was `founder-decision-20260930T203000Z-sleep-d0-oura-historical-validation`.

**1. `set-source-preference` = Oura** (generic record `healthkit_sleep_source_preference_policy`)
- Resolution: `configured:true`, `preferredSources:[{sourceFamily:"oura"}]`.
- Audit row `healthkit_sleep_policy_audit_32676140…`, verified.

**2. `open-historical-validation`** (record `healthkit_sleep_historical_validation_policy`)
- Run `hv-2026-10-01-30d`.
- Sleep days **2026-09-01 … 2026-09-30** (exactly 30).
- Instants `[2026-09-01T01:00Z, 2026-10-01T01:00Z)`, which is Aug 31 18:00 → Sep 30 18:00 PDT.
- `prospectiveEffectiveSleepDay` 2026-10-01. The window ends **exactly** at the future D0 floor.
- `strategicEvidenceEligibility:"quarantined"`, `canonicalProductionHistory:false`.
- The dry run was repeated after step 1 so its expected facts matched production.
- Audit row `healthkit_sleep_policy_audit_30725847…`, verified.

**Not run:**
- `activate-prospective`: the prospective activation policy is **absent**.
- No change to evidence eligibility, readiness, V3, Briefings, Confidence, Narrative, Goals or recommendations.

## Post-operation verification: **PASSED**

A read-only probe used the exact 08aeecde modules through the accepted console runner, in a `READ ONLY` transaction. Remote exit 0 with the marker; 0 mutations.

| Check | Result |
|---|---|
| Source preference | Present, configured, families `["oura"]` |
| Served manifest `healthKitSleepHistoricalValidation` | **enabled**; run `hv-2026-10-01-30d`; window 2026-09-01…2026-09-30 |
| Served manifest `healthKitSleepIngestion` (prospective) | **enabled:false**, `activationFloor:null`; activation policy **absent** |
| Operational `healthkit.sleep.ingest.v1` | Refused, **409 `HEALTHKIT_SLEEP_INGESTION_NOT_ENABLED`** |
| `healthKitSleepSamples` / `healthKitSleepDays` | **0 / 0** |
| `healthKitSleepValidationSamples` | **0**, until the Founder runs the device diagnostic |
| Strategic leakage (Evidence, packages, reviews, Briefings, Goal Confidence snapshots and history, analyses, HealthKit canonical days) | **0** |

## FOUNDER ACTION: exact Build 73 tap sequence

You don't need a Mac, terminal, PAT, re-pairing, Face ID, Health export or manual entry. Stay on the one screen for steps 4–9: the canary settings reset when you leave it.

1. Install or update to **Build 73** from TestFlight, then open PhysiqueOS.
2. Tap the **You** tab, which is the rightmost tab.
3. Tap **Founder device connection**. The page title reads **Founder Production**, and the connection should show as connected.
4. Scroll down to the card headed **HEALTHKIT FOUNDER CANARY**.
5. Turn on **Enable this canary**.
6. Tap **Request Apple Health authorization**.
   - If an Apple Health sheet appears, make sure **Sleep** is allowed, then tap **Allow**.
   - If nothing appears, that's normal: you've already answered before.
7. Keep scrolling past the other canary controls (Activity validation, test day, workout, Sep 23 repair) to the card headed **SLEEP HISTORICAL VALIDATION**. Ignore every other control on this page.
8. Tap **Check Server window**. The **Server window** row must read **Authorized (hv-2026-10-01-30d)**.
9. Tap **Run historical Sleep validation**. It shows **Validating…**; keep the app open and in the foreground until counts appear.
10. Report back the rows shown: **Samples read**, **Samples sent**, **Not representable**, the outcome rows (for example **stored**), and any red error code. They are counts only; no times or values are shown.

**If "Samples read" is 0.** That does not prove you have no Sleep data: iOS hides read denial and returns nothing. Check the permission:
- **Health app → your profile picture (top right) → Apps (under Privacy) → PhysiqueOS → under "Allow PhysiqueOS to Read" turn on Sleep.**
- The same toggle is also at **Settings → Health → Data Access & Devices → PhysiqueOS**.
- Then repeat steps 3–9.

Re-running is safe: identical samples replay without duplicating.

## After the Founder reports (next session steps)

- Verify samples exist only in `healthKitSleepValidationSamples`, and that ordinary Sleep samples and days stay at 0.
- Run the zero-write `historical-shape` audit (sleep-canon-v1 in memory):
  - Oura-first results and fallbacks, and no double counting.
  - Totals, stages, awake, inBed, main/secondary episodes, date attribution, source overlap.
- Report the sanitized shape only; confirm strategic leakage is still 0.
- Publish the Evidence-design handoff (a separate design task).
- Prospective activation needs separate authorization. If 2026-10-01's floor (Sep 30 18:00 PDT) has passed by then, the guard refuses it and I will propose the next clean D0 rather than weaken the guard.

## Queued (non-blocking): Native Founder Production page cleanup

This is accepted for the next Sleep Native candidate. It removes obsolete diagnostic and canary UI:
- Notification diagnostics
- Workout reconciliation diagnostics
- Automatic sync diagnostics
- Sep 23 Activity repair
- Controlled canonical test day
- Workout canary
- Old Activity bounded historical-validation controls
- Generic Activity/Nutrition canary controls

It keeps only:
- the Sleep canary controls needed now
- Founder Production/session status
- Disconnect this production session
- the authority selector, if still required

It preserves every graduated automatic behavior (Activity, Nutrition, Workout, Strength reconciliation, notifications, HealthKit, persistent pairing). This work is starting next and will be reported in a separate checkpoint. It does not affect Build 73 or this validation run.

## Local-only state

- None unpushed.
- Operation payloads, probe outputs and scratch checkouts are in the job folder only; they hold no secrets and no Founder data.

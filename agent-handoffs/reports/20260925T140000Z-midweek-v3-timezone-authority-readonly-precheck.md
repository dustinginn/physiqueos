# Midweek V3 pre-deploy check — recurring-briefing timezone authority (read-only production)

Generated: 2026-09-25 (UTC ~14:00)
Agent: Claude (Midweek Briefing Founder Takeover lane, secondary)
Authorization: Founder-authorized bounded READ-ONLY production check (review finding N1 in `20260925T083000Z-midweek-v3-release-blockers-final.md`).
Candidate under check: Server `092011cc829378c757b827f0cf66d947a5c52271` (branch `claude/midweek-v3-engine-server-20260925`).

## Result: DEPLOYMENT PRECHECK PASS — with one documented, non-blocking caveat

**Effective timezone authority is unambiguous and identical for the scheduler and every generator: `America/Los_Angeles`.** The candidate resolves the same canonical briefing dates/timezone as production `01d1900b`. The literal stored values do NOT both exist (see caveat): `user.timeZone` is unset in production, so the two "agree" only through a shared default. Nothing was deployed; stopping for deployment authorization.

**No writes, no deployment, no policy change, no regeneration, no production mutation.**

## 1. Production authority reverified (control plane, read-only, `--http-retry-max 0`)
- App `bf57cf56-48cc-4cd6-90e4-a23ee5381741`, active deployment `8da160ac-7ae5-4b69-8fd7-342cfff30099` ACTIVE (created 00:39Z, active 00:42Z), no pending / in-progress deployment.
- `web` and `worker` both `source_commit_hash 01d1900bcbb9db32ce270e49c7d24e919ba0d7d7`; `PHYSIQUEOS_GIT_SHA` on both matches; runtime SHA inside the component equalled the control-plane SHA before any DB access.
- Health `/api/v1/health/live` 200, `/ready` 200, before and after. Control plane after the audit: same deployment, same SHAs, no newer deployment.

## 2. Guarded read-only audit (established runner, `physiqueos-final-cutover-config`)
Runner `runAppConsoleContextGzipFile.mjs` (commit `4025f175`, reviewed before use) executed a bounded payload inside the production `web` component per `PRODUCTION_READONLY_ACCESS.md`: runtime SHA check; `PHYSIQUEOS_CANONICAL_OWNER_USER_ID == user_founder_001`; single pooled connection with statement timeout; `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`; **`SHOW transaction_read_only` = `on`** verified before any read; parameterized, LIMIT-bounded, Founder-owner-scoped SELECTs only; explicit `ROLLBACK`; unique success marker printed only after rollback (observed exactly once; wrapper exit 0, empty stderr). No database URL/CA or token was printed, exported, or stored. The DB binding was consumed only inside the component.
Procedure notes (transparency): a first invocation completed remotely but the wrapper failed closed with `RUNNER_STDERR_UNEXPECTED` because my local shell's `NO_COLOR`/`FORCE_COLOR` made Node print a warning to stderr; I re-ran the identical read-only payload once with those two variables unset and it passed cleanly. Before that, a local-only import failure (hollowed `js-yaml` in the bootstrap dir after tmp cleanup) was repaired by copying an intact `js-yaml` 4.3.0 — no production contact, no credential involved.

## 3. Exact stored values (sanitized)
| Record | Field | Stored value |
|---|---|---|
| Founder `user` (`canonical_user_records`, `user_founder_001`) | `timeZone` | **absent** (the only zone-like field is lowercase `timezone` = `null`; none nested to depth 3) |
| Briefings protocol current version `…_v2` (effective `2026-09-17`, schema `coaching_updates_schedule_v1`) | `coachingUpdates.timeZone` | **`America/Los_Angeles`** (explicit) |
| same | midweek / weekly / monthly / daily | Wednesday enabled / Sunday enabled / **`dayOfMonth: 1`** enabled / daily disabled |
| Briefings protocol version `…_v1` (2026-07-21, legacy) | `coachingUpdates` | none (legacy) |
| 14 most-recently-updated `dailyBriefings` artifacts | `evidenceWindow.timeZone` / id suffix | `America/Los_Angeles` on every one (midweek, weekly, monthly, legacy daily); none carries `evidenceSettlement` yet (expected: pre-deploy) |

## 4. Which value is authoritative, and do they agree?
- **Scheduler / registry** (`BriefingScheduleAuthority.resolveBriefingTimeZone`): `coachingUpdates.timeZone` -> `user.timeZone` -> `user.timezone` -> default `America/Los_Angeles`. Production: **`America/Los_Angeles` from the stored briefings version.** (The read service itself resolves `canonical.timeZone ?? user.timeZone ?? default`.)
- **Midweek / Weekly / Monthly generators** (`MidweekBriefingService:69`, `WeeklyNarrativeService:381/442`, `MonthlyBriefingService:71`): `user.timeZone ?? "America/Los_Angeles"`. Production: `user.timeZone` is unset, so **`America/Los_Angeles` via the hard-coded default.**
- **Agreement:** effective values agree today (LA = LA). They do not agree in the literal stored-field sense: `coachingUpdates.timeZone` is set, `user.timeZone` is not.

## 5. Can travel / device timezone influence the authority?
No path found, by code inspection plus stored data: the scheduler reads stored values only (`resolveBriefingTimeZone`, "never the server's"); Native sends no timezone in the coaching-updates path (`OperatingPlanCanonicalStrategyAPI`, editor, `ProductionCommandAPI` contain none; Native `TimeZone.current` is used only for notification diagnostics); the Web editor round-trips the stored `model.timeZone`; the request `clientTimeZone` metadata only affects reminder-occurrence completion. Limits: static analysis, not a runtime proof — a future explicit coaching-updates save carrying another zone would change the stored value.

## 6. Candidate `092011cc` resolves the same dates/timezone as production
- `git diff 01d1900b 092011cc` over `BriefingScheduleAuthority`, `BriefingCadenceRegistryService`, `CoachingUpdatesReadService`, `BriefingEvidenceWindowService`, `IntelligenceLifecycleIdentityService`: **empty** (byte-identical). Generator diffs are additive only (`settlement` input, baseline params); no timezone/window construction line changed.
- Direct proof: a temporary test (deleted afterward; worktree clean) ran the candidate's REAL `resolveBriefingCadenceRegistry` + `createCoachingUpdatesReadService` over production-shaped records with exactly the stored values above, sweeping every hour 2026-09-26 -> 2026-11-05 (includes the 2026-11-01 DST fall-back): **265 eligible-hour checks**, and for each the registry's expected window `id`/`startDate`/`endDate`/timezone equals the window the generators build. The watermark window-id guard therefore passes with production values, and the N1 fix (`092011cc`) additionally tolerates a timezone-only id difference over identical days.
- **Monthly remains day 1:** stored `dayOfMonth: 1`; in the sweep Monthly was eligible only on `2026-10-01` and `2026-11-01`; Midweek only on Wednesdays, Weekly only on Sundays.

## 7. Caveat (non-blocking; Founder decision)
The recurring generators ignore `coachingUpdates.timeZone` and use `user.timeZone ?? LA`. This split exists in production today (`01d1900b`) and is harmless only because the stored coaching timezone equals the hard-coded default. If a coaching-updates save ever stored a different zone, the scheduler would use it while generators kept LA: window ids could differ, and near local midnight the covered days could differ (the new guard would then refuse to attach a watermark and the artifact would not publish). Recommended follow-up (not part of this release): make the generators resolve the timezone through `resolveBriefingTimeZone` (single authority), or set `user.timeZone`. Not needed to deploy `092011cc` under current stored values.
Also note: the 14-artifact sample is the most recently UPDATED rows, not an exhaustive history.

## 8. Standing disk safety
Read `STANDING_DISK_SAFETY.md`. No heavy operation was performed; free space stayed at 17 GiB (floor 15 GiB) throughout.

## Flags
AUTHORITY_REVERIFIED · READONLY_TRANSACTION_VERIFIED_ON · ROLLBACK_CONFIRMED · TIMEZONE_EFFECTIVE_AUTHORITY_AGREES · MONTHLY_DAY_1_CONFIRMED · CANDIDATE_RESOLVES_SAME_DATES_AS_PRODUCTION · DEPLOYMENT_PRECHECK_PASS (with caveat §7)
SERVER_DEPLOYED=false · TESTFLIGHT_UPLOADED=false · PRODUCTION_MUTATED=false

## Next (awaiting Founder)
Deployment authorization for Server `092011cc829378c757b827f0cf66d947a5c52271` via the two-step (`apps update --spec` bumping `PHYSIQUEOS_GIT_SHA`/`PHYSIQUEOS_BUILD_ID` on web+worker, AND `create-deployment --force-rebuild`), then verify `source_commit_hash` and log gitSha. Still open from the final report: N2/N3 acceptance and the optional real-Postgres two-worker run on a disposable database.

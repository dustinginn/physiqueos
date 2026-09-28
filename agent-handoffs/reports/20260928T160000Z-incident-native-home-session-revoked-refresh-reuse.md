# Incident: Native "Home could not be loaded" — Founder device session revoked by refresh-credential reuse detection (2026-09-28)

- Handoff: `agent-handoffs/inbox/prompts/20260928T154800Z-urgent-native-home-production-incident.md`
- Agent: claude · Status: **RESOLVED — service restored 2026-09-28T15:56:53Z by Founder re-pairing; verified**
- Production authority: unchanged. Server/Web `49211870c552b104aaf7840939f55d9dc9ecc1df` on `combined-app-platform-cutover`, active deployment `3134643d-9284-4cd5-82a3-b91cff346a9f` (ACTIVE since 2026-09-26T22:35Z), no deployment in progress. Schema is at migration 000014. `/api/v1/health/live` returns 200 in 0.28 s and `/api/v1/health/ready` returns 200 in 0.32 s, with every readiness check ready. Native on the Founder device: Build 68 (`537f538b`).
- **No deploy, rollback, config change or data mutation was made.** The Briefing candidate `15b6e447` is frozen and untouched.

## Impact and window

- **Affected:** only the Founder's paired Native device session. Every Native read (Home, Goals, Log, Evidence, You) requires that session, so the app showed "Home could not be loaded" and then "Not connected".
- **Unaffected:** the Server, the database, and other users or surfaces. There were no errors and no latency spike; Home reads just before the event completed in about 0.9–1.5 s.
- **Window:** from **2026-09-28T15:35:28Z (08:35 PDT)** until the Founder re-paired at **15:56:53Z (08:56 PDT)**, about 21 minutes.

## Root cause

The Server rotates the refresh credential on every refresh and treats any second use of an already-used refresh credential as theft. When that happens it revokes the whole credential family and the session (`FounderAuthService.rotateRefreshCredential`). This is by design, and there is no grace period.

1. **15:22:19Z:** a normal refresh issued access token A (valid 10 minutes) and refresh credential R1.
2. **15:32:27.150Z:** a request arrived with A, which had just expired, and received a 401 `ACCESS_TOKEN_EXPIRED`.
3. **15:32:27.295Z:** the app refreshed with R1. The Server committed the rotation: R1 was marked used and replaced by R2 (created 15:32:27.291Z), and a new access token was issued. The response was a 200 in 21.9 ms.
4. **The app never applied that response.** No request followed the refresh. Normally the retried request arrives within milliseconds, as it did after the 15:22:19 refresh. Also, **R2 was never used**, per the database.
5. **15:35:28.450Z:** the app sent access token A again (the old one, expired) and got a 401, then refreshed with **R1** again.
6. **15:35:28.742Z:** the Server detected R1's reuse and revoked the family and the session. The request returned 401 `REFRESH_REUSE_DETECTED`. The app deleted its stored credential and showed "Not connected".

**Strongest supported cause of step 4:** the refresh response was lost in transit or dropped by the app. The most likely mechanism is iOS suspending the app while the request was in flight, around 08:32 PDT on cellular. The server finished the rotation, but the app process never handled the response, so its Keychain still held R1 and memory still held the expired token.

Ruled out as the cause:
- **The Build 68 client refresh is single-flight within one actor**, and there is one `ProductionNativeAPI` instance. The earlier near-simultaneous refreshes (for example 04:48:34.207 and 04:48:34.399) were sequential rotations and succeeded normally.
- **This is not a Server, database, deploy or data problem.**

## Evidence (bounded; kept locally)

- **Web runtime logs** 15:20–15:40Z:
  - Home reads `core.navigation.home` complete with 1,119 rows / 4.7 MB in 0.9–1.5 s up to 15:32:06Z;
  - `api.request.failed ACCESS_TOKEN_EXPIRED` at 15:32:27.150Z;
  - `native.auth.refresh_succeeded` at 15:32:27.308Z;
  - nothing until `ACCESS_TOKEN_EXPIRED` at 15:35:28.450Z and `REFRESH_REUSE_DETECTED` at 15:35:28.800Z.
- **Read-only database probe** (`BEGIN READ ONLY`, `transaction_read_only=on`, rolled back, no credential hashes read). Refresh credential chain for session `01a08df1-…bd13`: the one created at 15:22:19.899Z was used at 15:32:27.295Z and replaced by one created at 15:32:27.291Z, whose `used_at` is null. The whole family was revoked at 15:35:28.742Z. The last pairing credential before the incident was on Sep 12.

## Remediation

The smallest safe remediation is the established one: **the Founder re-pairs the device** (web You → Generate Pairing Code → enter it in Native). Nothing else was changed:
- no rollback, since there was no regression;
- no hotfix, since restoration did not need one;
- no data repair, since canonical data was untouched. Revocation only touches identity tables.

## Verification

Production web logs after the re-pairing (device registered at 15:56:53Z), for the Founder's new session:

| Surface | Read model | Result | Latency |
|---|---|---|---|
| Home | `core.navigation.home` | complete (4.7 MB) | 1.25–1.73 s |
| Goals | `core.navigation.goals`, `goals.active.build-lean-mass` | complete | 1.19 s, 0.18 s |
| Log | `core.navigation.log` | complete | 0.46–1.01 s |
| Evidence | `progress.evidence.weight` | complete | 0.05–0.75 s |
| You | `core.navigation.profile` | complete | 0.03–0.04 s |
| Briefing and training | `briefing.native-artifact`, `training.navigation.day` | complete | 0.16 s, 0.03 s |

- **No errors:** no `api.request.failed` and no 401 after the re-pairing.
- **Commands accepted again:** `native.command.receipt_committed` at 15:57:21Z and 15:57:29Z.
- **Latency:** within the normal range seen before the incident.
- **Health:** `/live` and `/ready` returned 200 throughout.
- **Production authority** is unchanged (above).

## Founder data

**Not affected.** Revocation only sets `revoked_at` on the session and credential rows. No canonical evidence, briefing, goal or confidence row was written by this event. The HealthKit 409 collisions at 13:38Z are the known daily revision loop and are unrelated.

## Briefing candidate

**Unchanged and frozen:** `15b6e447` on `codex/weekly-v3-weekly-pattern-narrative`, as published in `…110000Z-briefing-intelligence-september-mtd-monthly-review-preview.md`. It was not deployed.

## Recommended prevention (not implemented; needs authorization)

1. **Server: tolerate a lost rotation response.** If a presented refresh credential was used within a short window (for example 2 minutes, or up to its access lifetime) **and its successor has never been used**, treat it as a lost response rather than theft: retire the unused successor and issue a fresh pair in the same family. Real reuse (a successor that has been used, or reuse outside the window) still revokes. This would have turned this incident into a silent refresh. It is security-sensitive and needs deterministic tests, a fresh review, and a guarded deploy.
2. **Native (next consolidated build):** run the refresh request in a background-task assertion (`beginBackgroundTask`) so iOS does not suspend the app mid-rotation. On resume, prefer a single-flight refresh before retrying the reads.
3. **Observability:** log the route and `requestId` on `api.request.failed`, plus a `native.auth.refresh_reuse_detected` event with the session and credential ages, so the next occurrence is diagnosable from logs alone.
4. **Unrelated observation:** the Home read model returns 4.7 MB per load (1,119 rows) in about 1 s. It did not cause this incident, but it is worth trimming.

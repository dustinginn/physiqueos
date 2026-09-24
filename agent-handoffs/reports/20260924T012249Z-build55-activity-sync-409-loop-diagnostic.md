# Build 55 Activity freshness failure — read-only diagnostic checkpoint

Task: claude-build55-activity-sync-stall-diagnostic-20260923 · Agent: claude · Generated: 2026-09-24T01:22:49Z
Scope: diagnostic only. No application code, branch, worktree, production data, policy, or App Store Connect
change was made; Codex's active task/inbox claim was not touched (this checkpoint is published without an inbox
task id).

## Diagnosis in one paragraph

The device is not wedged and pull-to-refresh does reach the Server: since 22:02:36Z (15:02 PDT) every foreground
catch-up and Log pull-to-refresh produces a HealthKit ingest request, and the Server refuses each one with HTTP 409
`HEALTHKIT_OBSERVATION_IDENTITY_COLLISION` — the observation identity (bundle id + `activity_summary` +
`activity-summary:automatic:2026-09-23` + device id + `sourceRevision`) already exists with different content. The
last Activity observation the Server accepted for 2026-09-23 is `sourceRevision` 50 at 18:35:26Z (11:35 PDT), which is
the canonical Activity day revision 50 the Log still shows; everything Apple Health accumulated after 11:35 PDT is
being uploaded and rejected, so the Server data is stale, not merely the Native UI. Nutrition's last accepted
observation is revision 3 at 21:35:11Z (14:35 PDT) and it is only "fresh" because nothing changed after that; its next
real change is expected to fail the same way if it shares the regressed cursor. This is a distinct failure from the
Build 54 wedge (no requests at all); the Build 55 timeout/rerun/serialization changes are doing their job — each
attempt runs, uploads, gets rejected, abandons the batch and re-queries next time — but the device keeps re-using an
already-consumed per-day `sourceRevision`, so the loop never converges. Native mechanism (read-only audit of 621dbef3 vs e249a0f3, file:line): the per-day Activity `sourceRevision` is a device-owned cursor entry `{fingerprint, revision}` keyed by local date (`HealthKitQueryClient.swift:26-32`), computed as `previous.revision + 1` when the fingerprint changes and restarting at 1 when the entry is missing (`:276-280`); the fingerprint includes move/exercise/stand plus steps, distance and flights (`:261-266`), so it churns ~50 times a day. On a Server rejection the engine abandons the batch and, by design, never advances the cursor (`HealthKitSynchronizationEngine.swift:499-501`, `HealthKitSyncPersistence.swift:114-128`), so the next pass recomputes the SAME already-consumed revision: a permanent per-day loop that only clears at local midnight when the day key changes. Build 55 changed none of the revision, persistence, normalizer or uploader code (diff is empty for those files); it added the 30 s per-stream step timeout, 25 s query timeout, same-scope serialization, rerun-after-in-flight and the observer completion gate.
Two candidate triggers for the initial regression, not distinguishable from the Server (409 bodies are not stored and the warn line is redacted): (a) an acknowledge-loss -- the Server durably accepted revision 50 at 18:35Z but the device never recorded the acknowledgement (Build 54 wedge era, or Build 55's new `try Task.checkCancellation()` between upload and acknowledge at `Engine.swift:482`), so the cursor sits at 49 and re-sends 50; or (b) the day's cursor entry was dropped -- the aged-out-day deletion path when one HKActivitySummaryQuery pass returns nothing for today (`HealthKitQueryClient.swift:314-318`, cursor committed with no upload) or the silent corrupt-file quarantine when a `.completeFileProtection` state file is read while the device is locked during a background wake (`HealthKitSyncPersistence.swift:206-231, :240`) -- restarting at 1. Nutrition uses the identical mechanism (`:718-724, :780-784`) and carries the same latent loop; it survived only because it had no new data.
The Log's Activity value is not a client cache: pull-to-refresh awaits the bootstrap, invalidates the 90 s in-memory cache and re-reads `evidence-review-queue`/`weight` (`LogView.swift:52-58`, `FounderServerAPI.swift:500-560`). No app screen surfaces the automatic scope's diagnostics (`lastErrorCode`, `abandonedBatchCount`, `cursorGeneration`, `lastDurableAcknowledgement` live only in `Application Support/PhysiqueOS/HealthKitSync/state-*.json`; the Founder canary screen binds to a different scope), so no screenshot can show it.

## Authority (reverified read-only)

- Production Server `31c88481d80703de3355c51f6695b760b0671020`, deployment `42035d0d-9368-4ada-a4c1-392e659f3366`
  ACTIVE (19:33:15Z); web + worker `source_commit_hash` and `PHYSIQUEOS_GIT_SHA` / `BUILD_ID physiqueos-31c88481-20260923`
  match; health live/ready 200/200; console runtime gate passed on `web` at that SHA. `origin/combined-app-platform-cutover`
  = 31c88481 (six Strength-reassessment commits after cc3c6e44; the HealthKit observation identity derivation is
  unchanged: `HealthKitObservationService.js:482-492`).
- Native Build 55 = `621dbef3cdcf17009e346111e4a86d14b70ed896` ("fix(ios): complete HealthKit observer wakes exactly
  once"), uploaded to App Store Connect 13:10:56 PDT (20:10Z), delivery `da5b5c12-1e42-4efd-8efd-9a2d903f725e`, VALID.
  Build 54 delivery 7a7035a0 (07:25 PDT).

## Timeline (UTC; Founder-local = UTC−7)

| time | evidence | meaning |
|---|---|---|
| 18:35:26 | Activity 2026-09-23 `sourceRevision` 50 accepted; canonical Activity day rev 50 (`partial_day`) | last proven successful Activity ingest — the value the Log still shows |
| 20:10:56 | Build 55 uploaded to ASC (VALID) | install possible from ~20:2xZ |
| 21:35:11 | Nutrition 2026-09-23 `sourceRevision` 3 accepted (one-observation batch, `created 1`) | last successful ingest of any kind; consistent cursor → most likely still Build 54 |
| 22:02:34 | token refresh + `core.navigation.profile`/home reads = fresh process | first Build 55 launch (inferred) |
| 22:02:36, 22:02:40 | 409 identity collision ×2 | first Activity upload attempts refused |
| 00:42–00:44 | fresh process (profile read), 409 ×5 interleaved with Home/Log/priority reads | app open + pull-to-refresh: query fires, upload sent, refused |
| 01:06–01:07 | fresh process, 409 ×3 | same |
| — | no `healthkit.observations.ingest.v1` receipt since 21:35:11Z; no workout observations affected (workout drift is acknowledged since cc3c6e44) | Server never accepted a post-11:35 Activity value |

Server-side state (zero-write probes at 31c88481): 50 Activity observations for 2026-09-23 with `sourceRevision` 1…50,
all `activity_day_canonicalized`, canonical day rev 50 = sourceRevision 50 `partial_day`, updated 18:35:26Z; Nutrition
day rev 3 updated 21:35:11Z; acceptance audit shows the historical superseded states
(`newer_device_revision_already_received` ×2, `equal_precedence_kept_existing`) but nothing after 18:35Z; strategic 0.

## Layer-by-layer classification (required distinctions)

- HealthKit query not firing — NO (uploads are produced on every foreground/refresh).
- Query firing but timing out — NO (requests reach the Server within seconds of the reads).
- In-flight / coalescing / rerun stuck — NO (each open and pull-to-refresh yields a new attempt; Build 55 rerun works).
- Anchor/query returns no new samples — NO for Activity (content differs from every stored revision, hence 409).
- Upload staged but not sent — NO.
- Auth/token/network — NO (refreshes succeed; reads succeed).
- Server rejection / idempotent replay — **YES: 409 identity collision on every attempt**; no receipt is written for a
  409, which is why the receipts table looks silent.
- Canonicalization failure — NO (never reached).
- Server accepted but Native cache stale — NO (Server itself is at rev 50 / 11:35 PDT).
- Apple Health Move not represented by queried samples — NO (the device clearly has newer content; that is what collides).

Activity vs Nutrition: same stream layer (daily-aggregate observations with device-owned `sourceRevision` identity),
same automatic scope; Nutrition simply had no new data after 14:35 PDT. The divergence is data-driven, not code-driven.

Build 55 fixes against this state: per-stream timeouts / same-scope serialization / rerun-after-in-flight /
observer one-shot / foreground catch-up / pull-to-refresh fresh attempt — all engaged (every attempt is a fresh query
and upload). They cannot help because the failure is a refused identity, and abandon-on-rejection re-queries with the
same regressed revision.

Same-vs-new: NEW failure mode. Build 54 = no device→Server traffic at all (wedged bootstrap). Build 55 = traffic every
time, refused by the Server.

## What is needed next

Smallest correct Native fix (for ChatGPT/Founder to coordinate with Codex; not started here): (1) on an identity-collision abandon, advance the day's revision floor so the next attempt tries N+1 (breaks the loop even if the trigger recurs); (2) make the per-day revision a high-water mark that never regresses -- keep the cursor entry when a query pass returns nothing for a day, emit only a deletion (`HealthKitQueryClient.swift:314-318`), mirrored in the Nutrition builder; (3) make acknowledging a durably accepted upload uncancellable (remove/relocate `Engine.swift:482`); (4) in `HealthKitSyncPersistence.load` treat I/O or permission failures as retry, not corruption (or use `.completeFileProtectionUnlessOpen`). Server companions (safe, independent, not applied): include `nextExpectedRevision` in the 409 body so a device can self-heal, and log the colliding external id (hashed) and `sourceRevision` on the 409 warn line so this class of failure is diagnosable from logs; do NOT silently accept lower revisions. Operator visibility: surface the automatic scopes' persisted diagnostics on the existing canary screen.
Frozen 2026-09-23 day: recoverable without manual action once the fix lands -- the 30-day query window re-emits the day with a fresh revision when its fingerprint differs. Founder action now: none; force-quit will not help (the cursor is persisted). Passive confirmation: after local midnight, `activity-summary:automatic:2026-09-24` revision 1 should be accepted and Activity resumes while 2026-09-23 stays at the 11:35 PDT value.

Server-side mitigation options for ChatGPT/Founder to weigh with Codex (not applied): (a) none — the 409 is correct
fail-closed behaviour for daily snapshots; (b) make the 409 body carry the highest stored `sourceRevision` for that
identity so a device can re-seed; (c) accept an out-of-order revision only when it is strictly greater than every stored
revision for the day (already the precedence rule) — the collision is specifically a *re-used* number.

Recovery note: local midnight (07:00Z) rolls the day key to 2026-09-24, whose revision numbers are all unused, so
Activity will appear to recover tomorrow while 2026-09-23's final totals stay frozen at the 11:35 PDT value unless the
day is re-uploaded with a fresh revision. No recovery action was requested of the Founder during this diagnostic.

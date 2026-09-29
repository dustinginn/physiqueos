# Diagnosis: Sep 28 Activity / Training inconsistency

- Task: `native-consolidated-daily-driver-build-after-briefings-20260928`, Phase A
- Agent: claude
- Status: **DIAGNOSED. No data changed.** All production reads used a READ ONLY transaction that was verified and rolled back.
- Authority reverified:
  - Server/Web: `396e750d` (deployment `c0ad0cc9`).
  - Native: Build 68, `537f538b`, on `codex/native-batched-candidate-post-build62`. Nothing newer exists on the Native lineage.

## Answer

There is **one canonical ingest defect**, plus **two projection gaps** that the defect made visible. No Native code is at fault. HealthKit sync, cursors and revisions all worked: the phone delivered every revision on time.

### 1. Why Activity froze at 171 active calories (the root cause)

Sep 28's Apple Health activity summary reached the Server as 37 revisions of one stream, `activity-summary:automatic:2026-09-28`. The phone's source revisions ran 1 → 37 without a gap.

| Revisions | Received (UTC) | Delivery device id | Move calories | Server outcome |
|---|---|---|---|---|
| 1–10 | 15:22:22 → 15:32:05 | `01a08df1…` | 113.9 → **171.4** | applied (`activity_day_canonicalized`; canonical day revisions 1–10) |
| 11–37 | 15:57:20 → 02:59:22 (+1 day) | **`01a0e8bb…`** | 186.9 → **828.1** | **all rejected**: `activity_summary_superseded`, reason `cross_device_equal_coverage_kept_existing` |

At 15:35Z the Founder's Native session was revoked by refresh-reuse detection (see the Sep 28 incident report), and the Founder re-paired. Re-pairing issues a **new device identity**, and `ingestion.deliveryDeviceId` is the paired session's device. So the same phone, continuing the same stream, looked like a second device.

The precedence rule is in `src/domain/services/HealthKitCanonicalDayService.js`, `compareHealthKitDailySnapshotPrecedence`:
- coverage decides first;
- among snapshots with equal coverage, the source revision orders them **only when they come from the same delivery device**;
- a different device with equal coverage always returns "keep existing".

A partial day from the new identity could therefore never replace the partial day from the old one. The canonical day `healthkit_canonical_day_activity_2026-09-28` is still at **v10: 171.405 cal, 26 exercise min, `partial_day`**, and has been since 15:32:05Z (08:32 PDT).

Sep 27, a day without a re-pair, applied all 55 revisions normally (798 cal, then `complete_day`).

### 2. Why workout calories were 212 while active calories were 171

- **Where 212 comes from:** Outdoor Walk 108 + Outdoor Walk 103 ≈ 211, rounded to 212.
- **Why Strength added nothing:** its HealthKit link was still `candidate`, because of the review gap fixed tonight in `396e750d`. A Logger session without a confirmed HealthKit workout adds 0.
- **No double counting:** workout energy is descriptive and never added to the daily total. Non-workout energy is `max(0, move − workout)`.
- **Why the warning appeared:** it only fired because the daily total was frozen at 08:32 while both walks were complete. With the true total (about 828) there is no conflict.

### 3. Why Activity showed "Linked Workouts 1" when Training Day had 3

Activity Evidence's `linkedTrainingSessionCount` counts **Logger sessions** (`training_session_ids`), not canonical workouts, so Cardio can never appear in it.

Training Day reads the canonical workout set: 2 Outdoor Walks plus 1 Strength. Walking is not excluded by policy. Both walks are eligible canonical Cardio workouts and do contribute their energy. Only the *count* uses the wrong set.

### 4. Why Logged Today hid the two walks

`src/domain/services/LoggedTodayService.js` `composeTrainingRow` builds the Training row only from Logger `training` sessions. The comment there records a deliberate Part E/F decision that canonical Cardio gets no Log row. The Founder's new requirement reverses that decision.

The Activity row shows the frozen canonical day ("171 active calories") with no partial-day marker. So **the partial Apple Health state was presented as if final**.

### Other questions from the handoff

- **Stale activity summary, or workouts ingested later?** Stale. The summary stopped advancing server-side at 15:32Z while the workouts, which are not subject to this rule, kept arriving (the last at 16:34Z).
- **Is walking excluded by policy or identity?** No. It is excluded only from the Logger-session count and from Logged Today, both by projection design.
- **Double counting?** None.
- **Is a partial day presented as final?** Yes. Neither Log nor Activity marks `partial_day` coverage.
- **Rebase, cursor or revision-floor involvement?** None. The revisions were continuous, every observation was stored raw, and only canonical precedence rejected them.
- **Does it correct itself?** Partly:
  - The next-morning `complete_day` summary outranks any partial day regardless of device, so Sep 28 will repair itself on the first sync after midnight, as Sep 27 did at 13:38Z.
  - Sep 29 onward is built under the new identity, so it is unaffected.
  - **But** any mid-day re-pair (or any genuine second device) freezes that day's Activity until the next morning. Without a Server fix it will recur.
- **Other domains or days affected?** No:
  - Nutrition Sep 28 was first created under the new identity (22:12Z).
  - All Sep 27 revisions came from the old identity.
  - No other day has a device-identity split.

## Fix plan: Server first, and separately gated

1. **Canonical-day precedence (the root cause).** At equal coverage from a different delivery device, accept the incoming snapshot only when it **cumulatively dominates** the current one: every present cumulative metric (move calories, exercise minutes, steps, distance, stand hours) is ≥ the current value, and at least one is greater. Within a day these totals only go up, so:
   - a lagging device can never regress the day;
   - two devices cannot flip-flop;
   - a re-paired phone resumes immediately.

   Existing canonical days are untouched; the rule only affects future observations.
2. **Activity linked count:** count contributing canonical workouts (confirmed Strength plus eligible Cardio), the same set Training Day uses.
3. **Logged Today Training row:** compose Strength and Cardio from canonical data. Example: "Strength Training · 50 min" and "2 Outdoor Walks · 32 min". The existing `summary` stays compatible with Build 68.
4. **Partial-day semantics:** the Activity row and detail say "so far" while coverage is `partial_day`. The workout-exceeds-daily warning only makes sense against a trustworthy total, so it becomes a provisional notice on a partial day.
5. **Pluralization:** "1 possible Logger session".

Native work for the same build: rendering the multi-line Training row and "so far" copy, the Log-tab Logger routing, the notification timing, Mark Skipped, the PR celebration, and the Monthly cleanup (per the handoff scope).

**No manual repair of Sep 28:** the natural `complete_day` will correct it, and I will verify that read-only.

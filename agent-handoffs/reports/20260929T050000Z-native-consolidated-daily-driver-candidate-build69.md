# Consolidated Native daily-driver candidate: Build 69 (not uploaded)

- **Task:** `native-consolidated-daily-driver-build-after-briefings-20260928`
- **Coordination:** `inbox/coordination/20260929T040500Z-native-parallel-claude-codex.md`
- **Agent:** claude, the integrator
- **Status: CANDIDATE READY, awaiting acceptance.**
  - No TestFlight upload.
  - No Server deploy.
  - No production data changed; all production reads were READ ONLY and rolled back.
- **Authority, reverified:**
  - Server/Web in production: `396e750d` (deployment `c0ad0cc9`).
  - Native: Build 68, `537f538b`.
- **Diagnosis report:** `agent-handoffs/reports/20260929T040000Z-activity-sep28-consistency-diagnosis.md`

## Candidates

| | Branch | SHA | Base |
|---|---|---|---|
| **Native, Build 69** | `claude/native-daily-driver-20260929` | **`c2b43091`** | Build 68 `537f538b` |
| **Server, gated separately** | `claude/daily-driver-server-candidate-20260929` | **`faa9151a`** | production `396e750d` |

The Native candidate works against today's Server: every new field is optional, and features whose Server part isn't deployed yet simply stay hidden. Their full effect needs the Server candidate.

**Recommended TestFlight build number: 69.** Don't upload until the scope is accepted.

## Activity root cause (Sep 28), in brief

The Founder re-paired the app at 15:35Z, which gave the same phone a new delivery device id.

For two partial days of equal coverage from different devices, the canonical-day rule was "keep the existing one". So Activity froze at **171 cal (08:32 PDT)**, while 27 or more later revisions from the same phone (reaching about 837 cal) were rejected.

That also explains the other symptoms:
- **212 workout calories:** the two walks alone. The Strength workout added nothing because its link was still a candidate.
- **"Linked Workouts 1":** the count was Logger sessions, not workouts.
- **Walks missing from Logged Today:** an old design choice left Cardio out of that row.

It self-heals at the next-morning complete summary. It would recur after any mid-day re-pair until the Server fix is deployed. Full evidence is in the diagnosis report.

## Scope

| # | Workstream | State | Where |
|---|---|---|---|
| 1 | **Activity/workout same-day consistency** | done | Server + Native |
| 2 | **Logged Today: Strength and Cardio together** | done | Server + Native |
| 3 | **Log tab opens the in-progress Workout Logger** | done | Native |
| 4 | **Reconciliation notification when the review is ready** | done | Native |
| 5 | **"1 possible Logger session"** | done | Server |
| 6 | **Priority Detail → Mark Skipped** | done | Server + Native |
| 7 | **Workout Complete performance records + confetti** | **pending, owned by Codex** | — |
| 8 | **Monthly Native cleanup** | done | Native |

### 1. Activity/workout same-day consistency

**Server:**
- **Cross-device takeover:** a partial day from a different delivery device replaces the current one only when it *cumulatively dominates* it: every total is present and not lower, and at least one is higher. A re-paired phone takes over at once, a lagging device can never regress the day, and two devices can't flip-flop. Existing days are unchanged. Complete-day summaries still win.
- **Linked Workouts:** counts the same workouts Training Day shows (confirmed Strength, Cardio Training Day presents after duplicate suppression, and unattached sessions).
- **"So far":** a partial day reads "so far" only when it is the Server's today, and its workout-over-total notice is provisional. A past partial day reads "· partial day".

**Native:**
- Shows "Still updating from Apple Health" for an in-progress day, following the Server's `isPartialDay`.
- A provisional notice is muted, with a clock icon.

### 2. Logged Today: Strength and Cardio together

**Server:** the Training row carries one line per modality, from Training Day's own Cardio projection. For example: "Strength Training · 50 min" / "2 Outdoor Walks · 32 min". It groups same-type Cardio and handles several Cardio types, Cardio only, Strength only, and nothing logged.

**Build 68 compatibility:** the row keeps the Strength session's link, so Build 68 still opens the session. Build 68 shows a single comma-joined line.

**Native:**
- Renders the lines.
- A row with more than one line opens Training Day.
- Lines decode lossily, so one bad line never fails the Log read.
- The old local Cardio fallback now only serves Servers that send no lines.

### 3. Log tab opens the in-progress Workout Logger

**What counts as in progress:** a live (not past) workout, not complete, not submitted, not left with Save & Leave, and started less than 12 hours ago.

**Behaviour:**
- It opens only when switching into Log from another tab with Log at its root.
- The Logger is pushed on top of Log, so Back and Save & Leave return to Log.
- There is no bounce when already on Log.
- Resuming from saved workouts makes it in progress again.

**Also fixed:** the Logger used to rebuild on every tab revisit and drop the Founder to the entry screen.

### 4. Reconciliation notification when the review is ready

**Trigger:** every durably accepted HealthKit ingest, from a foreground sync on any tab or a background-delivery wake. It then:
- coalesces overlapping triggers;
- reads the pending reviews;
- runs the same identity-diffed notifier.

**Safeguards:**
- Review ids are claimed before an alert is added, so a review is never notified twice.
- It never prompts for notification permission from this path.
- Alerts for reviews that are no longer pending are withdrawn.
- Tapping opens that exact review.

**iOS limitation (no APNs):** if iOS doesn't wake the app, the alert waits for the next app wake or sync.

### 5. "1 possible Logger session"

Singular for one; plural otherwise. Server-only.

### 6. Priority Detail → Mark Skipped

**Server: new `priority.skip.v1`.**
- **Same record as Morning Check-In:** it writes the same canonical skip entry Morning Check-In writes, through one shared helper, so there is one skip meaning.
- **Rules:**
  - today only;
  - `If-Match` required;
  - completed-first and skipped-first are terminal;
  - an exact replay changes nothing;
  - `complete` on a skipped occurrence returns `already_skipped`.
- **Where it shows:**
  - Priority Detail shows "Skipped" and offers `skippable` / `skipCommand` only for today's open, ordinary reminders. Weigh-in, photos, DEXA and peptide/recovery/supplement protocol items are excluded.
  - Home and the notification horizon drop a skipped occurrence.
  - Next morning's Check-In excludes it.

**Native:**
- The button appears only when the Server offers it, behind a confirmation.
- It uses a header-safe idempotency key.
- It then refreshes Home and notifications as a completion does.

### 7. Workout Complete performance records + confetti: **pending, owned by Codex**

My earlier implementation was taken out of both candidates when ownership moved to Codex. It is kept for reference only on these branches, not integrated:
- `claude/server-session-performance-records-20260929` (`aaa0d675`), a Server change that returns `performanceRecords` in the commit result and the `training-session` read;
- Native commit `8632c690` in this branch's history.

Workout Complete in Build 69 is unchanged from Build 68. No Codex report was on GitHub at publish time. I will review and integrate Codex's branch when its report appears, or reject it with reasons.

### 8. Monthly Native cleanup

- "Baseline Read" → "What it means".
- One shared tone-to-icon mapping. Routine and Recovery get their own icons instead of the generic sparkles. What Changed was also missing `energy`.
- No structural change.

## Server candidate: separately gated, NOT deployed

`faa9151a` contains the changes for items 1, 2, 5 and 6. Relative to production:
- **Collections and migrations:** no new collections and no migrations.
- **New Native write command:** `priority.skip.v1`, added to the allowlist, manifest and OpenAPI.
- **Database-path changes:** one read of a day's check-in in the Priority navigation store (by id), asserted read-only by the history guard.

**Decision needed:** authorize the guarded deploy of `faa9151a`. It is independent of the Native upload, and the order can be either.

**Effect on Sep 28:** deploying fixes the freeze for future re-pairs. It does not re-apply revisions already rejected; Sep 28 heals on its complete-day summary, which I will verify read-only.

## Validation

**Server `faa9151a`:**
- Full regression: 9178/9486. The 303 failures are the same environmental set as production's baseline; **0 new**.
- Production build: exit 0.
- New or updated tests cover:
  - re-pair takeover, a lagging device, mixed or missing totals, Nutrition takeover, complete-day precedence;
  - past vs today partial days, duplicate Cardio counted once (with a control case);
  - every Logged Today combination, the Apple Health suffix on the Strength line only, the singular copy;
  - skip: port, Home and notification horizon, Priority Detail, Morning Check-In parity, a same-day weigh-in keeping the skip, and history unchanged.

**Native `c2b43091` (Build 69):**
- Full unit suite: **1485/1485**. Build 68's baseline was 1465/1465.
- **Release compile:** BUILD SUCCEEDED. The only Swift warnings are the existing ones in `BackgroundExecutionAssertion.swift`, which this candidate doesn't touch.
- **Build bump:** the generator run is deterministic, and the project diff is `CURRENT_PROJECT_VERSION` ×2 only.
- New or updated tests cover:
  - Logged Today lines, lossy decoding and destinations;
  - Activity in progress, provisional notice, past partial day and legacy payloads;
  - reconciliation notifier planning (seed, once per review, withdraw), refresher coalescing and permission, and ingest-hook ordering;
  - Log-tab session definition, Save & Leave and routing guards;
  - skip wire command, read mapping and view-model;
  - older cached priority payloads still decoding;
  - the Monthly icon/label regression.
- The full suite caught one decoding regression (required keys for the skip fields), which is fixed.

## Fresh-context review

- **First pass:** Server REQUEST CHANGES (3 items); Native APPROVE WITH NITS (1 must-fix). Must-fixes:
  - **Server:**
    1. Build 68 lost the Strength link when Cardio was present.
    2. "So far" appeared on past partial days.
    3. A walk that duplicated a screenshot workout was counted twice.
  - **Native:** Save & Leave re-trapped the Founder in the Logger.

  All four are fixed.
- **Verification pass:** **Server APPROVE WITH NITS; Native APPROVE.**
- **Deferred, reviewer agreed none blocks:**
  - a time-based takeover or missing-metric freeze guard (and an alert for a long cross-device supersede);
  - a guard against duplicate Logger instances;
  - automatic refetch after a skip 412;
  - pruning of the observed-review and celebration keys;
  - "today" uses the Server's fixed Pacific zone, like the existing `isToday`.

## Founder acceptance checklist (Build 69, ideally with Server `faa9151a` deployed)

1. **Activity:** today reads "… so far" with "Still updating from Apple Health". Workout calories never trigger a red warning against a partial total. Linked Workouts equals Training Day's count.
2. **Logged Today:** Strength and Cardio show as separate lines ("Strength Training · N min" / "2 Outdoor Walks · N min"), and tapping opens Training Day.
3. **Log tab:** start a live workout, switch to Home, tap Log, and you land in the workout; Back returns to Log. After Save & Leave, Log opens normally.
4. **Notifications:** when a Strength match needs review, "Workout needs review" arrives after the next sync, on any tab. Tapping opens the review.
5. **Mark Skipped:** on today's ordinary reminder, confirm; it shows "Skipped for today." and leaves Home. It's not offered for weigh-in, photos, DEXA or protocol items.
6. **Monthly:** "What it means" appears in New Baseline, and Routine items get a calendar icon.
7. **Workout Complete:** unchanged. The records celebration is Codex's pending workstream.

## Rollback

- **Native:** keep Build 68 (no upload has happened).
- **Server:** undeployed; production remains `396e750d`.

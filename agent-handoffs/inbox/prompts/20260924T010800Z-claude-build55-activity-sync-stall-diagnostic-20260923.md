Task id: claude-build55-activity-sync-stall-diagnostic-20260923

Perform an urgent READ-ONLY diagnostic of a real-device Build 55 HealthKit Activity freshness failure while Codex continues its separate Strength reconciliation implementation. Do not interfere with Codex's branch/worktree/task.

Use a NEW Claude chat/session if needed. Sonnet High.

Founder report, Sep 23:
- Build 55 is installed.
- PhysiqueOS Log shows Activity = 606 active calories.
- Apple Health at approximately 8:07 PM shows Move = 729 calories, Exercise = 107 min, Stand = 10 hr.
- Nutrition on PhysiqueOS shows 1,730 calories / 116P / 159C / 71F from Apple Health.
- Activity stopped updating.
- Pull-to-refresh on Log does NOT update Activity.
- This is especially important because Build 55 was intended to fix the Build 54 in-process HealthKit sync stall.
- Founder has NOT been instructed to force-quit yet. Preserve the stuck state for diagnosis.
- Difference visible at report time: Apple Health Move exceeds PhysiqueOS Activity by about 123 active calories. Treat screenshots as Founder-observed context; verify server/device telemetry rather than assuming exact causality.

Current expected authority to reverify:
Production Server 31c88481d80703de3355c51f6695b760b0671020
deployment 42035d0d-9368-4ada-a4c1-392e659f3366
Native Build 55 621dbef3cdcf17009e346111e4a86d14b70ed896 installed.
Do not trust hints without verification.

Concurrency:
Codex is actively working on the separate Strength reconciliation/auto-confirm semantics task. Do not modify application code, branches, production data, policies, App Store Connect, or Codex's worktree. This task is diagnostic only unless Founder/ChatGPT later explicitly authorizes a separate follow-up.

Primary question:
Why is Build 55 Activity stale and why does Log pull-to-refresh fail to produce a fresh Activity update despite Apple Health having newer Move data?

Required diagnostic:
1. Reverify production authority and Build 55 source authority read-only.
2. Inspect production logs/telemetry around the last successful Activity/Nutrition/Workout uploads and the period after.
3. Determine whether pull-to-refresh requests reached the automatic HealthKit coordinator/server at all.
4. Distinguish:
   - HealthKit query not firing;
   - query firing but timing out;
   - in-flight/coalescing/rerun state stuck;
   - anchor/query returns no new samples;
   - upload staged but not sent;
   - auth/token/network failure;
   - server rejection/idempotent replay;
   - canonicalization failure;
   - server accepted new Activity but Native Log cache/read model failed to refresh;
   - Apple Health Move total not yet represented by the particular HealthKit samples PhysiqueOS queries.
5. Specifically test the Build 55 fixes conceptually against this live state:
   - per-stream bounded timeouts;
   - same-scope serialization;
   - rerun-after-in-flight;
   - observer completion one-shot;
   - foreground catch-up;
   - Log pull-to-refresh fresh attempt.
6. Compare Activity vs Nutrition behavior during the same interval. If Nutrition is current while Activity is stale, explain which stream/layer diverged.
7. Inspect any available diagnostics fields such as last attempt/success, timeout, abandoned batch, anchor/cursor, staged/rejected batches, but do not expose secrets.
8. Establish whether this is the same Build 54 failure mode or a distinct Build 55 bug.
9. Do not force-quit, toggle permissions, use Founder canary, manually sync, or ask Founder to take recovery action until the stuck state has been inspected as far as possible.

If device-side evidence is required that cannot be obtained remotely:
Ask Founder for the smallest non-destructive action or screenshot needed. Prefer diagnostic UI/state reads before recovery actions.
Only after the diagnostic snapshot is complete may you ask Founder to background/foreground, pull-to-refresh once, or force-quit/relaunch as a controlled experiment, and clearly state which hypothesis that action tests.

Output:
Give Founder a concise diagnosis with:
- last proven successful Activity ingest time/value;
- whether pull-to-refresh reached server;
- layer where freshness stopped;
- whether Build 55 timeout/rerun fix engaged;
- whether server data is stale or only Native UI is stale;
- Activity/Nutrition comparison;
- same-vs-new failure classification;
- smallest next fix or additional evidence needed.
Publish a durable GitHub diagnostic checkpoint/report after the substantive audit, without replacing or interfering with Codex's active task/inbox claim.

Standing workflow:
Publish durable GitHub updates after substantive chunks.
No production mutation or code changes in this diagnostic task.
If a later fix is needed, report it for ChatGPT/Founder to coordinate with Codex rather than racing Codex.

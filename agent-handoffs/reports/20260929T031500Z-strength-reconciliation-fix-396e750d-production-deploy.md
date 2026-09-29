# Production deploy: Strength reconciliation fix `396e750d` — deployed, recovered naturally, and notified

- **Authorization:** on 2026-09-28 the Founder approved deploying the exact reviewed fix `396e750d` through the guarded workflow.
- **Agent:** claude
- **Status: DEPLOYED and verified end to end.**
  - Both missing reviews were created by the normal matcher path on the next ordinary HealthKit ingest.
  - Both Native notifications fired on the Founder's device.
  - No review was created or resolved by hand.
  - No Native build was cut, and no Native backlog work was started.
- **Diagnosis:** `agent-handoffs/reports/20260929T020000Z-strength-reconciliation-review-gap-diagnosis.md`

## Production authority

| | Before | After |
|---|---|---|
| Server/Web SHA (web and worker `source_commit_hash`) | `7242043fd11825b49788839bd99a41d983f04c6e` | **`396e750d7a2c9c4cb4971b8936c56e4476805e07`** |
| App Platform deployment | `e22b966b-adfb-4da2-9cc1-dd2d65b0087b` | **`c0ad0cc9-cea7-4c54-81e5-b4861501ea73`** (ACTIVE 9/9 at 02:37:54Z; cause: manual force-rebuild) |
| Production branch `combined-app-platform-cutover` | `7242043f` | `396e750d` (fast-forward) |
| Build id (`/ready`) | `physiqueos-7242043f-20260928` | `physiqueos-396e750d-20260929` |
| Schema | `PROVIDER_MIGRATION_000014_APPLIED` | unchanged |
| Runtime log `gitSha` | — | `396e750d…` |

- **What was deployed:** only the fix. It changes 1 source file (`CanonicalPersistenceCommandPorts.js`, +9/−5) and 2 test files.
- **Spec change:** exactly 4 lines, `PHYSIQUEOS_GIT_SHA` and `PHYSIQUEOS_BUILD_ID` on both web and worker.
- **Other deployments:** the automatic spec-update deployment `03d815d5` was cancelled in favour of the force-rebuild, as in previous deploys.

## Gates (before the deploy)

- **Authority reverified:**
  - The production branch and the active deployment were at `7242043f`.
  - No deployment was in progress.
  - `/ready` was green.
  - `396e750d` descends directly from production.
- **Production build** on the exact SHA in a clean worktree: exit 0.
- **Tests:**
  - The two affected test files pass 87/87 on the exact SHA.
  - The full regression has 0 new failures against the production baseline: 9139/9447, with the same 303 environmental failures.
- **Review:** the fresh-context review approved with nits (reported in the diagnosis).

## Recovery through the normal path (read-only verification)

Each state was captured with a READ ONLY transaction that was verified and then rolled back.

| | Pre-deploy (02:2xZ) | Post-deploy, before ingest | After the next ordinary ingest |
|---|---|---|---|
| Strength links | 3 confirmed, 2 candidate | identical | **identical** (Sep 27 `d96bc4aa…` and Sep 28 `a718128a…` still `candidate` v1, same Logger sessions) |
| Link claims | 6 held, digest `d7226d3c…` | identical | **identical** |
| Reconciliation reviews | 2, both `resolved_confirmed` | identical | **4: the same 2 resolved (unchanged versions) plus 2 new `pending`** |
| Other evidence reviews | digest `79bb275b…` | identical | **identical** |
| Canonical workouts | 16, digest `cbd9fcf0…` | identical | **identical** |
| Evidence objects | 581 | identical | **identical** |
| Policy | v4, `linkAutoConfirm: false` | identical | **identical** |

**The two new reviews:**
- **Sep 27:** `healthkit_workout_reconciliation_0fe4ca7e…`, workout `d5eca6f3…`, 1 candidate (Logger `D0BEC701…`).
- **Sep 28:** `healthkit_workout_reconciliation_4606886e…`, workout `9d2a5fb2…`, 1 candidate (Logger `34D9CBAD…`).

Both reviews:
- were created at **02:58:03.704Z** by the Founder's phone's first ordinary `healthkit.observations.ingest.v1` on the new build;
- are `pending` at v1, with a lifecycle of `pending` only;
- have no resolution.

**No duplicates or reopens:** a second ordinary ingest at 02:58:12Z left both reviews byte-identical (still v1, same `updatedAt`). The earlier resolved reviews were not reopened. No `workout-reconciliation.resolve.v1` command ran.

## Native notification: fired

Build 68 schedules the "Workout needs review" local notification from the Log screen (`WorkoutReconciliationReviewReadyNotifier.reconcile`, driven by the `core.navigation.log` read). The server logs show:

1. **02:58:03.704Z:** the reviews were created.
2. **02:58:07Z:** the phone read `core.navigation.log`. This was the first Log read after the reviews existed. Home, Goals, Evidence and other reads were served in the same foreground session.
3. The notifier found two new review ids and scheduled both.

The Founder's lock-screen screenshot (7:58 PM PDT, "1m ago" at 7:59) shows both notifications:
- "Workout needs review — Match Apple Health workout (Sunday, September 27) — 1 possible Logger sessions."
- "Workout needs review — Match Apple Health workout (Monday, September 28) — 1 possible Logger sessions."

## Findings for the backlog (not changed in this task)

1. **Founder requirement (2026-09-29): "Those notifications should fire when the review is ready, not just when I open the log page so that the notification prompts me to go to the log page and confirm."** The Founder confirmed the notifications appeared only when they opened the Log page.

   **Recommended design (Native, needs a build):**
   - The reviews are created by the phone's own HealthKit ingest, and the ingest result already reports `workoutRelationships.reconciliationReviewsCreated` and `reconciliationReviewsReopened`.
   - After every automatic HealthKit sync (foreground on any tab, and HealthKit background delivery), refresh the pending-review queue and run the same identity-diffed `WorkoutReconciliationReviewReadyNotifier.reconcile`. The notification then fires when the review becomes ready, whatever tab is open, and a tap deep-links to the review. No server push infrastructure is needed.
   - Caveat: if iOS doesn't wake the app for background delivery, the alert waits for the next app open on any tab. Only APNs server push would remove that limit, and it is a larger piece of infrastructure.

   **Current behaviour:** Build 68 runs the reconciliation notifier only from the Log view: on appear, on a day change or foreground while it is visible, and on pull-to-refresh. A review created while the Log isn't loaded notifies only on the next Log load. Tonight that happened within seconds, because the app was foregrounded on Log. A background- or Home-driven reconcile would make the alert independent of which tab is open. That needs a Native change.
2. **Copy:** the pending-review summary pluralises wrongly: "1 possible Logger sessions". It comes from the server's `LogReadService.projectPendingReviews`. It is a one-line server fix.
3. **Test nits from the fresh review:**
   - a pending-review assertion in the "predates activation" test;
   - a resolve-then-re-ingest test for an eligible match;
   - a test for the Sep 23 runner's pending-review branch.

## Rollback

Push `7242043f` to the production branch, restore the 4 spec stamps, and force a rebuild. The fix makes no schema change or migration. The two pending reviews are ordinary review records and stay valid under the previous code.

## Next step

The Founder resolves the two pending reviews in the app (Log → review), as usual.

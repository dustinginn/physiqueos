# Strength reconciliation: why Sep 27 and Sep 28 produced no review or notification

- Agent: claude
- Generated (UTC): 2026-09-29T02:00:00Z
- Production (unchanged): `7242043f` (deployment `e22b966b`)
- Fix branch: `claude/strength-review-autoconfirm-gap-20260928` at `396e750d`. **Not deployed. No Native build is needed.**
- Production access: read-only only (READ ONLY transaction, rolled back). No reviews were created or resolved, and no data was changed.

## Answer

Both days failed at the same step for the same reason.

For each day, the Apple Watch workout and the Workout Logger session were ingested, matched, and linked as a `candidate`. The server then decided that no Founder review was needed, because the match was "certain enough to confirm automatically". But automatic confirmation is **off** in production (`linkAutoConfirm: false` since the policy was updated to v4 on Sep 25). So the match went down neither path:

- it was not auto-confirmed, and
- it was not sent to you for review.

With no review, the Log had nothing pending to show and the app had nothing to notify you about.

**This is one server bug. Nothing is wrong on the Native side.**

## Where each workout stopped

| Stage | Sep 27 | Sep 28 |
|---|---|---|
| HealthKit workout ingested | ✓ | ✓ |
| Canonical Strength workout | ✓ | ✓ |
| Logger session committed | ✓ | ✓ |
| Matcher (v5) found the match | ✓ confident | ✓ confident |
| Candidate link written | ✓ `candidate` | ✓ `candidate` |
| **Founder review created** | **✗ none** | **✗ none** |
| Pending in Log | ✗ (nothing to show) | ✗ (nothing to show) |
| Native notification | ✗ (nothing to notify) | ✗ (nothing to notify) |

**Sep 27**
- Workout: `healthkit_canonical_workout_d5eca6f3…`, traditional strength training, 22:02:48–23:00:51Z.
- Logger session: `training_logger_draft_D0BEC701…`, committed 22:59:31Z.
- Link: `healthkit_workout_link_d96bc4aa…`, status `candidate`.

**Sep 28**
- Workout: `healthkit_canonical_workout_9d2a5fb2…`, 15:22:36–16:12:54Z.
- Logger session: `training_logger_draft_34D9CBAD…`, committed 16:10:14Z.
- Link: `healthkit_workout_link_a718128a…`, status `candidate`.

**Match reasons (the same on both links):**
- "The only same-day live Logger strength session starts inside the Apple workout window."
- "The Logger completion aligns with the Apple workout end."

**No `evidenceReviews` record exists for either workout.** These two are the only `candidate` links in production. Nothing else is stranded.

## Why only now

The flaw has been present since Sep 23. It only fires when all three of these are true:

1. the match is fully aligned: the Logger completion lines up with the Watch end, so the auto-confirm gate is eligible;
2. automatic confirmation is off; and
3. there is no earlier Founder resolution.

Earlier sessions each missed at least one of these:

- **Sep 23:** automatic confirmation was still on. The review was created and confirmed automatically in the same instant.
- **Sep 24:** the Logger completion did "not yet align" with the Watch end, so the match was only *possible*. It got a normal review, and you confirmed it on Sep 27.
- **Sep 27 and Sep 28:** these were the first fully aligned matches after automatic confirmation was turned off on Sep 25.

## The fix (smallest general)

The change is in `src/application/commands/CanonicalPersistenceCommandPorts.js`, in `reassessWorkoutRelationships`.

**Before:** a confident match skipped Founder review whenever the auto-confirm gate was *eligible*.

**After:** it skips review only when it *will actually be confirmed automatically now*. That requires all of the following:
- the policy has automatic confirmation on;
- automatic confirmation is already effective;
- the link is current;
- the gate is eligible;
- there is no terminal resolution;
- there is no history conflict.

In every other case, the match gets a normal pending review like any other plausible match.

What does not change:
- When automatic confirmation is on, it behaves exactly as before.
- Matcher output and assessment ids do not change.
- There are no new records or schema changes.

## Recovery without manual action

Every HealthKit ingest re-assesses all workouts in the policy window, which starts Sep 23. The phone sends HealthKit batches routinely, so the first ordinary batch after the fix is deployed will create the two missing pending reviews. After that:

- the Log shows them;
- the existing Native notifier fires on them;
- nobody creates or resolves a review by hand;
- no new workout is needed.

Reviews are keyed by a deterministic id, so repeated batches do not duplicate or reopen them.

**Blast radius (read-only, all dates):**
- Production has 5 workout links: 3 `confirmed`, and 2 `candidate` (Sep 27 and Sep 28).
- It has 2 reconciliation reviews, both `resolved_confirmed`, and none superseded.

A stranded match needs a candidate link, so the fix will create exactly **two** pending reviews and trigger exactly two notifications. It will reopen nothing.

## Tests

The tests are in `src/application/native/HealthKitWorkoutDormantFoundation.test.js`.

**New tests:**
- **Aligned match with automatic confirmation off → one pending review, no auto-confirm.** This fails on production code and passes with the fix.
- **Already-stranded candidate (the exact production shape: link `candidate`, no review) + an ordinary later batch → the review is created by the matcher. A further batch neither duplicates it nor bumps its version.** This fails on production code and passes with the fix.
- **Automatic confirmation on and effective → still auto-confirmed, with no pending review.** This passes, so existing behavior is preserved.

**Changed tests:**
- Three existing refusal tests assumed the bug: they expected no review after an aligned ingest. Their setup now replaces the review that is correctly opened, instead of placing a foreign record into an empty slot. What they assert is unchanged.
- The bounded Sep 23 auto-confirm acceptance runner (`src/platform/operations/HealthKitStrengthAutoConfirmAcceptanceRunner.test.js`) had a fixture that built its "production-shaped" Sep 23 state (a candidate with no review) by ingesting, which relied on the same gap. The fixture now rebuilds that historical state explicitly. The runner code is unchanged (commit `396e750d`).

**Results:**
- The file passes 72/72.
- Full regression: 9139/9447 pass, with the same 303 environmental failures as the production baseline and **0 new**.
- Fresh-context review: **APPROVE WITH NITS.** Its checks:
  - It found no path where a match is both reviewed and auto-confirmed. A confident match gets a review if and only if the auto-confirm step will not run, and that step's guard is the same condition.
  - It found no remaining stranding path. The fix also closes a second latent one: an existing pending review was superseded as soon as a match became gate-eligible while automatic confirmation was off.
  - Reassessment is idempotent: the review id is deterministic and unchanged facts cause no write.
  - The runner fixture change is legitimate.
  - Nits, none blocking:
    - assert a pending review exists in the "predates activation" test;
    - add a resolve-then-re-ingest test for an eligible match;
    - add a test for the Sep 23 runner's pending-review branch.

## Not done (by instruction)

- The fix is not deployed and no Native build was cut. **Deploying the fix needs your explicit go-ahead.**
- No review was created or resolved manually.
- You were not asked to log another workout.

## Recommended next step

Approve deploying `396e750d` through the guarded workflow:
- push to the production branch;
- stamp the spec;
- force a rebuild;
- verify.

Then confirm with read-only checks that the two pending reviews appear on the next routine ingest and that the Native notification fires.

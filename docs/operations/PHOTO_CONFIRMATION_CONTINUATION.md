# Progress Photos confirmation continuation: memory, lease, and dead-letter behavior

Status: corrected in the Server candidate that follows production `e5073f14`.

## What happened

The real Build 46 Progress Photos confirmation was accepted and its canonical work
(PhotoSession, five photos, compatibility rows, the Sep 19 priority) completed, but the
review stayed `committing` and Native kept saying "Processing" for more than 20 minutes.
The `analysis` continuation step never finished: the worker process died with
`Reached heap limit` (about 506 MB of a 1 GB instance) on every attempt, its 60 second
lease lapsed, and the same message was re-claimed and died again. A process that dies
never calls `fail()`, so nothing ever marked the message or the review failed.

## Measured root cause

Production canonical runtime: 52.6 MB of canonical JSON (analyses 23.5, dailyBriefings 13.9,
evidenceReviews 6.5, evidencePackages 4.7, canonicalEvidenceObjects 2.1). Profiled read-only
inside the production console (loadCanonicalRuntime and structuredClone of the real runtime):

| Operation on the real runtime | Heap |
| --- | --- |
| load the whole canonical runtime | 76 MB retained |
| plus the read repository's clone | 154 MB retained |
| one whole-runtime repository write (load, clone, two canonical-JSON snapshots) | 324 MB peak |

`resolvePhotoEventContext` issues four repository reads with `Promise.all`. Outside a read
scope every read loads and clones the entire runtime, so the analysis step held four 154 MB
graphs at once and exhausted the ~500 MB heap. The step then wrote each per-view analysis with
its own whole-runtime write. Earlier steps of the same review showed the same pressure: the
compatibility step needed four attempts and ran five per-photo whole-runtime writes.

Not the cause, verified from source and production metadata:

* The five ProRAW/DNG originals (38.2 to 44.1 MB) are never loaded by analysis. Every photo
  carries a linked JPEG derivative (0.6 MB), and prior comparison photos are at most 4.6 MB.
* The image-to-model path is small: five sequential calls peak at about 31 MB of heap and
  17 MB external including the 7 MB request body, and retain 24 MB afterward.
* There is no leak across messages: retained heap is flat across repeated analysis steps.

## Local profile (real facade code, production-scaled synthetic data, 512 MB heap limit)

| Scenario (52.6 MB runtime, 40 MB baseline) | Before | After |
| --- | --- | --- |
| four concurrent Goal-context reads | out of memory | 290 MB peak (one scoped load) |
| analysis step: reads then per-view writes | out of memory | 379 MB peak (worst case, back to back) |
| six per-view analysis writes | 510 MB peak | 203 MB peak (one bounded write) |
| compatibility photo writes | 521 MB peak | 113 MB peak |

Encoding one 44 MB DNG original into a request would cost about 117 MB heap and 147 MB
external, which is why the loader now refuses originals.

## Corrections

1. `readPhotoEventContext` runs the four reads inside one read scope.
2. Analysis, goal-evaluation, and progress-photo compatibility writes use the bounded
   runtime mutation of only their own collection (`ConfirmationBoundedWriters`). A photo
   session's analyses are persisted in one write. Replays replace stable analysis ids.
3. `PhotoAnalysisMediaLoader` accepts only bounded, vision-supported renditions
   (JPEG, PNG, WebP, GIF up to 16 MiB). A DNG or HEIC original is refused before any bytes
   are downloaded. Canonical originals remain the source artifact, derivatives remain the
   analysis and display artifact.

## Lease and retry semantics

* A message is claimed with a 60 second lease, renewed every 20 seconds while the handler
  runs. A healthy worker keeps ownership of arbitrarily long legitimate work. A test proves a
  four minute handler renews and acknowledges normally on the original code as well, so the
  lease length was never the independent cause of the loss.
* What made ownership fragile: a single transient renewal error permanently flagged the lease
  lost, and a worker starved by garbage collection could not renew at all. Now only an
  authoritative "no row" answer or the local lease lapsing counts as loss.
* `assertLease` is passed to the continuation. Analysis checks it before every vision request
  and before persisting, so a worker that lost its message stops instead of duplicating minutes
  of provider work, and it does not fail or overwrite a claim a successor now holds.
* A message claimed more than the maximum without ever being acknowledged or failed is a
  poison message (it keeps killing the process). It is dead-lettered without running, and the
  owner is told. Handler failures were already bounded; process crashes were not.
* The continuation owner fails the active claim (`failEvidenceReviewCommit`), so the review
  becomes `partially_committed` with an explanatory `commitError`. Native then stops showing
  "Processing". This resumes through the existing idempotent path: completed steps are skipped
  and the first incomplete step runs. Only the operation that owns the claim can fail it, so a
  stale dead-letter cannot fail a healthy review.

## Recovery of the spent message

The corrected worker will dead-letter the existing spent message (claimed many times by a
process that died each time) and mark its review `partially_committed`. The review, canonical
records, and completed steps are correct. Recovery only gives that one outbox row a fresh
attempt budget:

```
node scripts/operations/buildEvidenceReviewContinuationRecoveryPayload.mjs \
  --sha <deployed 40-hex> --mode dry-run --out <payload.mjs>
```

Dry-run runs in `REPEATABLE READ READ ONLY`, verifies the review, package, intake, completed
steps, claim operation, singleton PhotoSession, five canonical photos, exactly one Sep 19
priority completion, no analyses and no Photo Event, and that no other continuation is active,
then prints the one row it would change. Apply requires `--authorization-ref`, takes the owner
lock, re-reads, and updates the single row fenced by its observed status and attempt count.
It writes no review, canonical, analysis, priority, media, or briefing record.

## Known residual risk (not changed here)

* The Goal-context read scope still loads the whole runtime once (about 290 MB peak at
  production size). A bounded collection read would make this independent of runtime growth.
* `scheduled_completion` still writes the priority through the whole-runtime repository once.
  It completed on its first attempt under the same load.

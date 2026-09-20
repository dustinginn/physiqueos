# Bounded repair of the pending Build 45 Progress Photos review

Status: **designed and tested offline. Not executed.** Executing it requires a separate, explicit Founder authorization and a deployed Server that contains the corrected Goal resolver.

## Why an administrative repair and not an application command

The review `evidence_review_B5A63452E7B0469CA63438A08137716C` (package `evidence_submission_B5A63452E7B0469CA63438A08137716C_progress_photos`, intake `evidence_intake_B5A63452-E7B0-469C-A634-38A08137716C`) is pending, version 1. Its photo 3 was stored as rear + relaxed + double biceps, which contradicts the canonical pose contract, and its session Goal relationship was left `needs_review` by the earlier resolver.

The application's command architecture has `evidence-review.edit`, a general review editor, and the confirmation command. Using the editor would introduce exactly the post-upload pose editor the Founder ruled out, and a Native session could not run it. Confirmation cannot repair anything: it refuses. A bounded administrative repair, run once through the accepted production console runner, is the smaller and safer instrument: it can change only what one authorization names.

## What it changes (and nothing else)

The single authorization is `src/platform/operations/build45ProgressPhotosReviewRepairAuthorization.js`.

| Change | From | To |
| --- | --- | --- |
| Photo 3 contraction (`photos[2]`: `contractionState`, `pose`, `poseId`, `label`) | rear + relaxed + double biceps (`rear-relaxed-double_biceps`) | rear + flexed + double biceps (`back-flexed`, "Rear Flexed — Double Biceps") |
| The review's copy of that submitted identity (`review_metadata.recoveryContext.photoIdentities[2]`) | same | same |
| Session Goal relationship | `needs_review` | `resolved` to the goal the corrected resolver selects, which must equal the authorized Build Lean Mass goal |
| Audit | none | one entry in `interpretedEvidence.review_metadata.corrections` (`progress_photo_session_repair`, who, basis, when, exact from/to) |
| `updatedAt` and version | 1 | 2 |

Unchanged, and proven unchanged before any write: photo bytes, artifact hashes, DNG originals, analysis derivatives, storage and analysis paths, the other four pose identities, time of day (afternoon), effective date, submission and session identity, provenance, the intake receipt (the as-submitted record, deliberately not rewritten), the evidence package record, priority state, and review status/confirmation.

## Guards

`planPhotoSessionReviewRepair` refuses, with a specific code, unless all of these hold: the exact review, intake, package, and photo-session object ids; status `pending`; version equal to the inspected version; no confirmation, claim, item decision, or commit progress; photo 3 carries exactly the authorized "from" identity, and its copy in the recovery context matches; every other photo is already canonical; the Goal relationship is exactly the unresolved state; the corrected resolver deterministically selects the authorized Goal; and the diff between the review and the planned review touches only the authorized paths. It also proves the repaired review passes `assertEvidenceCanonicalCommitReady`.

The runner (`PhotoSessionReviewRepairRunner.js`) writes through the application's own canonical record store with `expectedVersion`, so it cannot overwrite a review that changed after it was inspected. Apply mode takes the owner runtime lock, advances the runtime revision like every canonical write, and commits one transaction. A second run reports `already_applied` and writes nothing.

## Operating it (later, when separately authorized)

1. Deploy the Server that contains the corrected resolver. Verify it.
2. Build the dry-run payload bound to the production commit, run it through the accepted console runner, and read the reported `changedPaths` and `readinessAfterRepair`:

   ```bash
   node scripts/operations/buildPhotoSessionReviewRepairPayload.mjs --sha <production-commit> --mode dry-run --out <payload.mjs>
   ```

   The dry run is a `REPEATABLE READ READ ONLY` transaction with `transaction_read_only = on` and writes nothing.
3. With explicit authorization, build the apply payload with a non-empty `--authorization-ref` and run it once.
4. Verify read-only that the review is version 2, pending, all five poses canonical, the Goal resolved, and nothing else changed. Only then may the Founder confirm.

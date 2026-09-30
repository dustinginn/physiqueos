# Photo Intelligence — corrected Sep 19 final replay blocked at candidate review

## Status

**BLOCKED before private replay.** Independent review of corrective candidate `1f7709aeee569977c2905978d19695db64b2f566` found that the claimed photo-only context boundary is not guaranteed. Per the controlling task, no Sep 19 replay was run and no final Photo Briefing copy was generated.

- Repository: `dustinginn/physiqueos`
- Branch: `codex/photo-intelligence-guarded-deploy-20260929`
- Reviewed candidate: `1f7709aeee569977c2905978d19695db64b2f566`
- Current production authority: `446bc964dc31318ea48261400e8b243cdd1d4ab1` (not reverified live in this blocked review)
- Production deploy from this task: none
- Native/TestFlight: untouched
- Historical regeneration: none
- Production mutation: none

## Blocking finding

The candidate removes the explicit `goalContext` argument and strips `conditions.notes`, but it still serializes multiple caller-controlled strings into the perception model request:

- `photoSetId` (`getCanonicalPhotoPerceptionUserPrompt`, line 106);
- prior `photoSetId` (line 112);
- original `fileName` (normalized at line 272 and serialized at lines 109/115);
- raw `capturedAt` (line 276 and serialized at lines 109/115);
- arbitrary string or number values for allow-listed condition keys, including `lighting`, `location`, `timeOfDay`, `cameraDistance`, `framing`, `angle`, `clothing`, and `editing` (lines 283–291).

That means Goal, phase, guardrail, strategy, or desired-outcome language can still cross the model-input boundary under a different metadata key. The provenance record then unconditionally asserts `goalContextUsed: false` and `nonPhotoEvidenceUsed: false`, so it can make a false boundary attestation.

### Deterministic reproduction

A sanitized adversarial prompt construction supplied Goal language only through fields the candidate currently accepts:

```json
{
  "containsVisibleAbs": true,
  "containsBuildLeanMass": true,
  "containsGuardrail": true,
  "containsStrippedNotes": false
}
```

This proves that stripping `notes` is insufficient. No private Founder data was used in the reproduction.

## Review outcome by requirement

| Requirement | Review result |
|---|---|
| No explicit Goal/phase/guardrail/strategy parameter | Pass |
| Capture metadata cannot smuggle Goal text | **Fail — blocker** |
| Symmetric visual policy | Pass by static prompt review |
| Stable / no-obvious-deterioration / insufficient first-class | Pass by policy and deterministic tests |
| Observation-specific comparability | Pass by schema/static review |
| Perception frozen before Goal interpretation | Pass by static review |
| Producer/model/prompt-policy/context provenance | Fields exist, but context-boundary truthfulness fails when metadata carries non-photo context |
| Legacy schema-13 cannot become prospective authority | Pass for the prospective evidence-confirmation path reviewed |
| Historical artifacts immutable | Pass; candidate does not migrate/rewrite history |
| Multi-view/holistic compatibility | Previously validated; not rerun after this pre-replay blocker because candidate SHA is unchanged |
| Case 1/2 frozen artifacts | Pass: hashes remain unchanged |

## Required correction before another acceptance attempt

The narrow fix is to serialize only internally constructed, semantically constrained photo metadata:

1. Do not send caller-provided `photoSetId`, prior set ID, or original filename to the model. Use ordinal labels such as `current_image_1` and `previous_image_1` if labels are needed.
2. Validate dates and serialize only normalized `YYYY-MM-DD` values; do not send raw `capturedAt` strings.
3. Replace the current condition primitive allow-list with strict typed normalization:
   - booleans for `morning`, `fasted`, `postWorkout`, `pump`, `sameLighting`, and `editing` where applicable;
   - small closed enums for lighting, time of day, framing, angle, camera distance, and clothing only if the product actually defines those enums;
   - omit location/free text from perception unless represented by a safe closed enum.
4. Construct comparison metadata internally from sanitized values only.
5. Add adversarial tests for every serialized metadata field, including IDs, filenames, dates, conditions, and prior-set fields. The test should prove that Goal/phase/guardrail strings cannot appear in the generated perception prompt.
6. Only assert `goalContextUsed: false` and the photo-only context boundary after the sanitized prompt-input object passes this invariant.

Do not solve this with a blacklist of Goal names. The boundary should be guaranteed by typed construction.

## Validation actually run

- Adversarial model-input boundary check: **failed as expected**, proving the blocker.
- Candidate/continuation deterministic suite: **2 files, 19/19 tests passed**. These tests do not cover the discovered alternate-field injection.
- ESLint on all four candidate files: **passed**.
- Frozen Case 1 SHA-256: `52f45d6261b81528873c62575eee40117709fd7d63fdc69e1d9965472aba3a7d`.
- Frozen Case 2 SHA-256: `255249d13d49f6e99c261bf283f161ee7cce88a6c5064954d2c0623657899f03`.

Not run because review stopped at the blocker:

- private Aug 22 → Sep 19 five-view inference;
- corrected multi-view set reconciliation;
- Build Lean Mass/guardrail interpretation;
- cutoff evidence re-verification;
- holistic synthesis;
- UI realization / exact Photo Briefing copy;
- production build (no code changed in this review);
- live production health re-verification.

## Safety and local-state attestation

- No production DB or object-store access was required for this review.
- No Founder photo bytes were read or sent to a provider.
- No provider response was created.
- No private bytes, paths, signed URLs, or credentials are included here.
- No code change was made; only this sanitized checkpoint and the Photo Intelligence latest pointer are intended for GitHub.
- Ignored local audit harnesses from the prior authorized audit remain local and are intentionally not published.

## Decision and safe next step

**Do not accept `1f7709ae` for acceptance replay or production supersession.** Revise the prompt-input boundary as described above, publish a new exact candidate SHA, and repeat the independent review. Only after that review passes should the private five-view corrected replay and exact UI copy generation proceed.

Production `446bc964` remains physically live and unchanged. This report does not re-accept its photo perception as authoritative for subtle new directional claims.

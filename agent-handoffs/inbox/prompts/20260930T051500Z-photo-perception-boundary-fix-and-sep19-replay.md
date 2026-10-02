Photo Intelligence continuation — close perception metadata boundary, re-review, then generate corrected Sep 19 copy

STANDING REPORTING PROTOCOL

Before stopping for any reason, obey:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

PARENT TASK

agent-handoffs/inbox/prompts/20260930T043000Z-photo-intelligence-corrected-sep19-final-copy.md

BLOCKED REVIEW

agent-handoffs/reports/20260930T035859Z-photo-intelligence-corrected-sep19-final-replay-blocked.md

Rejected candidate:
1f7709aeee569977c2905978d19695db64b2f566

DECISION

The independent review blocker is accepted.

Proceed with the narrow correction required to make the canonical photo-perception model-input boundary structurally Goal-blind.

Do not broaden scope.

REQUIRED INPUT-BOUNDARY CORRECTION

The perception provider request must be constructed only from internally generated, semantically constrained photo/capture data.

1. IMAGE LABELS / IDENTIFIERS

Do NOT serialize to the model:
- caller-provided photoSetId;
- prior photoSetId;
- canonical IDs;
- evidence IDs;
- media IDs;
- original filename;
- storage key/path;
- arbitrary caller labels.

If labels are required, generate them internally:
- current_image_1
- previous_image_1
etc.

The provider should not need business-domain identifiers to perceive pixels.

2. DATES

Do not serialize raw caller date strings.

Parse/validate dates before prompt construction and serialize only normalized date values needed for chronology, preferably YYYY-MM-DD.

Reject or omit malformed values.

The raw input string must never pass through merely because parsing failed.

3. CAPTURE CONDITIONS

Replace primitive/free-form condition acceptance with strict typed normalization.

Prefer booleans for facts such as:
- postWorkout;
- pump;
- fasted;
- morning;
- sameLighting;
- edited/unedited only if reliably known.

For categorical capture facts, use small closed enums only where PhysiqueOS actually defines a useful vocabulary, for example:
- lighting;
- framing;
- cameraDistance;
- cameraAngle;
- timeOfDay;
- clothing coverage.

Do not invent elaborate enums merely to preserve old metadata.

Do NOT pass arbitrary:
- location;
- notes;
- free-form lighting descriptions;
- free-form clothing descriptions;
- free-form framing/angle strings;
- arbitrary numbers/strings;
- user-entered text.

Unknown/unsupported metadata should be omitted, not stringified.

4. INTERNAL COMPARISON METADATA

Construct all model-visible comparison metadata internally from the sanitized typed object.

Do not spread/copy caller objects into prompt payloads.

5. BOUNDARY ATTESTATION

Only emit provenance claims such as:
- goalContextUsed=false;
- nonPhotoEvidenceUsed=false;
- photoOnlyContextBoundary=true;

after the exact sanitized provider-input object has passed the boundary invariant.

If the invariant cannot be established, fail closed before provider invocation.

Do not merely set the provenance booleans optimistically.

6. ADVERSARIAL TEST MATRIX

Add deterministic tests attempting to smuggle:
- Visible Abs;
- Build Lean Mass;
- guardrail;
- phase;
- strategy;
- target body fat;
- arbitrary coaching instructions;

through every input surface that can reach perception, including:
- current/prior IDs;
- filenames;
- dates;
- each capture condition;
- prior-set metadata;
- unknown keys;
- nested values;
- arrays/objects if accepted by public APIs.

Prove those strings do not occur anywhere in:
- provider system prompt;
- provider user prompt;
- serialized metadata;
- model-visible image labels.

Do not use a blacklist as the production defense. Adversarial strings are test probes only.

7. PRESERVE ACCEPTED ARCHITECTURE

Do not change:
- symmetric visual-perception policy except as required for the boundary;
- stable/no-obvious-deterioration/insufficient semantics;
- observation-specific comparability;
- Goal interpretation boundary;
- holistic evidence cutoff;
- multi-view reconciliation;
- historical immutability;
- Case 1/2 frozen artifacts.

Do not implement the paused coach-copy patch yet.

REVIEW GATE

After correction:
- commit/push a NEW exact candidate SHA;
- run targeted deterministic tests;
- lint/diff/build as appropriate;
- run a fresh independent review specifically against the model-input boundary.

The reviewer must attempt to break the boundary, not merely inspect the happy path.

If ANY arbitrary semantic caller text can still reach perception:
STOP.
Publish checkpoint.
Do not read Founder photos or run the final replay.

AUTOMATIC CONTINUATION IF REVIEW PASSES

If and only if the independent boundary review passes with no blocker:

Continue automatically into the final zero-write Sep 19 replay specified by the parent task.

Do not wait for another Founder decision.

Use the exact canonical Aug 22 -> Sep 19 five-view media and the corrected candidate.

Pipeline:
pixels
→ canonical_photo_perception_v1
→ freeze photo-only perception
→ multi-view reconciliation
→ Build Lean Mass + actual guardrail interpretation
→ time-causal holistic evidence synthesis
→ exact Photo Briefing realization.

Reverify the eligible evidence cutoff from canonical production records.

Do not tune to human wording.

EXACT COPY DELIVERABLE

Publish the exact generated Photo Briefing in actual display order:

1. Hero headline
2. Hero supporting copy
3. Snapshot
4. Progress — What visibly changed
   - every matched pose/photo;
   - short caption under each
5. Interpretation — What the complete evidence means
6. Coach's Insight
7. Next item

Then separately provide a copy-quality assessment.

Do not rewrite the engine output before presenting it.

The primary acceptance question is whether objective/stable visual perception can become useful Goal-aware coaching once combined with the measured evidence, without inventing visual improvement.

PRODUCTION SAFETY

No deploy.
No production mutation.
No historical regeneration.
No TestFlight.
No Native work.
Do not touch Claude Build 70.
Do not touch auth.
Do not commit private Founder photo bytes/paths.

The current production Photo Intelligence remains unchanged during this work.

REPORTING

If blocked:
publish a GH checkpoint before stopping.

If successful:
publish:
agent-handoffs/reports/<timestamp>-photo-intelligence-sep19-corrected-final-replay.md

Include:
- new candidate SHA;
- independent boundary-review result;
- adversarial tests;
- exact source identity/provenance;
- exact corrected PI result;
- eligible holistic evidence;
- exact display-order copy;
- copy-quality verdict;
- zero-write attestation;
- recommendation on superseding current production.

Update Photo Intelligence latest pointer.

END CONTINUATION.

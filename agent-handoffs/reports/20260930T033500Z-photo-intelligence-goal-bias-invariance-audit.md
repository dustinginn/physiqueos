# Photo Intelligence — Goal-bias invariance and legacy contamination audit

**Verdict:** the concern is confirmed. The Sep 19 canonical result is not trustworthy as a Goal-invariant pixel interpretation. The deployed raw-image API accepts Goal context inside the perception request, its system policy independently privileges cut/leanness/abdominal-improvement narratives even when Goal context is blank, and the current set producer reconciles stored schema-13 observations rather than re-reading pixels. The exact raw-image Goal-blind control found no supported directional change in any of the five Aug 22 → Sep 19 pairs.

The previously proposed Photo Briefing copy correction remains paused. Production and historical artifacts were not changed. An isolated corrective candidate is published at `1f7709aeee569977c2905978d19695db64b2f566` for review only; it was not deployed.

## What the exact-source run found

The audit resolved the same ten canonical JPEG analysis renditions used for the five like-for-like Aug 22 → Sep 19 views and verified every object by its stored SHA-256 before inference. The raw-image candidate received only image bytes, dates, view/pose, and allow-listed capture conditions. It did not receive prior sample copy, human conclusions, DEXA, weight, Goal, phase, guardrail, strategy, training, nutrition, activity, or sleep data.

All five Goal-blind reads returned `overall_photo_only_magnitude=none` and `photo_only_reliability=moderate`:

| Pair | Goal-blind visual result |
|---|---|
| Front relaxed | Leanness stable; abdominal definition stable; muscularity stable; softness stable. Ab definition was limited/low-confidence because lighting and pump conditions compromise subtle claims. |
| Rear relaxed | Back leanness stable; upper-back muscularity stable; whole-body softness stable. |
| Rear flexed | Leanness, softness, and muscularity stable. A rear pose is limited for abdominal-definition claims. |
| Right-side relaxed | Leanness, abdominal definition, softness, and muscularity stable. |
| Front flexed | Leanness, abdominal definition, softness, and muscularity stable. |

This result was not tuned to the Founder's manual interpretation. The manual review was never included in the model input.

## A/B/C Goal-invariance result

The deployed API cannot perform the required test correctly: its `interpretPhotoSetWithVision` API accepts `goalContext` in the same request that produces `structured_observations`. That is an architecture defect.

The isolated candidate therefore creates perception once, deep-freezes it, and applies Goal context only to a downstream pure interpretation boundary:

- A: no Goal;
- B: false `Visible Abs` Goal;
- C: correct `Build Lean Mass` Goal plus the 8–9% body-fat guardrail.

For every exact source pair, the following fields were byte-identical across A/B/C:

| Field | A vs B | A vs C |
|---|---:|---:|
| Source/view classification | identical | identical |
| Capture-comparability dimensions | identical | identical |
| Observation-specific comparability | identical | identical |
| Regional observations and direction | identical | identical |
| Apparent magnitude | identical | identical |
| Confidence | identical | identical |
| Confounders | identical | identical |
| Overall photo-only magnitude | identical | identical |
| Photo-only reliability | identical | identical |

Only downstream meaning changed. A remained `goal_blind`; B characterized stable leanness as maintained with limited further visible fat-loss progress; C found no clear build direction because this exact run did not find increased muscularity. No Goal rewrote a visual field.

The complete source bindings, field identity result, per-view findings, and raw-vs-legacy comparison are in [the machine artifact](../photo-intelligence/founder-cases/sep19-goal-bias-invariance-audit-20260930T032718Z.json), SHA-256 `27244f128eae0bf9f3d2550cbb2a67e0429e92f5de00017c6df8d03183088808`.

## Legacy schema-13 provenance

The Sep 20 source analyses were created between 17:07 and 17:09 UTC through `PhotoInterpreterService.interpretPhotoSetWithVision`. The production app has no `OPENAI_PHOTO_INTERPRETER_MODEL` override, so the producer default was `gpt-4.1-mini`.

The actual Goal context reconstructed from the production record was:

> Active primary goal: Build Lean Mass. Active phase: Lean Mass Build. Operating state: calibration. Completed prior goal: Visible abs at rest. Photo evidence date: 2026-09-19.

So the analyses were not generated under an active Visible Abs Goal. They were nevertheless contaminated in two independent ways:

1. Goal, phase, operating state, and completed prior Goal entered the same prompt that produced the visual observations.
2. The system prompt itself carried legacy leanness/cut priors. It asked whether the overall physique looked “meaningfully improved,” made conditioning a dedicated category, enumerated waist/abs/softness signals, included cut-specific rules, and directed the model toward a coach/trajectory/strategy judgment in the same response.

The stored result confirms that boundary collapse: each object combines structured visual observations with `trajectory_classification`, `goal_relevance`, plan decisions, fat-loss framing, and strategy recommendations.

The strongest available source attribution is the Sep 20 implementation at `ebce7b97c31184ea95a7fe7d4b4d9435ae641c6b` (source blob SHA-256 `9e18e3085557f9bb4b85626227c478f6ff8bf58d`). However, schema 13 persisted neither model, prompt/policy version, nor prompt hash. Therefore the exact historical request cannot be cryptographically attested from the record. That provenance gap is itself a confirmed defect; the report does not pretend otherwise.

## Raw goal-blind vs legacy vs current set

| Pair | Stored legacy analysis used by current PI | Current raw-image Goal-blind result |
|---|---|---|
| Front relaxed | Shoulder/arm muscularity increased; waist leanness and ab definition increased | All four visual categories stable |
| Rear relaxed | Waist leanness and conditioning increased; upper-back muscularity stable | Back leanness, softness, and muscularity stable |
| Rear flexed | Back leanness increased `pronounced`; waist softness decreased; muscularity stable | Leanness, softness, and muscularity stable |
| Right-side relaxed | Waist leanness increased and softness decreased `moderate`; muscularity stable | Leanness, ab definition, softness, and muscularity stable |
| Front flexed | Waist leanness and ab definition increased `moderate`; muscularity stable/insufficient by region | Leanness, ab definition, softness, and muscularity stable |

`canonical_photo_intelligence_set_v1` does not re-analyze pixels. It consumes those stored legacy observations, reconciles them across views, and realizes a set narrative. Thus its three-view waist corroboration and `moderate/supportive` conclusion inherit the upstream source analyses.

A second control ran the deployed raw-image producer with `goalContext` blank. It still called leanness or conditioning improvement in all five views. The front-relaxed output also contained an internal semantic conflict: machine direction `leanness: decreased` paired with prose saying the waist circumference reduced and taper improved. Removing the Goal value alone therefore does not produce a neutral perception layer.

## Comparability diagnosis

The current set's `high` comparability is too coarse for the conclusions it supports. At set level, five exact pose/view matches and zero unmatched views effectively yield high comparability. That is useful for routing pairs, but it does not establish that every metric is highly comparable.

The missing distinction is claim-specific:

- camera distance, framing, and geometric scale can limit width, taper, circumference, silhouette, and regional-size direction;
- lighting can limit subtle definition and vascularity;
- pump state can limit fullness and definition;
- arm/scapular placement can limit shoulder, lat, and back-width claims;
- a pair may still support broad stability or “no obvious deterioration” while being weak for a small directional claim.

The isolated candidate records both global capture dimensions and, per observation, a rating, applicable claims, compromised claims, rationale, and confounders. It explicitly increases the effect of capture differences as apparent biological magnitude becomes smaller. This avoids globally discarding useful pairs while preventing a broad pose match from silently authorizing a subtle waist-width claim.

## Stability audit

The deployed policy says stability is valid, but its broader prompt has asymmetric incentives toward an interesting improvement narrative: meaningful improvement, conditioning, leaner/harder/sharper, a 3–6-change final pass, strategy recommendations, and Goal-connected coaching are requested in one completion. The exact blank-Goal control demonstrates that those incentives remain active without Goal data.

The candidate makes stable, no obvious deterioration, and insufficient directional evidence first-class outputs. Stable normally requires magnitude `none`; directional findings require a supported non-zero magnitude. Deterministic tests cover stable waist/leanness, stable muscularity, observation-specific limitations, and contamination rejection.

## Isolated corrective candidate

Candidate `1f7709aeee569977c2905978d19695db64b2f566` is intentionally narrow:

- adds `canonical_photo_perception_v1`, whose API has no Goal or non-photo evidence parameter;
- filters capture metadata through an allow-list so free-form notes cannot smuggle Goal/strategy context into perception;
- uses symmetric leanness, ab-definition, softness, muscularity, and stability policy;
- freezes canonical perception before the separate Goal-interpretation function runs;
- makes observation-specific comparability part of the schema;
- persists producer, model, prompt-policy version, and explicit context boundary;
- rejects unverified/legacy goal-aware provenance as a prospective canonical source;
- changes only the prospective evidence-confirmation producer; historical analyses and Photo Briefings remain untouched.

Compatibility behavior is deliberate. Existing schema-13 records remain readable for their historical artifacts. They are not relabeled or migrated in storage. New confirmed Photo Events receive a new producer/version and stable analysis identity, so a legacy record cannot silently masquerade as the new canonical perception producer.

No realization-copy patch, holistic-copy polish, historical regeneration, deployment, Native change, auth change, or unrelated work is included.

## Holistic synthesis boundary

The existing holistic causality tests remain green. The candidate does not treat evidence as conflicting merely because numeric directions differ. Goal-relative compatibility remains downstream: for Build Lean Mass, increased measured lean mass, body fat moving into an accepted guardrail, and a visually stable waist can all be compatible without rewriting photo perception or inflating visual confidence.

Copy correction should be reconsidered only after this perception boundary is accepted and a fresh zero-write replay is run through the reviewed candidate.

## Validation

- Exact private Aug 22 → Sep 19 source audit: five pairs / ten verified JPEG renditions.
- A/B/C required perception fields: identical across all Goal contexts.
- Deterministic Goal-swap fixtures: three required cases pass.
- Observation-specific comparability and stable-result tests: pass.
- Legacy/unverified source contamination rejection: pass.
- Targeted Server/intelligence suite: 8 files, 144/144 tests pass.
- Multi-view and holistic time-causality regressions: included in the passing suite.
- ESLint on all changed files: pass.
- Production Next.js build: pass. The first sandboxed attempt could not bind Turbopack's internal port; the authorized unsandboxed rerun completed successfully. Existing NFT trace warnings remain unchanged.
- Frozen Case 1 SHA-256 remains `52f45d6261b81528873c62575eee40117709fd7d63fdc69e1d9965472aba3a7d`.
- Frozen Case 2 SHA-256 remains `255249d13d49f6e99c261bf283f161ee7cce88a6c5064954d2c0623657899f03`.
- `git diff --check`: pass.

## Fresh-context review

A post-implementation review was performed from the committed diff and public API boundary, separately from the image-result interpretation. It found and closed one potential leak before the candidate commit: free-form `conditions.notes` could otherwise have carried Goal text despite removal of the explicit Goal parameter. The final candidate now allow-lists only capture facts and has a regression test proving Goal text in notes does not enter the prompt.

The review also verified that Goal context is no longer read during prospective photo perception, the old source analyses are not mutated, source bytes/paths are not committed, the set and holistic contracts still build, and the candidate is not wired into historical reinterpretation. No independent external reviewer has accepted the candidate yet; a separate ChatGPT review request is published with this report.

## Recommendation

`446bc964` should be **superseded for future Photo Events after review**, not treated as an accepted perception implementation. It may remain physically live while review is pending because this task forbids deployment and no production mutation was authorized, but new Photo Intelligence produced by its legacy perception path should not be used as authoritative evidence of small directional visual change.

Do not deploy the candidate directly from this audit. First obtain independent review of the boundary and artifact, then run a zero-write acceptance replay of the candidate's full perception → set → Goal interpretation → holistic path. If that passes, supersede `446bc964`; only then revisit the paused user-facing copy correction.

## Zero-write and privacy attestation

- Production DB reads ran under `REPEATABLE READ READ ONLY` and explicitly rolled back.
- No production row, object, analysis, Photo Briefing, Goal, or history was changed.
- No deployment or Native action occurred.
- The exact ten JPEG renditions were sent to the configured vision provider only after explicit Founder authorization and solely for this audit.
- Temporary provider response objects were deleted after retrieval.
- No photo bytes, private object paths, signed URLs, or credentials were emitted or committed.

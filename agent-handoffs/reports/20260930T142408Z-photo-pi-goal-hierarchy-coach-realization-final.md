# Photo PI Goal hierarchy and coach realization — final zero-write Sep 19 replay

Status: **PASS — implementation, fresh review, and authorized zero-write production replay complete; exact current-engine UI copy published; not deployed**

Repository: `dustinginn/physiqueos`  
Branch: `codex/photo-intelligence-guarded-deploy-20260929`  
Implementation candidate: `9a89ff903fd587839c53e5f896d5ae9c08d1aaa0`  
Frozen perception candidate: `0d0f189e8ccddaf69c5d4b833b8c2a82ce49723b`  
Task: `agent-handoffs/inbox/prompts/20260930T060000Z-photo-pi-goal-hierarchy-coach-realization.md`

## Decision

The downstream correction passes the requested review and the real Sep 19 five-view replay.

- Goal-blind perception remains frozen at `0d0f189e`; its implementation and adversarial boundary test are byte-identical to that candidate.
- The canonical Goal now reaches downstream synthesis with its Build Lean Mass target and all four accepted guardrails, including `Maintain approximately 8–9% body fat.`
- The actual fresh photo result is stable across all five matched views: every observation direction is `stable`, every apparent magnitude is `none`, and set reliability is `moderate`.
- Photos do not establish muscle gain. DEXA establishes `+5.0 lb` lean mass; the latest DEXA establishes `8.1%` body fat inside the accepted `8–9%` guardrail.
- The exact current-engine briefing is concise, nonredundant, and coach-like. It contains one short sentence beneath every matched pose and no raw observation stack.
- No production artifact or history was created, changed, published, regenerated, or deleted. No deployment or Native change occurred.

Recommendation: **accept `9a89ff90` for deployment review. Do not deploy from this task.**

## Exact current production-engine user-facing copy, in actual UI display order

The following is copied verbatim from `exactCurrentProductionEngineUserFacingCopy.displayOrder`. The canonical JSON serialization of that display-order array has SHA-256 `5c0ab7cbed4e1894386e6fdcdb7b8659bcfb386c2c8fa202cdaf3e7e34d39488`.

### 1. Photo Event

**Measured lean mass is moving up before the photos show a clear change.**

Your primary measurement is moving in the intended direction, the accepted guardrail is holding, and the matched views look broadly stable.

### 2. Snapshot

**This photo session**

- Date: `2026-09-19`
- Set: `5 confirmed views`
- Weight: `172.7 lb`
- Poses: `Front relaxed`; `Rear relaxed`; `Rear flexed — double biceps`; `Right side relaxed`; `Front flexed`
- Conditions: `Taken after your workout, after eating.`

### 3. Progress

**What visibly changed**

The matched views show broad visual stability across the full photo set.

The exact short copy beneath each matched pose, in engine order:

1. **Front relaxed** — Your front-relaxed shape and waist look broadly unchanged.
2. **Rear relaxed** — Your rear shape and muscularity look broadly unchanged.
3. **Rear flexed — double biceps** — Back size and definition look broadly unchanged.
4. **Right side relaxed** — Your side profile and waist look broadly unchanged.
5. **Front flexed** — Muscle fullness and definition look broadly unchanged.

Each comparison carries `previousDate: 2026-08-22`; the replay's structured `currentDate` field is `null`, while the event/snapshot date is `2026-09-19`. Each comparison's `supportingObservations` and `findings` arrays is empty by design, so the viewer receives exactly the one sentence above rather than repeated raw observations.

### 4. Interpretation

**What the complete evidence means**

DEXA measured a 5.0 lb increase in lean mass from August 15, 2026 to September 12, 2026. The latest scan measured 8.1% body fat, within the accepted 8–9% guardrail. The matched photo views look broadly unchanged, so measured progress is ahead of a clear visible size change without an obvious visual tradeoff.

### 5. Coach’s Insight

Stay with the current approach and use the next DEXA to confirm that lean mass keeps moving in the intended direction inside the accepted guardrail.

Next: `DEXA on Friday, Oct 9 at 7:00 AM`

## Replay authority and execution

| Item | Verified value |
|---|---|
| Production app | `bf57cf56-48cc-4cd6-90e4-a23ee5381741` |
| Active deployment | `1fa2121a-5729-49c3-9865-a79f1724bb3f` |
| Active web/worker source SHA | `4a81f5b4cac981f9241e40b556341246b83c3309` |
| Candidate SHA | `9a89ff903fd587839c53e5f896d5ae9c08d1aaa0` |
| Runtime SHA verified | `true` |
| Canonical event | `event_briefing_progress_photo_photo_session_user_founder_001_2026-09-19` |
| Canonical session | `photo_session_user_founder_001_2026-09-19` |
| Event date | `2026-09-19` |
| Historical generated-at / replay cutoff | `2026-09-20T17:51:47.391Z` |
| Cutoff semantics | `observation_time_and_canonical_availability_time; unknown_availability_fails_closed` |
| Replay executed | `2026-09-30T14:16:48.791Z` |
| Replay mode | `private_preview_ignore_existing` |
| Database | `REPEATABLE READ READ ONLY`; `transaction_read_only=on` |
| Artifact created | `false` |
| Publication invoked | `false` |
| Historical artifact mutated | `false` |

The replay used the current production data readers and the candidate services in a code-only bundle. Remote bundle SHA-256 was independently matched to the local bundle: `67daf77ed6b02efeb226673ba3d0dfb9d833e5d3d4cb0079c043f8ce39cc56f1` (543,009 bytes).

## Canonical source-media resolution

The current Sep 19 event resolved ten canonical objects: five DNG originals and five JPEG display/analysis derivatives. All ten matched canonical byte length, content type, provider version, ETag, and SHA-256 metadata; every object HEAD check passed. Canonical serialization of those ten verified records has SHA-256 `09717442d5e7138325b46ceed2a95c2531a1c7ced39cbf6ec26b49d194b41148`.

The five matched JPEG pairs actually submitted to perception were independently downloaded inside the production console and SHA-256 verified before provider submission:

| Pose | Aug 22 comparison JPEG | Aug 22 SHA-256 | Sep 19 current JPEG | Sep 19 SHA-256 |
|---|---|---|---|---|
| Front relaxed | `01a054d6-a9c5-700e-8ae9-cb449a0fab36` | `1f0c12f8e78c4dfd1fdbde9da9e5ee81d7e6c1342217bb9543b5fdcb60ed4c2a` | `01a0bf14-a31b-72f8-95e8-b9fb829018b6` | `b5dbc454412668656d012e0d379569b1e427de0d22079badaa3ef31553c2d87e` |
| Rear relaxed | `01a054d6-a884-744d-ac0c-307fb604ea52` | `12438ffb37f07cde9c789354d468604a64ef0e2f423382bf1b18405526b15d5a` | `01a0bf14-9d04-75eb-8287-517e90003a79` | `35c8f1ab3727bcb96e65df1d3aac4853c769cc2dfe15f7391c1248ec9c7394c8` |
| Rear flexed — double biceps | `01a054d6-a827-766f-9546-dc4874c6f357` | `4633c286f2c294350373d94eaa3bb96dc0643f0c1162a8e0ec65eeb45644348c` | `01a0bf14-9f0e-722a-b374-b97e883af143` | `58b31fedffb4dc8566e01b7e32ace7685d0066421d86a080334bcd8533a46dc7` |
| Right side relaxed | `01a054d6-a92d-7160-a2a4-dc63a64ac249` | `e1eb4d6aec0402b5978597bd8c6679f8153e2ba33a491babb87c851943b73c0e` | `01a0bf14-a130-765d-9727-bb61af16011a` | `ff486c647f460c5b105cb949d07fdea69fde1937cb9ed92b9b4849fcb01adf00` |
| Front flexed | `01a054d6-a941-77ce-b8c9-b8d063017a3d` | `c37b4088724105f2c6e01f6106a03713b7e6451f020798d5d78ccfdd236ed600` | `01a0bf14-9afe-713a-a000-bb9f706cdf22` | `5b31bd423dc1ad5f3d35bf60bbeff25592c240bf35562bf7af0ce973c752098c` |

The five Sep 19 DNG originals were also verified as the canonical source originals, but were not sent to the provider:

| Object | SHA-256 |
|---|---|
| `01a0bf13-e06e-7224-8838-cdc27f8e6e0b` | `dacd482acdd68d73d1c8fb5b20b5d2948ece1f6c959ca686a56897126577d73d` |
| `01a0bf14-08e2-74cf-9da5-c13e9f8d3637` | `458f0410443038055c387195b1a88e7d29995db60e09c9990ed11d5e9fecacac` |
| `01a0bf14-3307-7687-8f94-a8edeac82960` | `a7feaf1a4c5b590b72efd33224541bec65b6b6260564cabd9773fe2ffb9eb280` |
| `01a0bf14-5e00-77f9-b145-bfebc444e323` | `3478395603027e572f2ac5071b379524286d4029687f017df19c679df5a3ee3d` |
| `01a0bf14-87f4-758a-ba09-139ca0ad3094` | `e6bb8002a728d25387c8976dd8ada8ec436157cb2884203a7224d6b261101e7e` |

No photo bytes or private object-store paths are present in this report or repository changes.

## Goal-blind perception result and boundary

All five pairs used:

- model: `gpt-4.1-mini`;
- producer: `canonical_photo_perception_service` / `canonical_photo_perception_v1`;
- prompt policy: `canonical_photo_perception_goal_blind_v2`;
- provider-input attestation: `canonical_photo_provider_input_typed_v1`;
- context boundary: `goal_phase_strategy_and_non_photo_evidence_excluded_from_model_input`;
- `goalContextUsed: false`;
- `nonPhotoEvidenceUsed: false`;
- `legacyGoalAwareSourceAccepted: false`;
- `photoOnlyContextBoundary: true`.

| Pose | Overall comparability | Observation count | Directions | Magnitudes | Reliability |
|---|---:|---:|---|---|---|
| Front relaxed | good | 5 | stable only | none only | moderate |
| Rear relaxed | good | 3 | stable only | none only | moderate |
| Rear flexed — double biceps | good | 3 | stable only | none only | moderate |
| Right side relaxed | good | 4 | stable only | none only | moderate |
| Front flexed | good | 3 | stable only | none only | moderate |

The set reconciled all five exact matches with overall comparability `high`, overall magnitude `none`, overall reliability `moderate`, Goal-relative photo direction `uncertain`, and strength `limited_visual_support`. Lighting, clothing, and current post-workout pump were retained as observation-specific confounders. Stable photos were not converted into visible muscle growth or a strategy conclusion.

The temporary provider response objects were deleted after retrieval:

| Pose | Temporary response | Deleted |
|---|---|---|
| Front relaxed | `resp_0a22128da3c1132b006abd1832672087d0832ce864cef05fe7` | yes |
| Rear relaxed | `resp_040c8d49018be83e006abd1855196487d0a47fe79e8a42722a` | yes |
| Rear flexed — double biceps | `resp_0fcd883635a38e31006abd187bc94c87d09c2d3abbba6dfaa8` | yes |
| Right side relaxed | `resp_04dfbd23bab11717006abd189f4bb087d0bbe685e1a3c8998b` | yes |
| Front flexed | `resp_0fb66efb329abafc006abd18ca1ce487d0ac95be5037b83810` | yes |

## Cutoff-eligible evidence verification

The replay independently applied `canonical_evidence_cutoff_v1` at `2026-09-20T17:51:47.391Z`, checking both observation time and canonical availability time and failing closed when availability was unknown.

- Eligible: **129** records — 17 DEXA scans and 112 weights. Ordered selection SHA-256: `11a4010a8ae342962fafb837a50dcc3fe1808048780135a20012b5916ffedbbd`.
- Excluded: **50** records — 42 updated after cutoff, one observed after event, and seven available after cutoff. Ordered exclusion SHA-256: `7c3af1a3d353f6b72a2ed51b77893d96c44a062bd258ff2edb71e9b5ddae7717`.
- Used by synthesis: exactly **two** authoritative DEXA records. Ordered used-evidence SHA-256: `6fd23cd7719462db8b6682be04b148c9aa31ff15176fdb4826dc2e24c0df2328`.

| DEXA evidence | Measured | Lean mass | Body fat |
|---|---|---:|---:|
| `dexa_submission_20260815181333895_review_pdf_1_2026_08_15` | 2026-08-15 | 148.3 lb | 7.6% |
| `evidence_submission_44462ABB3969473DA82FBF2B46A504EF_pdf_1_2026_09_12` | 2026-09-12 | 153.3 lb | 8.1% |

The synthesized measurement is therefore `+5.0 lb` lean mass and `+0.5` percentage points body fat. Provenance states: `DEXA measured these values; photos did not.` The convergence status is `independent_context`, with no visual-confidence change and `causalClaim: false`.

## Goal hierarchy and compatibility review

The real replay confirms the previously missing downstream Goal projection is present:

- primary objective: Build Lean Mass, `lean_mass`, increase by 10 lb, target date 2026-10-31;
- accepted body-fat guardrail: maintain approximately 8–9%;
- additional accepted guardrails: gradual weight gain, recovery quality, and no sustained strength regression;
- photos: supporting evidence only;
- weight: supporting evidence only;
- training/nutrition/activity: execution evidence only and not permitted to establish lean-mass gain or causality.

The result is Goal-relative rather than same-direction arithmetic: measured lean mass progressed, the measured body-fat guardrail is within range, and stable photos neither conflict with that measurement nor claim visible muscle gain. This is the intended `jointly_supportive` interpretation. Unmeasured guardrails are preserved rather than fabricated as measured.

## Fresh independent review

A fresh post-replay review passed the acceptance criteria:

1. **Frozen perception:** no perception code/test drift from `0d0f189e`; provider attestation and replay provenance independently confirm Goal/non-photo exclusion.
2. **No fabricated visual gain:** all 18 raw observations are stable/none; the copy says the photos are broadly unchanged.
3. **Primary objective:** the Hero leads with the measured lean-mass objective, and the exact DEXA delta appears once in Interpretation.
4. **Guardrail:** the accepted 8–9% range survives projection and is evaluated against authoritative 8.1% DEXA.
5. **Evidence roles:** DEXA establishes measured lean mass/body fat; photos are supporting evidence; no weight/training/nutrition/activity causal claim appears.
6. **Realization:** one short caption per pose, one concise holistic paragraph, one forward-looking Coach's Insight, and no raw findings/support duplication.
7. **Pose correctness:** rear captions contain no abdominal claim; captions remain scoped to their view.
8. **Cutoff:** the eligibility/exclusion selection was recomputed in the read-only replay, and only the two required authoritative DEXA records were used.
9. **Zero write:** transaction read-only was on; artifact creation, publication, historical mutation, deployment, and Native work were all absent.

## Implementation and validation provenance

Implemented in `9a89ff90`:

- `PhotoEventContextService`: canonical Goal/phase target, guardrail, purpose, progress-measurement, and success-criteria projection;
- `PhotoBriefingHolisticSynthesisService`: `photo_briefing_holistic_v2`, explicit primary-objective/guardrail/supporting/execution hierarchy, Goal-relative compatibility, and concise objective → guardrail → photo synthesis;
- `PhotoEventNarrativeService`: measured-objective Hero, one natural caption per matched pose, empty raw observation stacks, concise Interpretation, and separate Coach's Insight.

Validation on the exact candidate:

- relevant available suite: 78/78 passed across seven files;
- focused downstream suite: 43/43 passed across three files;
- targeted ESLint: passed;
- `git diff --check`: passed;
- production `next build`: passed outside the sandbox with only the repository's existing NFT tracing warnings;
- frozen perception implementation diff from `0d0f189e`: empty;
- frozen adversarial perception test diff from `0d0f189e`: empty;
- frozen Case 1/2 artifacts: unchanged;
- Native: untouched.

One separately selected `CanonicalPhotoSessionReadService.test.js` run had 17 passing tests and one unavailable case because this checkout lacks the private `private/founder/runtime-store.json` fixture. That was a missing private fixture, not an assertion failure; it was not reconstructed.

## Safety and stop state

- Production changed by this task: **no**.
- Historical Sep 19 artifact regenerated or mutated: **no**.
- Candidate deployed: **no**.
- Native touched: **no**.
- Private photo bytes or object-store paths committed: **no**.
- Temporary provider responses retained: **no**.
- Further tuning against this replay: **none**.

The requested work is complete. Stop here for ChatGPT review.

Task id: photo-intelligence-visual-change-magnitude-blind-founder-validation-20260929

Codex owns this workstream in an isolated branch/worktree.

GOAL

Design, implement and validate a canonical PhysiqueOS Photo Intelligence layer capable of interpreting progress-photo change with approximately the judgment quality of a strong human physique coach, while remaining appropriately restrained about what photographs can and cannot establish.

This is a core product-intelligence test, not a copywriting exercise.

The system must answer:
- What visually changed?
- Where did it change?
- How large is the apparent change?
- How reliable/comparable is this photo pair?
- What direction does the visual evidence point relative to the active Goal?
- What can the photos support confidently?
- What might they suggest?
- What can they not establish?

Photo Intelligence must remain distinct from holistic Briefing Intelligence.

ARCHITECTURAL SEPARATION

Preserve these layers:

1. Source photo observations and metadata.
2. Photo comparability / quality assessment.
3. Canonical structured visual-change observations.
4. Magnitude + direction + reliability assessment.
5. Photo-level interpretation relative to the Goal.
6. Shared Briefing Intelligence synthesis with independent evidence such as DEXA, weight, training, nutrition, activity and later sleep.
7. User-facing Photo Briefing / other briefing copy.

Photo Intelligence must not use non-photo evidence to make its visual observations more confident.

A later synthesis layer may appropriately strengthen the holistic conclusion when independent evidence converges.

Example principle:
Photos may support "subtle-to-moderate upper-body fullness with a broadly stable waist."
DEXA may independently show measured lean-mass gain.
The holistic briefing may say the photos visually support the direction established by body-composition evidence.
PI itself must not claim it measured muscle gain.

BLIND FOUNDER ACCEPTANCE PROTOCOL

The Founder will provide real progress-photo pairs directly to Codex.

For each Founder case:

A. Codex receives only:
- the source photos;
- dates/order;
- active Goal and phase context that PhysiqueOS would legitimately know at runtime;
- any ordinary source metadata PhysiqueOS would legitimately possess.

B. BEFORE viewing any ChatGPT/human reference assessment, Codex must run the exact photos through the sample/private PI environment and freeze to GH:
- structured source/comparability assessment;
- structured visual observations by meaningful region;
- overall visual-change magnitude;
- direction relative to Goal;
- reliability/confidence;
- uncertainty/confounders;
- explicit unsupported conclusions;
- PI-level interpretation;
- exact sample user-facing Photo Briefing copy;
- machine-readable/raw structured result sufficient to diagnose disagreements.

C. Only after the PI result is committed/frozen may the human reference assessment be revealed and compared.

D. Codex must not tune Case N after seeing its human reference and then present the tuned Case N as the original result.
If changes are needed, implement them and validate prospectively on a later unseen case or clearly label a second-pass replay.

This is essential. We are testing independent interpretation, not prompt-fitting to ChatGPT's answer.

INITIAL FOUNDER CASES

Case 1:
2026-05-21 baseline -> 2026-07-18 comparison.
Goal context: Visible Abs.
This is intended as an easier high-signal case.
Founder will send the exact two images directly to Codex.

Case 2:
2026-07-19 baseline -> 2026-09-19 comparison.
Goal context: Build Lean Mass with body-fat guardrail.
This is intentionally harder/subtler.
Do not request or inspect the human assessment before freezing PI's Case 2 output.

More cases will follow.

Do not put ChatGPT's existing conclusions for either case into PI prompts, fixtures, labels or expected outputs before the blind run.

WHAT THE CANONICAL PI RESULT SHOULD REPRESENT

Design a durable structured contract rather than storing only prose.

At minimum consider fields/concepts for:
- comparison identity and dates;
- source image IDs/provenance;
- pose/view classification;
- body regions actually visible;
- comparability dimensions:
  - pose;
  - framing/distance;
  - camera angle;
  - lighting;
  - clothing/occlusion;
  - body orientation;
  - flexing/posture;
  - overall comparability;
- regional observations;
- observation direction;
- apparent magnitude;
- observation confidence/reliability;
- dominant visual signals;
- overall magnitude;
- Goal-relative direction;
- uncertainty/confounders;
- unsupported/inadmissible conclusions;
- model/version/prompt/policy provenance;
- evidence timestamps;
- raw/structured model output needed for reproducibility.

Use an ordinal magnitude vocabulary that is understandable and calibratable. Do not invent false numeric precision merely because numbers are easy to store.

The structured result must make it possible to determine later whether a disagreement came from:
- vision/perception;
- comparability gating;
- magnitude calibration;
- evidence ranking;
- Goal interpretation;
- narrative synthesis.

PHOTO REASONING POLICY

The engine should be capable of noticing meaningful changes in areas such as:
- waist/midsection appearance;
- abdominal/oblique definition;
- chest fullness/definition;
- shoulder fullness/definition;
- arm fullness/definition;
- back width/thickness when visible;
- leg size/definition when visible;
- overall silhouette/proportions;
- V-taper;
- apparent leanness/softness;
- regional symmetry where genuinely supported.

Do not force every region into every comparison.
Absence of a reliable view is not "no change."

Magnitude must matter.
A major transformation must not be summarized as merely "some increased definition."
A subtle comparison must not be inflated into a major biological conclusion.

COMPARABILITY POLICY

Do not require studio-identical photos before recognizing obvious change.

Comparability should modulate confidence at the level it actually affects.

Example:
A very large waist/midsection change may remain high-confidence despite lighting differences.
A subtle difference in shoulder roundness may deserve lower confidence when arm position, camera distance or lighting differs.

Avoid one global comparability score suppressing every regional observation equally if the evidence supports more nuanced treatment.

The system should distinguish:
- obvious change despite imperfect capture;
- subtle change under good capture;
- subtle change under imperfect capture;
- genuinely incomparable evidence.

GOAL CONTEXT

Interpret observations relative to the active Goal without fabricating physiology.

For a fat-loss/Visible Abs goal:
- waist/midsection/definition may be especially relevant;
- preservation of upper-body size may provide useful context;
- do not infer exact fat loss or body-fat percentage.

For Build Lean Mass with a body-fat guardrail:
- increased apparent muscular fullness may be relevant;
- waist/leanness stability is directionally important;
- do not interpret slightly softer lighting as fat gain;
- do not claim muscle gain from photos alone.

Goal context affects relevance/ranking and narrative, not the underlying visual observation itself.

RESTRAINT / FORBIDDEN OVERCLAIMS

Photo Intelligence must not claim from photographs alone:
- exact body-fat percentage or percentage-point change;
- pounds of fat lost;
- pounds of lean mass/muscle gained or lost;
- DEXA-equivalent body composition;
- causation;
- physiological mechanism;
- a specific nutrition/training intervention caused the appearance;
- certainty about muscle gain where fullness/pump/pose/lighting could contribute.

Use language such as:
- appears;
- visually;
- supports;
- suggests;
- broadly stable;
- no clear visual evidence;
when uncertainty warrants it.

Do not bury obvious high-signal changes under excessive hedging.

COPY QUALITY

The user-facing Photo Briefing should sound like a capable coach, not an AI vision report.

It should:
- lead with the most important visual story;
- identify what changed and where;
- communicate magnitude naturally;
- relate it to the Goal;
- acknowledge material capture limitations without turning the briefing into disclaimers;
- distinguish visual evidence from measured body composition;
- remain concise enough to read.

Do not use AI-ish terms such as "read", "signal" or "the model detects" in user-facing copy merely because they exist internally.

SHARED BRIEFING INTELLIGENCE INTEGRATION

Photo Intelligence must be eligible to feed the shared Briefing Intelligence layer prospectively.

But preserve evidence authority:
- PI provides canonical photo evidence.
- Shared Briefing Intelligence decides how it combines with DEXA, weight, training, nutrition, activity and later sleep.
- Independent convergence may strengthen holistic coaching conclusions.
- Photo observations must remain inspectable as their own source.

Do not let DEXA/training/weight leak backward into PI's visual assessment.

PHOTO BRIEFING

Audit the current Photo Briefing producer and existing accepted presentation.

Determine the smallest clean integration that replaces/augments shallow "photos exist" interpretation with canonical visual intelligence.

Do not redesign Native Photo UI in this task.
Do not fix the already-backlogged Native photo-loading/enlarge/persistence issues unless required to consume the new canonical contract.

MODEL / PI ENVIRONMENT

Use the same provider/model class and production-compatible path intended for PhysiqueOS where possible.

The private/sample environment must:
- use the real source images;
- be zero-write to Founder canonical production data;
- preserve model/prompt/policy provenance;
- produce deterministic surrounding logic even if model inference itself has variance;
- support replay for debugging;
- never commit private Founder images or image bytes to GitHub;
- never commit local private export paths.

If an offline/private replay harness is needed, keep data and absolute paths untracked. A data-free reusable harness may be committed.

VALIDATION CASES

Beyond Founder blind cases, create deterministic policy/fixture coverage for:
- obvious major change;
- subtle change;
- essentially no change;
- imperfect lighting;
- imperfect pose;
- different framing/distance;
- mixed regional change;
- insufficient/incomparable images;
- region not visible;
- apparent definition change likely confounded by lighting;
- stronger upper-body fullness with stable waist;
- visible waist increase with otherwise fuller physique;
- contradictory regional evidence;
- duplicate/same image;
- reversed chronology;
- missing pose counterpart.

Synthetic/fixture tests should validate policy and structured logic; they are not substitutes for real-image Founder acceptance.

HUMAN-vs-PI EVALUATION

After each blind PI output is frozen and the human reference is revealed, produce a comparison report covering:
- material observations matched;
- material observations missed;
- false positives;
- magnitude agreement;
- direction agreement;
- regional ranking agreement;
- comparability/reliability agreement;
- restraint/overclaim quality;
- Goal relevance;
- copy usefulness;
- root layer of each disagreement.

Do not score the system with a simplistic single percentage.
Use a qualitative acceptance matrix plus concrete mismatches.

A release-worthy PI system should not require exact prose matching. It should independently land in the same material evidence neighborhood as the human reference.

RELEASE GATE

Do not graduate Photo Intelligence based on one easy case.

At minimum require:
- strong performance on an obvious-change Founder case;
- strong/restrained performance on a subtle Founder case;
- no major overclaim;
- correct comparability handling;
- correct Goal-relative interpretation;
- inspectable structured provenance;
- deterministic policy tests;
- fresh-context review.

Do not deploy.
Do not mutate Founder production data.
Do not upload TestFlight.

PARALLEL WORK / OWNERSHIP

Claude/Fable owns peptide UX, Pause/Resume, Weight weekly-average parity, Foam Rolling Skip and Logged Today provenance. Do not touch those workstreams.

Persistent-pairing implementation is frozen at its reviewed Codex SHAs unless separately instructed. Do not mix auth changes into Photo Intelligence.

HealthKit Sleep and HealthKit delivery-device identity decoupling remain separate future lanes.

TESTING EFFICIENCY

Follow risk-scaled validation.

This is primarily Server/intelligence work:
- prefer deterministic unit/contract/policy tests;
- use private zero-write PI replays for real-image acceptance;
- do not perform lengthy Native simulator tours;
- if Native contract compatibility needs checking, use focused deterministic decoding/render tests first;
- simulator testing is allowed only when it answers a specific question automated tests cannot establish.

REPORTING

Publish to GH:
1. architecture/authority map;
2. PI structured contract + policies;
3. each blind Founder PI result BEFORE human reference reveal;
4. each post-reveal human-vs-PI comparison;
5. implementation branches/SHAs;
6. tests;
7. fresh-context review;
8. deployment/integration recommendation.

For blind Founder results, filename must clearly identify:
- case number;
- dates;
- BLIND;
- pre-human-reference.

Never include private photo bytes in GH.

STANDING NOTIFICATION RULE

Push-notify Founder when:
- architecture is ready;
- each blind case is frozen and ready for human-reference reveal;
- implementation candidate is ready;
- you stop or need input.

END TASK.

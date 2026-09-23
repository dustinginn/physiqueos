Task id: codex-strength-reconciliation-semantics-20260923

Design and implement the production Strength HealthKit reconciliation semantics after Build 55: deterministic auto-confirm for genuinely unambiguous matches, explicit user resolution for ambiguous matches, and durable reconciliation history that can improve future matching without weakening hard safety invariants.

Use the SAME Codex chat. Reasoning: High.

Read first:
agent-handoffs/reports/20260923T201339Z-healthkit-strength-build55-testflight-valid.md
agent-handoffs/reports/20260923T194742Z-strength-reassessment-applied.md
agent-handoffs/reports/20260923T193601Z-strength-deployed-dryrun-green.md
agent-handoffs/reports/20260923T160419Z-healthkit-strength-prospective-graduation-yellow.md

Reverify authority. Expected:
Production Server 31c88481d80703de3355c51f6695b760b0671020
deployment 42035d0d-9368-4ada-a4c1-392e659f3366
Native Build 55 621dbef3cdcf17009e346111e4a86d14b70ed896, Apple VALID and installed by Founder.
Strength policy effective Sep 23, open-ended, Strength-only, no backfill, quarantined, linkAutoConfirm currently false.
Sep 23 existing relationship is a quarantined unconfirmed candidate: confident_match 95, logger_session_window, correct Logger session.
Workout strategic eligibility remains OFF.
Founder has no current user-facing confirmation UI and should not hunt for one.

Founder product decision:
The normal experience should require no confirmation when the relationship is deterministically clear.
When a relationship is genuinely ambiguous, PhysiqueOS should ask the Founder to choose/confirm the correct Logger session.
Those explicit confirmations should become durable structured reconciliation history so future matching becomes more accurate and requires fewer confirmations over time.
Learning must improve evidence/features/priors, NOT merely lower a confidence threshold.
Learning may never override hard invariants such as:
- one HealthKit workout to at most one Logger session;
- one Logger session to at most one HealthKit workout;
- compatible workout family/type;
- temporal plausibility;
- no competing plausible sessions;
- no overwrite/mutation of Logger exercises/sets/reps/load/variants/supersets/notes;
- no duplicate detailed Training session;
- no strategic/V3 eligibility from the confirmation decision itself.

Desired steady state:
Obvious deterministic match -> automatically confirmed, no user interruption.
Ambiguous match -> a concise Evidence Review reconciliation item asks which workout the Apple Health session belongs to (or lets Founder reject/no-match if appropriate).
Founder resolution -> confirms/rejects relationship and records structured reconciliation history.
Future matcher may use that history as a feature/prior, with explainable provenance and hard guardrails.
No plausible match -> remain unlinked; do not guess.

Important distinction:
Do not build an opaque ML system or arbitrary self-adjusting threshold in this slice. Start with deterministic, inspectable learning/history semantics. Store enough structured resolution history so a future learned matcher can use it safely.
A user confirmation is identity/reconciliation evidence, not strategic coaching evidence.

Use the existing Sep 23 confidence-95 candidate as the primary real production fixture. Do not manually consume/confirm it before the new semantics are ready. If the reviewed deterministic auto-confirm gate concludes this exact existing candidate qualifies, use it as the bounded production acceptance case after separate Founder authorization.

Part A — audit/design
Read-only audit current candidate/link/claim/review architecture and Evidence Review UI.
Define deterministic auto-confirm eligibility. It should require stronger conditions than confidence score alone, including unique candidate and no competing plausible session.
Define ambiguous-resolution states and user actions.
Define structured reconciliation-history schema/record using existing canonical patterns if possible.
Define how history can influence future matching while remaining bounded and explainable.
Define replay/idempotency/concurrency and release/relink semantics.
Define how a previously confirmed relationship teaches later matching without making unrelated sessions auto-link.

Part B — implementation
Implement smallest Server/Native slice needed for:
- deterministic auto-confirm gate;
- explicit ambiguous-resolution item in Evidence Review when needed;
- resolution actions through registered guarded canonical commands/ports;
- durable reconciliation-history recording;
- matcher consumption of only safe structured history signals if justified now; otherwise store history and leave consumption as a clearly defined next slice.
Do not create a broad new subsystem if existing review/link/audit structures can represent this cleanly.

Sep 23 acceptance:
The existing confidence-95 candidate should be evaluated under the new deterministic gate.
Do not assume 95 automatically means auto-confirm.
Prove why it does or does not qualify.
If it qualifies, prepare a bounded guarded production apply that auto-confirms it exactly once, with one-to-one claims and invariants.
If it does not qualify, expose it through the new ambiguous-resolution UX rather than manually confirming behind the scenes.
Any production mutation requires Founder authorization after dry-run/review.

Build 55 reliability:
Founder has installed Build 55. Do not require a new workout solely for this task.
Do not regress the Build 55 timeout/coalescing/observer-completion/finishedAt fixes.
If the reconciliation UX requires a new Native build, increment sequentially after 55 and keep scope limited.

Strategic boundary:
Workout strategic eligibility remains OFF throughout this task.
Do not enable V3/Confidence/briefing use.
Do not start Cardio until Strength final verdict is published.

Testing:
- deterministic unique match auto-confirms;
- high score with competing plausible session does not auto-confirm;
- incompatible family never auto-confirms;
- temporal hard guard failure never auto-confirms;
- replay idempotent;
- concurrent confirmation one-to-one safe;
- release/relink semantics safe;
- ambiguous item appears exactly once;
- reject/no-match path;
- confirmation history recorded exactly once and does not become strategic evidence;
- history cannot override hard guards;
- Sep 23 production-shaped fixture;
- existing Logger detail byte-identical;
- no duplicate Training session.
Mutation-test critical guards.
Run full relevant Server/Native suites.
Fresh-context independent adversarial review exact final candidates.

Standing agent workflow rules:
Publish a durable GitHub progress/checkpoint update after EVERY substantive chunk of work, not only final completion. Each checkpoint should include current authority, what changed, tests/review status, unresolved findings, authorization/decision needed, and exact next step. This applies to Codex and must be preserved in future Claude handoffs too.
GitHub handoffs are durable authority.
Ask Founder explicitly before deploy, TestFlight upload, policy mutation, or production relationship mutation.
Do not publish a blocked handoff merely to ask permission if chat can continue; ask in chat, wait, continue, while still publishing progress checkpoints for substantive completed chunks.
For Server deploys stamp PHYSIQUEOS_GIT_SHA/BUILD_ID via apps update --spec plus force-rebuild and verify runtime labels. Quote refspecs.
Do not edit claimed prompts in place.
Read-only audit first where uncertain; focused tests; mutation-test critical guards; full relevant suite; fresh-context review.

Standing Native simulator/disk rule:
Founder uses iPhone 17 Pro. Retain only the iPhone 17 Pro simulator device needed for PhysiqueOS Native work. Do not create/download/retain other simulator devices for convenience. If tooling creates another simulator, shut it down and remove it when no longer required. Do not delete the iOS runtime needed by the retained iPhone 17 Pro simulator. Before archive/build operations check free disk space and clean unnecessary simulator devices/build artifacts in a targeted manner. Do not blindly delete unrelated archives, DerivedData, runtimes, or user data without explicit authorization.
As part of this task, identify the repository's actual durable agent-instruction mechanism (if one exists) and add this simulator/disk rule there so it is not prompt-only. If no appropriate mechanism exists, report that and do not invent one.

Other queued post-HealthKit work to preserve:
- Cardio next after Strength final verdict.
- Midweek Briefing correctness immediately after HealthKit: missing Energy/Weight/broad Training/body-comp synthesis, PR dominates, backend-shaped duplication, verbosity/redundancy, possible lateral-raise vs leg-extension contradiction, poor Still Unresolved. Audit canonical evidence -> V3 -> structured payload -> narrative -> Native rendering, not cosmetic patch.
- Active Workout Logger navigation: while active, tapping Log tab returns directly to active Logger exact state; no active workout -> normal Log.
- core-page cold-load performance;
- Training PR/performance-record reliability;
- Photo PI go/no-go;
- true Workout sourceRevision and remaining HealthKit reliability backlog.

Authorization workflow:
Do code/design/test/review work without asking.
Before any privileged mutation, ask Founder in chat with exact SHA/build/scope.
If authorization is granted, continue; do not terminate solely because permission was needed.

Final output:
Publish final handoff with Strength verdict and exact remaining path to Cardio.

Flags:
AUTHORITY_REVERIFIED
SEP23_CANDIDATE_PRESENT
DETERMINISTIC_AUTOCONFIRM_RULE_DEFINED
AUTOCONFIRM_HARD_GUARDS_DEFINED
AMBIGUOUS_RECONCILIATION_UX_IMPLEMENTED
REJECT_NO_MATCH_SUPPORTED
RECONCILIATION_HISTORY_DURABLE
HISTORY_STRATEGICALLY_INERT
HISTORY_CANNOT_OVERRIDE_HARD_GUARDS
SEP23_AUTOCONFIRM_ELIGIBLE
SEP23_LINK_CONFIRMED
ONE_TO_ONE_INTEGRITY_PASS
LOGGER_DETAIL_UNCHANGED
DUPLICATE_TRAINING_SESSION_PRESENT
WORKOUT_STRATEGIC_ELIGIBILITY_ENABLED
NATIVE_BUILD_REQUIRED
NATIVE_BUILD_NUMBER
SERVER_FIX_REQUIRED
SERVER_DEPLOYED
TESTFLIGHT_UPLOADED
STRENGTH_FINAL_VERDICT
READY_FOR_CARDIO
SIMULATOR_RULE_PERSISTED

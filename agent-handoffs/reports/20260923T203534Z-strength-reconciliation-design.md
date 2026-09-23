# Strength reconciliation semantics — read-only audit and design checkpoint

Task: `codex-strength-reconciliation-semantics-design-20260923`  
Parent task: `codex-strength-reconciliation-semantics-20260923`  
Agent: Codex  
Generated: 2026-09-23T20:35:34Z

## Outcome

The audit/design slice is complete and remained read-only. Production Server authority is still `31c88481d80703de3355c51f6695b760b0671020` on active deployment `42035d0d-9368-4ada-a4c1-392e659f3366`; web and worker report the same stamped runtime SHA/build. Native Build 55 source authority is `621dbef3cdcf17009e346111e4a86d14b70ed896`, and Apple independently reports both build and import `VALID`.

The bounded rollback-only production audit reconfirmed the active Strength-only Sep 23 policy, `linkAutoConfirm=false`, strategic quarantine, one canonical Sep 23 Strength workout, and one unconfirmed candidate to the correct Logger session at confidence 95 with `logger_session_window` basis. There is no confirmed Sep 23 link, no one-to-one violation, no HealthKit-derived strategic evidence, and no production mutation from this audit.

## Current architecture findings

- Strength matching is deterministic and inspectable, but it currently creates or refreshes only quarantined candidates. The activation parser deliberately refuses auto-confirm.
- The existing relationship service already supplies atomic workout/session claims, compare-and-swap behavior, idempotent confirmation, unlink/release, relink, and stored one-to-one integrity checks.
- The existing production confirmation operation has a bounded window, fresh drift facts, explicit authorization audit, advisory-lock integration, exact predicted mutations, rollback dry run, and post-write invariants.
- Existing Evidence Review reads and Native screens assume evidence-intake review payloads and commands. Reconciliation needs a typed branch rather than pretending a relationship choice is strategic evidence intake.
- Canonical logical collections can use the existing `canonical_training_records` storage seam, so this does not require a new database subsystem or migration.

## Deterministic auto-confirm rule

Auto-confirm will be an explicit predicate over current canonical facts, never `confidence >= N` by itself. It must require all of the following at the instant of confirmation:

1. The canonical workout is active Strength and the Logger target is an active, detailed Strength session.
2. The assessment is a single confident candidate with an allowlisted deterministic basis.
3. The temporal rule is satisfied by concrete start/end overlap or explicit source identity; missing or implausible timing fails closed.
4. There is no second plausible active Logger session for that workout and no competing plausible canonical workout for that Logger session.
5. There is no existing confirmed relationship or held claim for either side, no duplicate canonical-workout group, and stored relationship state is clean.
6. Confirmation remains strategically quarantined and never writes Logger exercises, sets, reps, load, variants, supersets, notes, or a second detailed Training session.
7. Global automatic behavior requires a separately authorized activation-policy change. The present production policy remains off.

The Sep 23 candidate will be evaluated against this predicate using a production-shaped fixture. Confidence 95 is supporting output, not the acceptance reason.

## Ambiguity and durable history

A deterministic reconciliation record in the existing canonical training store will represent both a pending Evidence Review item and its durable resolution history. Its identity is derived from the canonical workout, so replay creates one item rather than duplicate prompts. It stores only structured relationship facts: workout/family/date, candidate link/session identities, matcher version, bounded feature/basis facts, status, version, and an attributable resolution (`confirmed` or `no_match`). It is explicitly marked strategically inert.

Pending records will be projected into the existing Evidence Review queue with a typed reconciliation presentation. The Native detail will offer the listed Logger candidate(s) and an explicit no-match/reject action. A registered canonical command will require expected version and fresh facts, re-run every hard guard, then either confirm the selected link through the existing atomic relationship service or record no-match. Replay is idempotent; stale or concurrent resolutions fail closed.

Unlink releases the existing claims but preserves immutable resolution provenance. Relink must re-run current hard guards and creates a distinct attributable transition rather than rewriting history. A previous confirmation can teach only through a future allowlisted feature keyed to a specific, inspectable identity or stable mapping; it may not create a generic threshold discount. Because one production confirmation is insufficient to justify a broadly reusable prior, this slice will store the history schema and leave matcher consumption disabled unless tests prove a narrowly scoped identity signal is safe.

## Native and simulator scope

The ambiguity/no-match product decision requires a small Native presentation/action branch, so a sequential Build 56 candidate is expected. Build 55 automatic-sync, coalescing, observer-completion, Logger `finishedAt`, and Strength matching fixes remain required regression coverage. No upload is authorized.

The repository already has a durable Codex instruction file at `docs/CODEX.md`. The implementation slice will add the Founder’s iPhone 17 Pro-only simulator and targeted disk-cleanup rule there; it will not create or retain other simulator devices or remove the required iOS runtime.

## Gates and boundaries

- No implementation commit exists yet; isolated branches will be created from the exact reviewed Server and Native authorities.
- No Server deploy, TestFlight upload, policy mutation, link confirmation, or other production relationship mutation is authorized or attempted.
- Strategic Strength eligibility stays off.
- The Sep 23 candidate stays unconfirmed until code/tests/review and separate Founder authorization.
- Cardio remains blocked until the final Strength verdict.

## Next step

Implement the smallest Server and Native slices, add the required production-shaped and adversarial tests, mutation-test the critical guards, run full relevant suites, and obtain a fresh-context review of the exact candidates. After that, publish another durable checkpoint and ask explicitly before any deploy or upload.

## Flags

- AUTHORITY_REVERIFIED: YES
- SEP23_CANDIDATE_PRESENT: YES
- DETERMINISTIC_AUTOCONFIRM_RULE_DEFINED: YES
- AUTOCONFIRM_HARD_GUARDS_DEFINED: YES
- AMBIGUOUS_RECONCILIATION_UX_IMPLEMENTED: NO
- REJECT_NO_MATCH_SUPPORTED: DESIGN ONLY
- RECONCILIATION_HISTORY_DURABLE: DESIGN ONLY
- HISTORY_STRATEGICALLY_INERT: DESIGN YES; IMPLEMENTATION PENDING
- HISTORY_CANNOT_OVERRIDE_HARD_GUARDS: DESIGN YES; IMPLEMENTATION PENDING
- SEP23_AUTOCONFIRM_ELIGIBLE: NOT YET PROVEN
- SEP23_LINK_CONFIRMED: NO
- ONE_TO_ONE_INTEGRITY_PASS: YES
- LOGGER_DETAIL_UNCHANGED: YES
- DUPLICATE_TRAINING_SESSION_PRESENT: NO
- WORKOUT_STRATEGIC_ELIGIBILITY_ENABLED: NO
- NATIVE_BUILD_REQUIRED: YES (EXPECTED)
- NATIVE_BUILD_NUMBER: 56 (EXPECTED CANDIDATE)
- SERVER_FIX_REQUIRED: YES
- SERVER_DEPLOYED: NO
- TESTFLIGHT_UPLOADED: NO NEW BUILD
- STRENGTH_FINAL_VERDICT: PENDING
- READY_FOR_CARDIO: NO
- SIMULATOR_RULE_PERSISTED: NO (IMPLEMENTATION SLICE)

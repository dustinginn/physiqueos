# Strength reconciliation semantics — canonical integrity and exact readback

Task: `codex-strength-reconciliation-integrity-readback-20260923`  
Parent task: `codex-strength-reconciliation-semantics-20260923`  
Agent: Codex  
Generated: 2026-09-24T00:06:57Z

## Outcome

The fifth fresh-context review rejected Server `9f0e0544ed1dd788d13c815ee897d8045fd3cb12` and Native `7812937c95202f4b6765587df56dc61a7a748984` for five fail-closed replay/integrity gaps. The corrections are implemented and frozen into clean candidates: Server `a54a77f4f4ee69d0f08c9152fff6676d2c2a6b36`; Native Build 56 `7d2fd4d481918eaf9985cddb2a6ff9c2d70bac7e`.

No production deployment, policy mutation, relationship mutation, TestFlight upload, strategic-eligibility change, or Cardio work occurred. Production remains Server `31c88481d80703de3355c51f6695b760b0671020`, deployment `42035d0d-9368-4ada-a4c1-392e659f3366`, and Native Build 55 source `621dbef3cdcf17009e346111e4a86d14b70ed896`. The September 23 candidate remains quarantined and unconfirmed; `linkAutoConfirm` and workout strategic eligibility remain off.

## Corrections

One canonical relationship-integrity rule now requires each confirmed link to own exactly two deterministic held claims. Both claims must have the expected identity, kind, schema, holder, and terminal held-history entry. Extra, orphaned, malformed, missing, duplicated, or foreign-held active claims fail closed. Confirmation replay revalidates that graph, the canonical workout/duplicate group, and an active trusted live Workout Logger session before reporting `already_confirmed`.

Untrusted imported, screenshot, voice, or otherwise non-live-Logger evidence is excluded during candidate enumeration itself, including explicit source-identity records. It therefore cannot become a selectable candidate or reach Founder confirmation.

Founder `no_match` and every reconciliation replay validate the whole stored relationship graph. Terminal replay additionally requires the requested exact action, selected Logger session and link, exactly one matching resolution-history entry, and exactly one matching terminal lifecycle entry. Superseded, mismatched, malformed, or drifted state returns a typed conflict rather than success. The bounded September 23 acceptance replay uses the same exact terminal-history and claim requirements.

Server command results now carry an exact typed resolution. Native and Web accept an immediate success only for the exact requested action/session/link. `already_resolved`, incomplete, mismatched, and uncertain outcomes require canonical readback; a failed exact readback surfaces refresh/conflict. Native and Web no longer label a superseded or otherwise non-terminal review as confirmed.

## Verification

The corrected focused Server gate passed 13 files / 264 tests; the new high-risk regression subset passed 125/125. Phase 4 passed 139/139 and Phase 5 passed 65/65. ESLint and diff checks passed. The production Next webpack build compiled, type-checked, generated all 49 static pages, and completed successfully.

Adversarial fixture mutations cover extra held claims, malformed claim identity/history, a foreign confirmed link missing its companion workout claim, wrong terminal action, wrong selected session, empty resolution history, absent terminal lifecycle, corrupt idempotent replay, and untrusted explicit evidence. Each mutation is refused by the relevant guard. The previously completed code-mutation suite for family, time/basis, competition, duplicate workout, active Logger, atomic claim conflict, date boundary, and replay integrity remains green on the unchanged guard family. An attempted temporary source mutation that would remove the trusted-provenance filter was blocked by the execution safety layer, so no unsafe weakened source was written.

Native focused `FounderServerAPITests` passed 183/183 and the complete Native unit suite passed 1,313/1,313 on the sole retained iPhone 17 Pro simulator `A8157897-95ED-4480-9150-6136652A6519`. Disk had 15 GiB available before the runs. No extra simulator was created or retained.

## Pending gate

A sixth fresh-context independent adversarial review must inspect exact Server `a54a77f4f4ee69d0f08c9152fff6676d2c2a6b36` and Native `7d2fd4d481918eaf9985cddb2a6ff9c2d70bac7e`. No deployment or TestFlight authorization is implied.

## Flags

- AUTHORITY_REVERIFIED: YES
- SEP23_CANDIDATE_PRESENT: YES
- DETERMINISTIC_AUTOCONFIRM_RULE_DEFINED: YES
- AUTOCONFIRM_HARD_GUARDS_DEFINED: YES
- EXACT_RELATIONSHIP_GRAPH_VALIDATION: PASS
- IDEMPOTENT_REPLAY_REVALIDATION: PASS
- TRUSTED_LIVE_LOGGER_UNIVERSAL: PASS
- AMBIGUOUS_RECONCILIATION_UX_IMPLEMENTED: YES — NATIVE AND WEB
- REJECT_NO_MATCH_SUPPORTED: YES
- RECONCILIATION_HISTORY_DURABLE: YES
- HISTORY_STRATEGICALLY_INERT: YES
- HISTORY_CANNOT_OVERRIDE_HARD_GUARDS: YES
- SEP23_AUTOCONFIRM_ELIGIBLE: YES — PREVIOUS BOUNDED DRY-RUN; NOT APPLIED
- SEP23_LINK_CONFIRMED: NO
- ONE_TO_ONE_INTEGRITY_PASS: YES IN TESTS; PRODUCTION CANDIDATE REMAINS UNCONFIRMED
- LOGGER_DETAIL_UNCHANGED: YES
- DUPLICATE_TRAINING_SESSION_PRESENT: NO
- WORKOUT_STRATEGIC_ELIGIBILITY_ENABLED: NO
- NATIVE_BUILD_REQUIRED: YES
- NATIVE_BUILD_NUMBER: 56
- SERVER_FIX_REQUIRED: YES
- SERVER_DEPLOYED: NO
- TESTFLIGHT_UPLOADED: NO NEW BUILD
- STRENGTH_FINAL_VERDICT: PENDING SIXTH FRESH REVIEW AND SEPARATELY AUTHORIZED PRODUCTION GATES
- READY_FOR_CARDIO: NO
- SIMULATOR_RULE_PERSISTED: YES

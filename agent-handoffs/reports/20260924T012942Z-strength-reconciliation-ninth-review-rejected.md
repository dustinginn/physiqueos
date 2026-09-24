# Strength reconciliation semantics — ninth review rejected

Task: `codex-strength-reconciliation-ninth-review-20260923`  
Parent task: `codex-strength-reconciliation-semantics-20260923`  
Agent: Codex  
Generated: 2026-09-24T01:29:42Z

## Outcome

The ninth fresh-context independent review **rejected** exact Server candidate `b3e30001d05f1cef37a98412cb5187d1bb17c4df` and exact Native Build 56 candidate `de0d3829836dd2e84327d268d4682c97260260e6`.

No production deployment, policy mutation, relationship mutation, TestFlight upload, strategic-eligibility change, or Cardio work occurred. Production remains Server `31c88481d80703de3355c51f6695b760b0671020`, deployment `42035d0d-9368-4ada-a4c1-392e659f3366`, and Native Build 55 source `621dbef3cdcf17009e346111e4a86d14b70ed896`. The September 23 candidate remains quarantined and unconfirmed; `linkAutoConfirm` and workout strategic eligibility remain off.

## Independent-review findings

1. **High — historical claim identity:** claim history entries did not require an exact field shape or prove each historical holder link referred to the same deterministic workout/session subject. Reuse preserved those entries verbatim.
2. **Medium/high — lifecycle actor/reason exactness:** later pending/superseded transitions accepted arbitrary actor kinds and invented reasons despite having fixed system-owned semantics.
3. **Medium/high — Founder basis semantic binding:** rejected-alternative IDs could include the selected session, duplicates, or unrelated sessions; no-match outcome and released-link IDs were not bound to the review/relationship facts.
4. **Medium — edit-context read boundary:** `getEditContext` still returned a raw reconciliation record even though the detail read path was sanitized.

The reviewer passed 206/206 focused Server tests, Phase 4 at 139/139, Phase 5 at 65/65, and Native Founder Server API tests at 183/183 on the sole permitted iPhone 17 Pro simulator. Earlier temporal/provenance/current-candidate, one-to-one, no-match, September 23, quarantine, client acknowledgement, and unrelated-data invariants otherwise looked sound. Both worktrees remained clean; no external state changed.

## Next gate

Bind every claim-history holder to the deterministic subject, allowlist lifecycle actors/reasons, bind Founder basis data to stored review facts, sanitize or refuse reconciliation edit context, add regressions, rerun gates, freeze a new Server candidate, and obtain another fresh-context review. No deploy or upload authorization is implied.

## Flags

- NINTH_FRESH_REVIEW: CHANGES_REQUESTED
- SERVER_CANDIDATE: `b3e30001d05f1cef37a98412cb5187d1bb17c4df`
- NATIVE_CANDIDATE: `de0d3829836dd2e84327d268d4682c97260260e6`
- NATIVE_BUILD_NUMBER: 56
- SERVER_DEPLOYED: NO
- TESTFLIGHT_UPLOADED: NO NEW BUILD
- SEP23_LINK_CONFIRMED: NO
- WORKOUT_STRATEGIC_ELIGIBILITY_ENABLED: NO
- READY_FOR_CARDIO: NO

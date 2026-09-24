# Strength reconciliation semantics — eighth review rejected

Task: `codex-strength-reconciliation-eighth-review-20260923`  
Parent task: `codex-strength-reconciliation-semantics-20260923`  
Agent: Codex  
Generated: 2026-09-24T01:07:55Z

## Outcome

The eighth fresh-context independent review **rejected** exact Server candidate `5e0dd8e3a5f2d3eea1013b6a3787c2f4df8d8cdc` and exact Native Build 56 candidate `de0d3829836dd2e84327d268d4682c97260260e6`.

No production deployment, policy mutation, relationship mutation, TestFlight upload, strategic-eligibility change, or Cardio work occurred. Production remains Server `31c88481d80703de3355c51f6695b760b0671020`, deployment `42035d0d-9368-4ada-a4c1-392e659f3366`, and Native Build 55 source `621dbef3cdcf17009e346111e4a86d14b70ed896`. The September 23 candidate remains quarantined and unconfirmed; `linkAutoConfirm` and workout strategic eligibility remain off.

## Independent-review findings

1. **High — released-claim reuse:** global integrity ignored released claim rows, and acquisition reused any non-held occupant by spreading its unvalidated schema, owner, kind, quarantine, and history. A malformed released deterministic claim could therefore be promoted into an invalid held/confirmed graph.
2. **Medium/high — exact terminal lifecycle/basis:** terminal validation accepted arbitrary or non-monotonic nonterminal lifecycle entries and mode-inappropriate provenance fields, such as Founder no-match carrying a deterministic rule version.
3. **Medium — nested read sanitization:** the presentation still shallow-copied the raw workout and candidate objects, so injected history-like fields nested there could cross the read boundary even though the sibling review shell was sanitized.

The reviewer passed 193/193 focused Server tests and 183/183 Native Founder Server API tests on the sole permitted iPhone 17 Pro simulator. Exact history identity, current resolved-replay guards, trusted live-Logger/temporal checks, and Native/Web acknowledgement otherwise looked sound. Both worktrees remained clean; no files or external state were changed by the reviewer.

## Next gate

Validate every stored claim state before reuse, make terminal basis/lifecycle schemas exact, explicitly project allowed workout/candidate fields, add adversarial regressions, rerun the relevant gates, freeze a new Server candidate, and obtain another fresh-context independent review. No deploy or upload authorization is implied.

## Flags

- EIGHTH_FRESH_REVIEW: CHANGES_REQUESTED
- SERVER_CANDIDATE: `5e0dd8e3a5f2d3eea1013b6a3787c2f4df8d8cdc`
- NATIVE_CANDIDATE: `de0d3829836dd2e84327d268d4682c97260260e6`
- NATIVE_BUILD_NUMBER: 56
- SERVER_DEPLOYED: NO
- TESTFLIGHT_UPLOADED: NO NEW BUILD
- SEP23_LINK_CONFIRMED: NO
- WORKOUT_STRATEGIC_ELIGIBILITY_ENABLED: NO
- READY_FOR_CARDIO: NO

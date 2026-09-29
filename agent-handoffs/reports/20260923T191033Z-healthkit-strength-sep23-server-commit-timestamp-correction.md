# HealthKit Strength Sep 23 Server commit-timestamp correction

- Task id: `healthkit-strength-sep23-server-commit-timestamp-correction-20260923`
- Agent: Codex
- Status: completed implementation and review; stopped before deployment
- Server base: `98f8ccec5ab8eaebc25631139e574b69267f9c74`
- Server candidate: `31c88481d80703de3355c51f6695b760b0671020`
- Production Server: `98f8ccec5ab8eaebc25631139e574b69267f9c74`
- Production deployment: `aef7251a-6390-4dd8-b845-f4f27c5f4337`
- Native candidate: `621dbef3cdcf17009e346111e4a86d14b70ed896`, Build 55, not uploaded

## Outcome

The smallest fail-closed Server correction is implemented and cleanly reviewed. The existing Logger session is not edited and no end time is manufactured into its payload. The guarded matcher instead receives the immutable, owner-scoped canonical storage row `created_at` and may use it only when all of these are true:

1. the evidence record is a native live Logger session;
2. no explicit Logger end exists;
3. `captured_at` exactly equals the known synthetic local-date-noon fallback;
4. the durable Server timestamp is valid and does not predate the Logger start; and
5. the resulting end aligns with the HealthKit workout under the existing tolerance.

Missing, invalid, pre-start, or far-post-workout storage timestamps remain possible matches and cannot qualify as confident through generic start/duration scoring. Non-synthetic Logger captures and explicit Logger ends retain their prior behavior.

The durable timestamp input is also threaded through ordinary HealthKit relationship reassessment and the read-only canary. This prevents a guarded confident candidate from being downgraded later by a recomputation that lacks the Server timestamp, and prevents the canary from contradicting stored state.

Matcher version advances from v4 to v5. Auto-confirm remains compile-time false. Candidate links remain quarantined and strategically ineligible.

## Production-shaped regression

The fixture reproduces the existing Sep 23 shape: one same-day canonical Strength workout, one same-day native live Logger Strength session, Logger start within the workout window, no explicit Logger end, synthetic-noon `captured_at`, and a separate durable Server-owned creation instant aligned with the HealthKit workout end.

With the durable timestamp, local dry-run prediction is:

- result: `dry_run`
- match: `confident_match`
- confidence: `95`
- basis: `logger_session_window`
- link status: `candidate`
- matcher: `healthkit-strength-matcher-v5`
- predicted writes after a separately authorized apply: create one quarantined candidate link; update only the canonical workout link assessment; create one authorization audit row
- unchanged by design: Logger evidence byte-identical; canonical workout current data byte-identical; no claim; no confirmation; strategic eligibility quarantined; policies read-only

This is a local production-shaped result only. Production has not run this candidate because it has not been deployed.

## Mutation proof

Four intentional mutations were exercised and restored:

1. Removing the reassessment runner's Server timestamp map changed the Sep 23 fixture to `possible_match` and failed four reassessment tests.
2. Restoring synthetic noon as an end without valid storage metadata made a morning synthetic record incorrectly become `confident_match`; the fail-closed regression failed.
3. Removing durable metadata from ordinary reconciliation downgraded the guarded candidate from confidence 95 to 50 and failed both the guarded-durability and canary tests.
4. Restoring the generic qualification fallthrough made aligned-start/matching-duration cases with missing, invalid, pre-start, and misaligned commit timestamps incorrectly become `confident_match`; the new regression failed.

All mutations were reverted before the final commit.

## Validation

- Codex release slice: 8 test files, 150 tests passed.
- Changed-file ESLint: passed.
- `git diff --check`: passed.
- Independent final review: no findings.
- Independent reviewer validation: 10 impacted test files, 196 tests passed.
- Worktree: clean at exact candidate `31c88481d80703de3355c51f6695b760b0671020`.

The broad unit run has known unrelated sparse-worktree/environment fixture failures and is not represented as green. The scoped suites cover the matcher, reassessment operation, ordinary persistence reassessment, canary, training/HealthKit boundaries, strategic quarantine, and persistence ownership.

## Review history

Fresh-context review found three issues before the final verdict:

- synthetic noon could still be used when durable metadata was absent;
- ordinary relationship reassessment and canary recomputation did not receive the timestamp and could downgrade or contradict the guarded candidate;
- the dedicated Logger branch could fall through to generic start/duration qualification despite an untrusted end.

All three were corrected, mutation-tested, and included in the exact final re-review. Final review verdict for `98f8ccec..31c88481`: no findings.

## Safety and authority

No production command was run in this implementation chunk. No Server deploy, reassessment apply, Logger edit, policy mutation, link/claim mutation, TestFlight upload, or Cardio work occurred. Production remains on the previously verified Server SHA and deployment listed above. Build 55 remains local and unuploaded.

## Required next decision

Founder approval is required before deploying exact Server candidate `31c88481d80703de3355c51f6695b760b0671020`. If approved, use the established production procedure with runtime SHA/build stamping, force rebuild, authority and health verification, and zero-write verification. After deployment, run only the read-only Sep 23 reassessment dry-run and report its exact predicted mutations, match result, confidence/basis, and invariants. Applying reassessment mutations and uploading Build 55 each remain separate approval gates. Cardio remains out of scope until Strength reaches its final verdict.

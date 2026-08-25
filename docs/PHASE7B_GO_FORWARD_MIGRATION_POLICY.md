# Phase 7B go-forward migration policy

This document is the authoritative decision and risk policy for the remaining PhysiqueOS migration. Chronological `.tmp` handoffs remain audit evidence, not active eligibility state.

## Risk policy

PhysiqueOS currently serves one Founder. The migration must preserve application architecture, source and repository history, features, operational continuity, and an explicit single canonical authority. Canonical corruption, ambiguous authority, source loss, unknown-blast-radius mutation, and automatic retry of an ambiguous mutation remain fail-closed.

Perfect preservation of every historical Founder record is secondary. The Founder accepts roughly one week, and if disproportionate complexity would otherwise result potentially more, of bounded personal historical-data loss provided application architecture and functionality remain intact. Controls therefore distinguish catastrophic risk, bounded historical-data risk, recoverable migration rework, and procedural ceremony. Read-only work receives proportionate ceremony.

Windows remains canonical until an explicit transition. There are never two canonical writers. Derived identities are computed from authoritative repository or filesystem state rather than transcribed. Safety-critical execution logic is tracked or deterministically reproducible. Historical evidence is immutable and auditable but never becomes active eligibility merely because it exists. Encrypted recovery artifacts are trusted only after binary decrypt-to-hash verification. No new spending is presumed.

## Authorization and recovery

A current WP2 authorization is eligible only through its explicitly selected path and exact SHA-256, current attempt and tooling commit, authorized stage, expiry, one-use marker, mutation budget, and current source/inventory/quiescence bindings. Earlier authorization files remain unchanged audit evidence. Their number and contents do not ratchet current eligibility. A malformed or still-eligible authorization for the same current attempt and commit blocks replacement; an expired or consumed current authorization is terminal evidence, not executable authority.

WP2 Stage 3 records deterministic plaintext ZIP SHA-256 and bytes, encrypts through the masked Windows passphrase bridge, then asks the Founder to enter the same passphrase again. `age` decrypts to a binary .NET stream whose SHA-256 and byte count must exactly match the plaintext ZIP before replication. No decrypted round-trip file or secret-bearing report is created. Stage 4 independently reads back the ciphertext replica. Stage 5 binds the receipt and teardown evidence, requires the round-trip evidence, and consumes the one-use authorization. WP2-C remains the isolated operational restore and is not replaced by Stage 3 verification.

The accepted retained Stage-2 receiver is continuation state and is not recreated by development or regeneration. Per-attempt evidence, authorization documents, nonces, reports, and invocation contracts remain ignored. Parameterized Stage 3–5 launchers and their deterministic invocation-contract generator are tracked so orchestration can be reproduced from tracked source, the current commit, and explicit accepted inputs.

Minimum WP2 closeout evidence is: capture and deterministic ZIP identity; successful encryption and decrypt-to-hash match; ciphertext identity; independent replica readback; receipt; primary and laptop transport teardown; one-use authorization consumption; and later WP2-C isolated decrypt, restore, and operational verification.

## Remaining migration map

1. Complete WP2B capture, replica verification, teardown, and authorization consumption.
2. Complete WP2-C isolated restore and evidence acceptance.
3. Run the synthetic migration rehearsal and reconcile results without changing canonical authority.
4. Obtain **GO-B** for downtime/fence and reversible pre-M progression.
5. Perform the reversible real-cutover preparation and validation.
6. Obtain **GO-L** for authority/routing transition while the exact no-provider-write reversal remains available.
7. Validate provider readiness with no provider canonical write.
8. Obtain **GO-M** for the irreversible first provider canonical write.
9. After M, recover provider-forward only; Windows never regains write authority.
10. Stabilize, retire legacy dependencies only under their own authorization, then resume Native/iOS work.

L and M remain separate decisions. Rollback remains meaningful until M; after M the only supported recovery direction is provider-forward.

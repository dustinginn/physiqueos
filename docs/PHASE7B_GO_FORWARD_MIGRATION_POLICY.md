# Phase 7B go-forward migration policy

This document is the authoritative decision and risk policy for the remaining PhysiqueOS migration. Chronological `.tmp` handoffs remain audit evidence, not active eligibility state.

## Risk policy

PhysiqueOS currently serves one Founder. The migration must preserve application architecture, source and repository history, features, operational continuity, and an explicit single canonical authority. Canonical corruption, ambiguous authority, source loss, unknown-blast-radius mutation, and automatic retry of an ambiguous mutation remain fail-closed.

Perfect preservation of every historical Founder record is secondary. The Founder accepts roughly one week, and if disproportionate complexity would otherwise result potentially more, of bounded personal historical-data loss provided application architecture and functionality remain intact. Controls therefore distinguish catastrophic risk, bounded historical-data risk, recoverable migration rework, and procedural ceremony. Read-only work receives proportionate ceremony.

Windows remains canonical until an explicit transition. There are never two canonical writers. Derived identities are computed from authoritative repository or filesystem state rather than transcribed. Safety-critical execution logic is tracked or deterministically reproducible. Historical evidence is immutable and auditable but never becomes active eligibility merely because it exists. Encrypted recovery artifacts are trusted only after binary decrypt-to-hash verification. No new spending is presumed.

## Authorization and recovery

A current WP2 authorization is eligible only through its explicitly selected path and exact SHA-256, current attempt and tooling commit, authorized stage, expiry, one-use marker, mutation budget, and current source/inventory/quiescence bindings. Earlier authorization files remain unchanged audit evidence. Their number and contents do not ratchet current eligibility. A malformed or still-eligible authorization for the same current attempt and commit blocks replacement; an expired or consumed current authorization is terminal evidence, not executable authority.

WP2 Stage 3 records deterministic plaintext ZIP SHA-256 and bytes and encrypts only to an authorization-bound native `age` public recipient. Before any Stage-3 mutation, the Founder pastes the corresponding single `AGE-SECRET-KEY-...` identity twice into a masked Windows dialog; `age-keygen -y` receives it through redirected stdin and must derive the exact bound recipient. The identity remains in transient process memory for the capture and is supplied to `age --decrypt -i -` through redirected stdin, never argv, environment, a file, a report, or ConsoleHost injection. The decrypted binary .NET stream's SHA-256 and byte count must exactly match the plaintext ZIP before replication. No decrypted round-trip file or secret-bearing report is created. Stage 4 independently reads back the ciphertext replica. Stage 5 binds the public recipient, receipt, and teardown evidence, requires the round-trip evidence, and consumes the one-use authorization. WP2-C remains the isolated operational restore and must receive the same Founder-custodied native identity through its separately authorized secure stdin path.

The public recipient and exact `age.exe`/`age-keygen.exe` path and binary identities are current contract and authorization bindings. The secret identity is never one. The Founder must retain the native identity independently of the Primary PC; losing it makes the new native-recipient packet unrecoverable. Historical passphrase-encrypted packets continue to require their historical passphrase and plugin workflow and are not silently converted.

The accepted retained Stage-2 receiver is continuation state and is not recreated by development or regeneration. Per-attempt evidence, authorization documents, nonces, reports, and invocation contracts remain ignored. Parameterized Stage 3–5 launchers and their deterministic invocation-contract generator are tracked so orchestration can be reproduced from tracked source, the current commit, and explicit accepted inputs.

Minimum WP2 closeout evidence is: capture and deterministic ZIP identity; successful encryption and decrypt-to-hash match; ciphertext identity; independent replica readback; receipt; primary and laptop transport teardown; one-use authorization consumption; and later WP2-C isolated decrypt, restore, and operational verification.

### Pending-descriptor compatibility and finalization

The native-recipient schema-v1 Stage 3 pending descriptor owns capture, packet, and decrypt-round-trip evidence. Its exact 44-property producer shape does not duplicate capture authorization ID/hash/tooling commit or quiescence hash. Stage 5 must not rewrite that accepted evidence. Its shared read-only preflight/finalizer validator recognizes exactly that shape, or that same shape with all four exact authorization duplicates; partial duplicates, contradictory duplicates, unknown properties, and unknown schemas fail closed.

Authorization identity comes from the independently hash-selected, unexpired, unused capture authorization. Quiescence identity comes from the existing file named by that authorization, with its actual file hash and evidence contract checked against the authorization's original quiescence tooling lineage. The invocation contract is independently hash-validated and must agree on attempt, tooling, Stage 3, native recipient, and age identities. The final descriptor records those authoritative values without changing the pending descriptor. Validation runs before primary teardown evidence is written and again before finalization. Durable ordering remains primary teardown evidence, imported receipt, final descriptor, then marker-only authorization consumption. Pending evidence remains retained.

Schema compatibility does not grant cross-commit execution authority. A published correction leaves prior invocation/authorization bytes as truthful historical evidence; it does not make them current under the new tooling commit. A separately reviewed and authorized provenance-preserving Stage 5 binding is required before executing corrected tooling against a successful earlier capture. Do not regenerate the packet/pending/receipt or replace authorization merely to bypass that boundary. Marker-to-descriptor hash binding remains a possible separate hardening task, not part of schema compatibility.

The Stage-5-only continuation design is specified in [PHASE7B_STAGE5_CONTINUATION_DESIGN.md](PHASE7B_STAGE5_CONTINUATION_DESIGN.md). Its binding records original capture and current finalization provenance separately, grants no execution authority, and ultimately consumes only the original authorization while still unexpired. Receipt transport and binding creation require separate Founder review before an explicit Stage-5 execution GO.

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

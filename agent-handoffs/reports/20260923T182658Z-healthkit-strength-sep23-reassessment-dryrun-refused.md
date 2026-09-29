# Sep 23 Strength reassessment dry-run — safely refused

Task: `healthkit-strength-sep23-reassessment-dryrun-20260923`  
Agent: Codex  
Generated: 2026-09-23T18:26:58Z

## Verdict

The dedicated production reassessment dry-run ran and safely refused. **Do not apply the reassessment.**

The deployed matcher selected the correct unique Logger-window relationship but could not prove Logger-end alignment because the existing Sep 23 canonical Logger record does not contain the real commit instant. No production data or policy was mutated.

## Production authority

- Server SHA: `98f8ccec5ab8eaebc25631139e574b69267f9c74`.
- Active deployment: `aef7251a-6390-4dd8-b845-f4f27c5f4337`, ACTIVE 9/9.
- Web and worker source SHA: exact `98f8ccec`.
- Web and worker runtime identity: `98f8ccec` / `physiqueos-98f8ccec-20260923`.
- Live and ready: HTTP 200/200; all nine readiness checks green; migration 14 unchanged.

## Dry-run safety envelope

- Operation: `link-reassess`.
- Mode: `dry-run` only.
- Local date: 2026-09-23 only.
- Authorization reference: null, as required for a dry-run.
- Transaction: `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`.
- Runtime SHA and Founder-owner scope verified before database reads.
- `transaction_read_only=on` verified.
- Transaction rolled back.
- Apply mode was not invoked.
- No TestFlight operation was invoked.

## Exact dry-run result

- Operation outcome: `refused`.
- Refusal reason: `single_session_below_confident_threshold`.
- Match outcome: `possible_match`.
- Matcher version: `healthkit-strength-matcher-v4`.
- Candidate count: 1.
- Confidence: 50.
- Basis: `logger_session_window`.
- Start aligned: false.
- End aligned: false.
- Overlap: 3,826 seconds.
- Same-day canonical Strength workout count: 1.
- Same-day native live Logger Strength session count: 1.

The Logger starts 332 seconds after the HealthKit workout start—32 seconds outside the existing five-minute start-alignment tolerance—while still starting within the workout window. This correctly activates the dedicated unique Logger-window rule but does not independently prove a confident match.

## Exact predicted mutation

**None.**

The operation refused before creating its normal confident-match mutation plan. It did not predict or execute:

- a candidate link creation;
- a canonical workout assessment update;
- a reassessment audit-row creation;
- a confirmed link or claim;
- a Logger mutation;
- a policy or strategic-eligibility change.

For clarity, the reviewed operation would only construct its bounded three-record plan after a confident `logger_session_window` match. That gate did not pass in this run.

## Root cause

The matching code and uniqueness rule are active and working. The failure is the existing Logger record's legacy end-time evidence:

- Logger mode: `live`.
- Logger origin: `training_logger`.
- Start present: yes.
- Native `finishedAt` / canonical metadata end: absent, as expected for Build 54.
- Canonical payload `captured_at`: present.
- Selected fallback source: payload `captured_at`.
- That value is the Server's synthetic local-date noon fallback, not the Logger commit instant.
- Inferred Logger end relative to the HealthKit end: -10,632 seconds.

The Server command path uses `payload.capturedAt ?? metadata.clientOccurredAt ?? <local-date noon>`. Native did not send `capturedAt`, and this real command lacked a usable client-occurrence timestamp, so the canonical Training object received noon. Tests supplied a real commit-like capturedAt and therefore did not model this production shape.

This disproves the earlier assumption that the existing canonical payload already retained the 14:56 commit instant. Build 55's new `finishedAt` remains the correct forward-looking fix, but it cannot repair the already-committed Build 54 object by itself.

## Invariants and unchanged facts

- Runtime SHA gate passed at the exact deployed commit.
- Exactly one Sep 23 canonical Strength workout was selected.
- Exactly one Sep 23 native live Logger Strength session was selected.
- There was no ambiguity and no wrong-session selection.
- The existing Strength policy remains Strength-only, open-ended from Sep 23, historical backfill false, strategic eligibility quarantined, and `linkAutoConfirm=false`.
- Existing link count: 1 globally (the previously accepted Sep 22 link); no Sep 23 link was added.
- Existing claim count: 2 globally; no claim was added or changed.
- Canonical workouts: 4 globally; no workout record changed.
- Canonical Evidence objects: 570; no Logger object changed.
- Canonical days: 6; no day changed.
- HealthKit observations: 165; no observation changed.
- Daily and workout policy digests were captured by the dry-run drift fence and were not mutated.
- Pre/post deployment zero-write audits already proved all reported strategic, HealthKit, policy, link/claim, and migration digests identical.

## Required correction before another dry-run

A new Server correction must provide the existing Sep 23 reassessment path with a real, durable Server-owned commit timestamp rather than treating the synthetic payload noon value as a valid completion time. The correction must remain narrowly scoped and fail closed:

1. expose or query the durable record/command commit timestamp for the selected legacy Logger object;
2. use it only when Native `finishedAt` is absent and the payload timestamp is demonstrably synthetic/unusable;
3. never modify Logger detail;
4. preserve one-workout/one-session uniqueness, quarantined candidate-only behavior, auto-confirm off, and strategic eligibility off;
5. add a production-shaped fixture for the noon fallback plus true durable commit timestamp;
6. mutation-test and fresh-review the new candidate;
7. obtain separate Founder authorization before deploying any new SHA;
8. rerun the read-only Sep 23 dry-run before requesting reassessment apply.

## Explicitly not done

- Reassessment apply: not performed.
- Sep 23 link or workout assessment mutation: not performed.
- Policy mutation: not performed.
- Build 55 TestFlight upload: not performed.
- Cardio work: not started.

## Security

No credentials, tokens, secret bindings, database URLs, certificates, raw production export, exercise details, loads, notes, calories, heart rates, or private media are included. Timing is reported only as the minimal relative offsets necessary to explain the fail-closed match result.

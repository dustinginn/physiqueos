# DEXA confirmation continuation: bounded steps and the October 9 recovery

Status: candidate on `claude/dexa-bounded-confirmation-recovery-20261009`, based on the
Build 93 Server candidate `e03f6768`. Not deployed. The recovery below has not been run.

## What happened (2026-10-09, read-only triage report `20261009T150500Z`)

The Founder's October 9 BodySpec PDF was stored and interpreted, the review was confirmed,
`canonical_commit` completed (canonical `dexa_scan|<owner>|2026-10-09`, revision 1) and
Native saved both Apple Health writeback receipts. The next step, `compatibility_writes`,
was killed twice by memory exhaustion: in the worker (the continuation dead-lettered with
`OUTBOX_ATTEMPTS_EXHAUSTED`) and then in the web process, when the Native retry resumed the
`partially_committed` review and ran the step inside the request. The review was left
`committing` under an expired `native-confirm` claim with no live continuation. Log shows
"Processing" indefinitely; nothing will advance it.

## Root cause

For a DEXA scan `compatibility_writes` loaded the whole canonical runtime to find one
canonical record, then wrote one `dexaScans` row through the repository facade, which loads,
clones and rewrites the whole runtime. On the 1 GB instances (about 512 MB of V8 heap) that
no longer fits: the foundation runtime is 62.8 MB of canonical JSON (2026-10-09; 52.6 MB on
2026-09-20). Later DEXA steps had the same shape (appointment save, analysis and Goal
evaluation reads, the DEXA Event briefing's full load, clone and whole-store digest).

## Corrections (four commits)

1. **Bounded DEXA steps** (`DexaConfirmationBoundedSteps`, used only when the confirmed
   package's included evidence is DEXA only; every other type is unchanged):
   * `executePostgresFounderRecordMutation` writes named records only, each read
     `FOR UPDATE` under the owner lock and runtime authority boundary and written fenced on
     its read version; no collection is loaded. Row metadata matches `replaceCollection`.
   * The compatibility row and the appointment reconciliation are single-record writes that
     reuse the existing repository and `DexaAppointmentLifecycleService` logic. Replays write
     nothing.
   * Canonical, legacy DEXA, Goal evaluation and briefing-preference reads load only their
     collections. The DEXA Event narrative receives a bounded runtime (no clone) of the
     collections it reads, excluding review/package history, Training events and libraries,
     and PI queues.
   * `createGuardedBoundedRuntime` makes every unloaded collection throw on first use, so a
     bounded read can never silently compute from an empty default.
2. **Native retry runs no step in the request.** When a Native Confirm resumes a review whose
   canonical save is already durable, the synchronous step budget is zero: claim, release to
   the continuation chain, return processing/accepted.
3. **Streaming semantic digest.** The whole-store digest every V3 publication captures is
   hashed in 64 KB pieces instead of one giant string. Digests are byte-for-byte unchanged.
4. **Memory harness** (`scripts/operations/memory/`), opt-in.

## Measured bounds

Synthetic production-shaped runtime of 87.9 MB (1.4x production), each step in its own
process at `--max-old-space-size=512` with a 150 MB retained baseline:

| Step | Before | After | Min heap after (no baseline) |
| --- | --- | --- | --- |
| compatibility_writes | out of memory | 171 MB | 80 MB |
| scheduled_completion | out of memory | 171 MB | 80 MB |
| analysis | 486 MB | 335 MB | 128 MB |
| goal_evaluation | 479 MB | 331 MB | 112 MB |
| briefing (DEXA Event) | 514 MB | 387 MB | 192 MB |
| confirmation entry (every step, unchanged) | 476 MB | 476 MB | 336 MB |

Residual: every invocation still starts with one in-scope whole-runtime load for the
durable-resume proof (`assertDurableResumeState`). It is unchanged, passes at 512 MB with the
baseline on the 1.4x runtime, and survived at least four times in production on October 9 at
production size. It becomes the limiting step if the foundation runtime grows past about
85 MB; bounding it is the recommended next Server change.

## October 9 recovery (guarded; requires separate Founder authorization)

Why not reset the dead message: its continuation key names the checkpoint before the Native
retry (`compatibility_writes:not_started:0`) and its operation does not own the claim, so the
worker would reject it as stale and do nothing. Recovery instead inserts exactly one
continuation for the review's current checkpoint, built by
`createEvidenceReviewContinuationMessage` (what the system itself enqueues). The worker takes
over the lapsed claim and resumes from `compatibility_writes`. The dead message stays as
history. Recovery writes nothing else.

Order (never earlier):

1. Codex completes or explicitly yields the Build 93 gated release.
2. A Server containing this fix is deployed (the builder refuses any `--sha` whose tree lacks
   it; production `84cc64e4` and Build 93 `e03f6768` are refused).
3. Preview, read-only:
   `node scripts/operations/buildDexaContinuationRecoveryPayload.mjs --sha <deployed> --mode preview --out <scratch>/preview.mjs`
   then run it with the accepted console runner. Save the printed
   `PHYSIQUEOS_DEXA_CONTINUATION_RECOVERY_JSON` object to local operator scratch. It holds
   real identifiers: never commit or publish it.
4. Founder reviews the sanitized preview and gives an authorization reference.
5. Apply: `--mode apply --seal <scratch>/seal.json --authorization-ref <reference>`. The payload
   takes the owner lock, re-reads every fact with row locks, re-plans with the sealed message
   id and inserts only if the seal matches exactly; any drift refuses with `SEAL_DRIFT`
   (re-run the preview). Re-running apply after success reports `already_applied`.
6. Postflight, read-only, repeatedly: `--mode postflight --seal <scratch>/seal.json` reports
   `in_progress` (with the next step), `failed`, `complete`, or
   `complete_with_discrepancies`.

Preview refuses unless all of these hold: exactly one DEXA intake receipt for 2026-10-09,
stored and interpreted; its review is `committing`, owned by the runtime owner, a single DEXA
object for the date; completed steps exactly `[canonical_commit]`, next
`compatibility_writes`; canonical_commit recorded the scan; claim `in_progress` under
`native-confirm:` with its lease lapsed at least five minutes; exactly one canonical DEXA for
the date, active, revision 1, from this review; no legacy row for the date; the
`execution_next_dexa` appointment scheduled for the date and not completed by the scan; no
DEXA Event briefing, DEXA analysis or Goal evaluation for the package; exactly two Apple
Health receipts for revision 1; exactly one continuation message, dead, none live; no
message already holds the current checkpoint key; no other open DEXA review for the date.

Postflight expectations once confirmed: all nine steps completed, canonical_commit attempted
once, one canonical DEXA still revision 1, Apple Health receipts unchanged (no new write),
exactly one legacy row, the appointment completed once by the canonical scan, DEXA analysis
and Goal evaluation present, exactly one DEXA Event briefing, no live continuation.

Stop conditions: any refusal, a `failed` postflight, or a dead recovery message. Do not
re-upload the PDF, re-confirm, mark the DEXA priority complete or skipped, reset messages by
hand, or touch Apple Health. If the resumed run fails, the dead-letter handler makes the
review `partially_committed` (observable); diagnose before any further action.

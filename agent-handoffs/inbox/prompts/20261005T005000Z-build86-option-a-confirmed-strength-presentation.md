PhysiqueOS Build 86 final Server semantics — Option A confirmed Strength link

TASK TYPE

Continue in the EXISTING Build 86 Claude Remote Control chat/session.
Use High reasoning.
Do not create a new Claude chat.
Stay in the current Remote Control-authorized worktree.
DO NOT use EnterWorktree or create/switch to another worktree.

FOUNDER DECISION

Founder approves Option A.

For a confirmed HealthKit Strength link:
- the PhysiqueOS Workout Logger remains canonical for session start, end and duration;
- the Logger remains canonical for exercises, sets, reps, loads and structured completion;
- Apple Health contributes confirmed telemetry such as active energy and heart rate;
- a late/truncated Apple workout must NOT replace the Logger session window.

Today's pending item remains:
Apple Traditional Strength Training 1:28 PM–1:48 PM
Logger session 1 Traditional Strength Training 12:31 PM–1:47 PM
55% possible match.

The Founder has no preference about the review itself beyond preserving clean canonical semantics. Do not mutate the pending production review unless the governing product workflow already exposes an explicitly safe, authorized action and the staged task specifically authorizes it. Default: leave the review pending and instruct the Founder what to tap after verification.

CURRENT AUTHORITY

Build 86 final integration report:
agent-handoffs/reports/20261005T003623Z-build86-final-integration.md

Current deployed Server:
51c459c410b268f35e6388eeb17f0b6ed7eb548c

Current Native combined Build 86:
cec8af20a6121bb66ecca3ba9f667d91774a891c

No Native behavior change should be required for Option A.

PART A — IMPLEMENT OPTION A

Reverify current Server authority.

At the narrow authoritative confirmed-link presentation layer, change confirmed Strength presentation so:
- start/end/duration/detail-line timing stay from the structured Logger session;
- Apple confirmed active energy is projected where current confirmed telemetry owns it;
- Apple confirmed average heart rate is projected where current confirmed telemetry owns it;
- existing source/provenance correctly indicates confirmed Apple telemetry without implying Apple owns the structured session window;
- sets/exercises remain untouched;
- no duplicate canonical strength session is created;
- no matching/trust/review policy changes;
- no record mutation is required to alter presentation.

If other telemetry fields exist, preserve the current intended confirmed-link ownership unless they logically encode the Apple workout window itself. Do not invent new presentation copy unless needed for correctness.

Optional Apple coverage note such as “Apple Health recorded 20 of 76 min” is NOT required for this patch unless the existing UI/data contract already has a natural place for it. Prefer the smallest semantics correction.

PART B — TESTS

Add/update deterministic tests proving:
- pending candidate => Logger window;
- possible_match => Logger window;
- No match/unlinked => Logger window;
- confirmed full-window Apple link => Logger window + Apple telemetry;
- confirmed late/truncated Apple link => Logger window + Apple telemetry;
- no candidate => Logger window;
- sets/exercises unchanged;
- no mutation;
- all current presentation consumers agree: Workout Detail, Training Day/Activity, Logged Today and any shared projection.

Run focused presentation suites and relevant Server suite comparison against current deployed base. Zero introduced failures.

PART C — DEPLOY

Deploy through the established guarded Server path.
Do not use EnterWorktree.

Verify:
- exact deployed SHA;
- web + worker authority;
- /live;
- /ready;
- relevant logs;
- no production review/link mutation.

If production deployment is blocked on an interactive authorization, request only the narrow required authorization.

PART D — TODAY'S PENDING REVIEW INSTRUCTION

After deployment and verification, determine whether today's review can safely be resolved with:

Use Logger session 1

Expected acceptance:
- canonical structured session remains 12:31 PM–1:47 PM;
- exercises/sets/reps/loads remain Logger-owned;
- Apple telemetry associates without replacing the Logger window;
- no duplicate strength session;
- daily Activity calories remain correct.

Do NOT click/resolve the Founder review yourself by default.

If all acceptance criteria pass, report exactly:
“Safe to tap Use Logger session 1.”

If not, report:
“Leave it pending”
and explain the blocker.

PART E — BUILD 86

Option A is Server-only unless source proves otherwise.

Do not alter Native combined head cec8af20 merely to record the Server change.
Do not bump Build 86.
Do not upload TestFlight yet unless separately authorized after this task.

After Server verification, restate whether Build 86 cec8af20 is ready for archive/TestFlight authorization.

PART F — LEDGER / REPORT

Resolve the confirmed-link Founder decision in DESIGN_IMPLEMENTATION_DELTA_LEDGER.md only after production verification.

Publish a concise report and normal latest pointers including:
- deployed Server SHA;
- exact Option A semantics;
- tests;
- production verification;
- today's pending-review instruction;
- Build 86 release readiness.

No manual production data mutation.
No new worktree.
No TestFlight upload.

STOP after Option A is deployed and verified and the Founder has an explicit instruction for the pending review.

END TASK.
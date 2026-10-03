CODEX TAKEOVER — Build 83 after Claude weekly-limit stop

TASK TYPE

Codex continuation from durable Claude checkpoint. Do NOT restart Build 83 from scratch.

Claude exhausted its weekly allowance after publishing a complete continuity checkpoint and pushing the current Native candidate.

READ FIRST, IN ORDER

1. agent-handoffs/reports/20261003T033236Z-build83-first-real-workout-corrections-checkpoint3.md
   main checkpoint commit:
   b2e1779aa8b639ca8508c817204b96df4b4ba511

2. agent-handoffs/inbox/prompts/20261003T003500Z-build83-first-real-workout-comprehensive-correction.md
   latest prompt authority:
   e25fd200eb4f669a61f92bdf22ee0c5d51dfe5bc

3. agent-handoffs/reports/20261003T002055Z-build82-live-workout-finish-stall-audit.md

4. agent-handoffs/backlog/PHYSIQUEOS_PRODUCT_BACKLOG.md
   Pay special attention to:
   "Build 83 Cardio classification — LOCKED Founder decision 2026-10-02"
   authority main:
   44db7e58b5171448931b3b1f1a7ecfa6ec31cb81

5. agent-handoffs/STANDING_DISK_SAFETY.md

6. mandatory GH checkpoint protocol.

CURRENT DURABLE AUTHORITY

Native base:
Build 82 e2cbcd0cf40dca64a4c8490bf0ebd4077b2eb69c

Pushed Native Build 83 candidate:
branch claude/build83-first-real-workout-corrections-20261003
SHA abb131d9e1a4cd9eeb6c1a5caca1e1ad9e1b9c4e

This candidate contains the comprehensive Watch/Training work and N1-N8 review fixes. Continue from it. Do not reimplement blindly.

Production Server:
d0ff65965233fa44e108387f01b649a2bdb476df
deployment 64533990-3f04-43bc-b710-a2d28dc1850e
Reverify before any production action.

Reviewed Server candidate A:
f91d76c0b5d21d3d2d90c73b7f815d77effee01d
Contains finish observability/performance/body-limit work.
Pushed, reviewed, NOT deployed.

WITHDRAWN:
Server candidate 22925625 is WITHDRAWN.
DO NOT deploy it.
DO NOT use it for D3.
Founder explicitly rejected its Cooldown-as-Cardio semantics.

CLAUDE LOCAL WORKTREES

Native:
~/Developer/PhysiqueOS/build83-first-real-workout-corrections-20261003

Server worktree noted by checkpoint:
~/Developer/PhysiqueOS/build83-server-20261003

Claude began a replacement branch before usage exhaustion:
claude/build83-server-cooldown-noncardio-20261003

Inspect local git/worktree state carefully before changing anything.
Preserve coherent uncommitted work if present.
Do not delete or reset Claude's local work until its value is understood.
If the replacement Cooldown branch contains half-written coherent work, review and continue it rather than starting over.
Never deploy uncommitted/local-only work.

LOCKED CARDIO SEMANTICS

Stair Stepper / HK type 44:
- canonical Cardio;
- strategically eligible under accepted prospective Cardio framework.

Cooldown / HK type 80:
- canonical workout/history record labeled Cooldown;
- NOT Cardio anywhere.

Cooldown MUST NOT:
- count as Cardio session;
- contribute Cardio counts;
- contribute Cardio minutes/totals;
- set hasCardio/equivalent flags;
- satisfy Cardio targets;
- appear as Cardio in Home, Active Goal, Training reporting/indicators;
- enter Cardio strategic evidence;
- affect V3 Confidence, Narrative, recommendations, Briefings or Cardio strategy.

Cooldown MAY appear:
- Log;
- Training Day/history;
- Activity/history;
as Cooldown.

Canonical history inclusion, workout-family reporting classification and strategic evidence eligibility are separate concepts.

No production policy change is authorized merely to accomplish this. If current model cannot represent it safely/backward-compatibly, STOP for Founder decision.

Build 82 backward compatibility remains required for Server read payloads until Build 83 adoption.

D3

Founder authorizes in principle a tightly bounded repair AFTER a correct new Server candidate is:
- committed;
- pushed;
- tested;
- fresh independently reviewed;
- directly authorized by Founder for exact SHA;
- deployed and verified.

Repair scope:
EXACTLY two Oct 2 Founder source_only unsupported workout observations:
- Stair Stepper;
- Cooldown.

Dry run first and fail closed unless exactly the expected two records match.

After apply:
- Stair Stepper canonical Cardio + eligible;
- Cooldown canonical Cooldown + non-Cardio + strategically ineligible;
- both appear appropriately in history;
- no duplicate workouts;
- Activity totals unchanged;
- exercise minutes unchanged by PhysiqueOS repair;
- no other record affected;
- no historical Briefing/Confidence/Narrative/recommendation rewrite.

DO NOT execute D3 until exact-SHA production authorization is obtained.

NATIVE CURRENT STATE

Checkpoint says:
- Native abb131d9 pushed.
- Watch unit 26/26.
- finish/training focused 197/197.
- full iOS 1,966 tests, 1 skipped, one known Peptide fixture failure that reproduces on Build 82.
- previous Watch UI 7/7; rerun needed on abb131d9.
- fresh Review 3 of abb131d9 had not yet run.
- N1-N8 from prior review were fixed in abb131d9.

Your job:
1. Reverify pushed abb131d9 matches local candidate.
2. Run remaining targeted/Watch UI gates resource-safely.
3. Independently review abb131d9 from fresh context, focused on:
   - one finishOperationId;
   - exactly-once structured commit;
   - exactly-once HK workout save;
   - phone Finish/Watch Finish/concurrent Finish;
   - HealthKit retry;
   - deferred Watch commands;
   - Not Yet;
   - discard-after-finish;
   - terminal ledger;
   - rest;
   - relaunch;
   - transport recovery;
   - fixed Watch UI;
   - swipe-right controls;
   - Daily Totals.
4. Fix any real blocker/major and re-review.
5. Do not "fix" the known Peptide fixture unless it is actually a Build 83 regression; prove baseline parity.

PRESERVE ALL IMPLEMENTED BUILD 83 UX

- primary Watch execution non-scrollable;
- no scrollbar/system-clock overlap;
- bottom edge Complete Set;
- green progress;
- Metrics order Time / Active / Total / HR;
- distinct icon accents;
- third Daily Totals page;
- SWIPE RIGHT opens Pause/Resume, Finish, Cancel;
- swipe left does not open controls;
- Crown vertical paging Execution -> Metrics -> Daily Totals;
- Watch Workout Saved Done;
- bounded Waiting for iPhone / Retry;
- phone Still saving / Waiting for network / Retry;
- terminal rest stop;
- Return to Log immediate Watch propagation;
- network diagnostics export.

AUDITS ALREADY CLOSED

Activity calories/exercise minutes:
LEGITIMATE. No PhysiqueOS numerical change.

Add Set:
no defect; likely accidental Add Set tap. Deterministic regression test exists. No product change.

Zero PR events:
expected. Closed.

DEXA HealthKit:
READY/HOLD. OUT OF SCOPE.

Sleep v3:
live prospectively. DO NOT disturb.

SERVER CONTINUATION

Build a new candidate that includes:
- candidate A f91d76c0 work;
- D1 Stair Stepper;
- corrected D2 Cooldown non-Cardio-everywhere semantics;
- D3 dry-run/apply tooling but DO NOT execute;
- explicit canonical-vs-reporting-vs-strategic separation.

Tests must prove Cooldown exclusion from:
- Cardio session counts;
- Cardio minutes;
- hasCardio;
- Cardio targets;
- Home/Active Goal Cardio indicators;
- graduation;
- Weekly/Midweek/Monthly evidence;
- confidence;
- narrative/recommendation inputs;
- Cardio strategy/volume reads.

Tests must prove Cooldown still appears as Cooldown in appropriate history surfaces.

Stair Stepper must remain canonical Cardio + strategically eligible.

Run fresh independent Server review.

Once exact new Server SHA is ready:
PUBLISH A GH CHECKPOINT WITH THE EXACT SHA AND STOP BEFORE DEPLOY.
Founder must directly authorize that exact SHA.
Do not infer authorization from prior withdrawn SHA.

AFTER EXACT-SHA AUTHORIZATION

Only then:
- guarded production deploy;
- verify exact web/worker SHA, deployment, live/ready;
- D3 dry run;
- if exactly expected two records, apply;
- independent read-only verification.

BUILD 83 RELEASE

After Server + Native gates:
- generator deterministic;
- Build 83 only;
- signed archive;
- verify iPhone, Widget/Live Activity, Watch;
- Watch icon;
- HealthKit;
- WKBackgroundModes workout-processing;
- companion;
- Sleep v3 compatibility;
- Progress Photos preserved;
- no DEXA writeback.

TestFlight-first remote workflow.
No tether requirement.

Before TestFlight execute:
if release tooling requires explicit upload authorization, publish the exact build/SHA and request it. Do not work around.

Wait for VALID.

REPORTING

Because this is a takeover, publish an early takeover checkpoint once:
- local Claude worktree state is inventoried;
- exact Native/Server continuation authorities are known;
- any recoverable local Cooldown work is preserved.

Then follow mandatory GH protocol at every stop.

Final report must include:
- Native SHA;
- Server SHA/deployment;
- D3 mutation ledger;
- tests/reviews;
- Build 83 TestFlight delivery/VALID;
- physical acceptance checklist;
- DEXA HOLD;
- Sleep unchanged.

END TASK.

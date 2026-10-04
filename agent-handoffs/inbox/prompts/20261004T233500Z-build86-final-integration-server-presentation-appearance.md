PhysiqueOS Build 86 final integration — Server workout presentation correction + global appearance + release gates

TASK TYPE

Continue in the EXISTING Claude Remote Control chat that produced the Build 86 Watch/HealthKit candidate.
Use High reasoning.
Do not create a new Claude chat.

Founder has approved proceeding.

CURRENT AUTHORITIES

Claude Build 86 candidate:
- branch claude/native-watch-healthkit-build86-20261004
- candidate head 4f78fce663fb16c3cc6930b3b8e576a328defcbe
- report agent-handoffs/reports/20261004T232105Z-build86-watch-healthkit-candidate.md
- main report commit 1fd9bfa4aaed1eb64ca1211871e1f96e38ab39d8

Codex A global appearance implementation:
- branch codex/global-appearance-infrastructure-20261004
- implementation commits 3ceb9a803ffdde99a87e720b22f8c2b642644823 then d5359e33845cba20a212dade24c25e94f02aee6e
- report agent-handoffs/reports/20261004T224239Z-global-appearance-infrastructure.md
- main report commit 7ca8517b860ce39f70808e5ccb534b329c9c73a9

Founder accepted the appearance infrastructure direction/colors and understands the representative screenshots retain old/current geometry. Do not reinterpret those screenshots as final redesign acceptance; all locked redesign geometry remains separate implementation work.

GOALS

1. Fix the newly discovered Server workout-presentation defect.
2. Preserve today's pending workout-match decision until the Founder acts after the fix.
3. Integrate the global appearance implementation onto the Build 86 Native candidate.
4. Re-run combined acceptance gates.
5. Prepare the final Build 86 release candidate for Founder approval before TestFlight upload.

PART A — SERVER PRESENTATION DEFECT

Reverify current Server authority before editing.

Defect:
An unconfirmed HealthKit strength candidate can replace the structured Logger session's displayed start/end/duration/calories with the candidate HealthKit workout's values. A Founder-rejected / No match candidate may also continue affecting presentation.

Required behavior:
- pending/possible candidate: structured Logger session retains its own canonical structured start/end/duration presentation;
- Founder rejected / No match / unlinked candidate: structured Logger session retains its own canonical presentation;
- confirmed link: presentation may use the confirmed HealthKit telemetry according to the existing intended confirmed-link contract;
- no underlying workout/session record mutation merely to change presentation;
- no change to sets/exercises/structured workout ownership;
- no widening of matching/trust policy.

Audit all Server presentation consumers identified in the Build 86 report:
HealthKitWorkoutPresentationService;
ProgressReportingService;
TrainingNavigationReadService;
LoggedTodayService;
and any shared helper they use.

Implement the correction at the narrowest authoritative layer so all consumers agree.

Add deterministic tests for:
- pending candidate;
- possible_match candidate;
- confirmed link;
- Founder No match/rejected/unlinked;
- no candidate;
- canonical Logger window retained unless confirmation exists;
- confirmed telemetry presentation remains correct;
- no record mutation.

PART B — TODAY'S PENDING REVIEW

Today's real item:
Apple Traditional Strength Training 1:28 PM–1:48 PM
Possible Logger session 1 Traditional Strength Training 12:31 PM–1:47 PM
55% possible match / Time and telemetry.

The Founder has NOT acted on the pending review yet and has been instructed to leave it pending until this correction is deployed.

Do not mutate, auto-confirm, reject, dismiss or otherwise resolve this production review.

After the Server fix is deployed and verified, explicitly state the recommended Founder action for this item.

Expected recommendation, if source behavior confirms the intended contract:
Use Logger session 1, because it is the same physical strength workout and the Logger remains the canonical structured record while the confirmed Apple workout supplies telemetry. The confirmed association must not replace structured sets/exercises or create a duplicate strength session.

If the corrected confirmed-link presentation contract would still undesirably replace the Logger's canonical 12:31–1:47 time window with the truncated 1:28–1:48 Apple window, STOP and surface that product decision before telling the Founder to confirm. Do not assume.

PART C — SERVER DEPLOYMENT

This Server defect must be fixed prospectively before the Founder resolves today's pending review.

Follow existing production deployment authority and safety process.
Run relevant Server tests.
Deploy only the bounded Server presentation correction if all gates pass.
Verify /live and /ready and exact deployed authority.
Perform bounded read-only verification if appropriate.

No manual production record edits.
No mutation of today's pending review.

If production deployment requires an authorization step unavailable in the current environment, stop and report exactly what remains.

PART D — GLOBAL APPEARANCE INTEGRATION

Use Claude Build 86 head as the integration base.

Integrate Codex A appearance commits in the documented order:
3ceb9a803ffdde99a87e720b22f8c2b642644823
d5359e33845cba20a212dade24c25e94f02aee6e

Reverify no concurrent authority superseded them.

Preserve:
- Watch/HealthKit Build 86 fixes;
- Foam Rolling pilot;
- build number 86;
- System/Dark/Mineral Light architecture;
- You -> Settings -> Appearance;
- WidgetKit appearance behavior;
- Live Activity behavior;
- Watch appearance independence.

Resolve any integration conflict semantically, never by dropping one lane.

Regenerate the project using the canonical generator after integration and prove regeneration is byte-identical or explain any intentional delta.

PART E — COMBINED TESTS

Run:
- Server tests covering presentation/link state;
- Watch unit suite;
- focused iOS Watch/Training/HealthKit/Priority/Foam tests;
- appearance unit/UI tests;
- Foam Rolling UI tests;
- representative appearance UI tests;
- full relevant Native unit suite;
- Watch UI suite;
- Release generic iOS compile including Watch, Live Activity and widget graph.

Known pre-existing failures from isolated lanes must be reverified, not silently ignored:
- PeptideSupportEditorViewModelTests clock-sensitive sandbox fixture;
- WatchWorkoutNavigationUITests DEBUG fixture final-set Not Yet case.

Do not expand into unrelated product fixes unless integration actually changes their behavior. Clearly distinguish pre-existing from introduced failures.

PART F — BUILD 86 FINAL CANDIDATE

Keep build number 86 unless the release tooling requires a different number because 86 was uploaded elsewhere. Reverify last uploaded remains 85.

Do NOT upload TestFlight yet.

Prepare final candidate authority and report:
- Native combined head;
- exact Server deployed head;
- integrated commits;
- Server correction behavior;
- today's pending review recommendation and when Founder should act;
- Watch HealthKit behavior;
- Watch latency behavior;
- Foam Rolling status;
- appearance behavior;
- test results;
- Release compile;
- remaining physical-device acceptance checks;
- exact TestFlight upload command/workflow for later authorization.

PART G — PHYSICAL ACCEPTANCE

Retain the Build 86 physical-device checklist:
- normal phone-started strength -> Watch auto HealthKit exactly once;
- HR/Active/Total calories populate;
- truthful Health status;
- Complete Set at arm's length and 10–15 ft with wrist down/up;
- phone-originated set changes;
- pause/resume;
- finish exactly one Health workout;
- relaunch Watch mid-workout no duplicate;
- Foam Rolling detail/actions/setup route;
- System/Dark/Mineral Light switching/persistence;
- representative light-mode forms/sheets;
- small/large widgets;
- Live Activity;
- Watch remains independent of iPhone appearance preference.

PART H — LEDGER

Update the workout-presentation defect only if the Server correction is actually deployed/verified.
Keep Watch defects release-gated until physical acceptance.
Keep appearance release-gated until physical acceptance.
Do not close unrelated redesign implementation deltas.

OUTPUT

Publish a concise final Build 86 integration report and normal latest pointers.
No TestFlight upload.
No manual production data mutation.

STOP with the combined Build 86 candidate ready for Founder approval, and tell ChatGPT/Founder whether today's pending workout match can now safely be confirmed with Use Logger session 1.

END TASK.
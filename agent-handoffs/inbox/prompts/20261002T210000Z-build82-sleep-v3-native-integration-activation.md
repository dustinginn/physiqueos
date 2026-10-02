Build 82 Sleep v3 compatibility integration + guarded prospective activation

TASK TYPE

Claude Native integration/test/install followed by Server activation ONLY after compatibility gates pass.

No new product scope.
No historical Sleep rewrite.
No strategic Sleep.
No Recovery wiring.
No TestFlight upload yet unless separately authorized.

READ FIRST

Watch Build 82 checkpoint:
agent-handoffs/reports/20261002T173031Z-watch-v1-cancel-workout-parity-physical-checkpoint.md

Sleep v3:
agent-handoffs/reports/20261002T201500Z-healthkit-sleep-canon-v3-copy-coherence.md

Cleanup:
agent-handoffs/reports/20261002T202500Z-shared-mac-safe-storage-cleanup-before-sleep-native.md

Backlog:
agent-handoffs/backlog/PHYSIQUEOS_PRODUCT_BACKLOG.md

GH protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

AUTHORITIES

Build 82 Watch candidate:
a173f27b4a9ab208021a1f3cd7febc7402cf3b42
branch codex/apple-watch-workout-v1-phase1a-overnight

Sleep Native compatibility:
3ed3eae7
branch claude/sleep-canon-v3-native-accept-20261002

Shipping Native remains Build 81:
6a0932517cbd8de165bf25c7637a2d2d6fea03dc

Production Server:
d0ff65965233fa44e108387f01b649a2bdb476df
sleep-canon-v3 deployed dormant.

Free disk after cleanup:
21.33 GiB.
Recheck before heavy steps.

FOUNDER DECISION

Accept the documented rare out-of-order Oura revision ambiguity as a known residual limitation because:
- normal-order fuzz was 0 splices / 0 coverage loss across 7,500 nights;
- the adversarial case was 2/1,500;
- ambiguity is explicitly surfaced;
- v3 is not worse than v2 when reliable revision identity is unavailable.

Record this acceptance in backlog/report. Do not hide ambiguity telemetry.

A. INTEGRATE NATIVE PATCH

Integrate exact Sleep Native candidate 3ed3eae7 into exact Build 82 Watch candidate a173f27b.

The intended Native semantic change is tiny:
Recovery Sleep read model treats BOTH:
- sleep-canon-v2
- sleep-canon-v3
as stage-capable canonical algorithms.

Do not:
- alias v3 to v2;
- rewrite provenance labels;
- accept arbitrary future algorithm versions;
- change stage values;
- change Sleep strategic eligibility;
- alter Watch behavior.

Freshly review the actual diff and resolve only integration-required changes.

B. BUILD NUMBER / AUTHORITY

Build 82 is currently a development physical candidate, not TestFlight shipping authority.

Preserve version/build 1.0 (82) for this integrated physical candidate unless release tooling requires otherwise.

Do not create Build 83 merely for local integration.

Reverify latest uploaded Native remains Build 81.

C. NATIVE TESTS

Run:
- RecoverySleepReadModelTests including testSleepCanonV3NightsShowStagesLikeV2;
- Sleep Evidence/read-model tests;
- HealthKit Sleep decoding;
- strategic quarantine tests available Native-side;
- Watch reducer/cancel terminal tests;
- WatchConnectivity callback regression;
- TrainingSessionAuthority/Live Activity focused regression;
- Home Widget focused regression;
- Progress Photos cadence focused regression.

Then run an appropriately broad/full Native suite if disk permits.

Known baseline peptide fixture drift may remain documented; no new deterministic failure accepted.

D. GENERATOR / RELEASE VERIFY

Run generator twice:
- byte-identical output;
- Build 82 parity across iPhone/Widget/Watch;
- Watch AppIcon intact;
- HealthKit/App Group entitlements unchanged.

Run release verifier.

E. SIGNED PHYSICAL CANDIDATE

If tests green and disk >=15 GiB:
- produce a fresh signed Build 82 development archive/candidate from the integrated source;
- inspect signed products;
- install on Founder iPhone + Watch if connected;
- if devices are not connected, retain signed candidate and report exact install step.

Verify:
- iPhone Build 82;
- Widget/Live Activity Build 82;
- Watch Build 82;
- Watch icon;
- Watch HealthKit entitlement;
- iPhone HealthKit/App Group;
- Widget HealthKit-free;
- companion relationship.

Do not manipulate a Founder workout.

F. NATIVE PHYSICAL COMPATIBILITY GATE

Before activating Server v3, establish that the compatible Native is actually on the Founder's iPhone.

If physical install succeeds:
- launch PhysiqueOS;
- do not automate Sleep navigation if that would require UI interaction;
- installed-build readback is sufficient to establish code availability;
- Founder may visually verify Sleep Evidence after activation.

If compatible Native is NOT installed:
STOP before Server activation.
Do not make current Build 81 lose stages.

G. SERVER ACTIVATION PRECHECK

Only after compatible Native installed.

Reverify:
- production exact d0ff6596 or compatible descendant;
- live/ready;
- v3 policy absent/dormant;
- strategic Sleep OFF;
- D0 2026-10-02;
- historical counts/digests unchanged.

Use approved least-privilege production path.

Run fresh guarded v3 activation DRY RUN.

Expected bounded target:
ordinary prospective Sleep days >= 2026-10-02.
Do not assume only Oct 2 now; discover exact count because another natural night may have arrived.

Hard gates:
- no day before D0;
- no historical collection;
- no validation corpus mutation;
- no strategic artifacts;
- count <= explicit max-days;
- every target has stored ordinary canonical day;
- dry-run expected facts captured;
- no drift.

If unexpected target/scope:
STOP.

H. APPLY V3 ACTIVATION

If dry run clean:
- apply with explicit authorization reference to this Founder decision/task;
- exact expected dry-run facts;
- bounded max-days equal to discovered expected target count (or minimally safe bound).

Operation:
- enable canonical algorithm policy v3 effective 2026-10-02;
- recanonicalize ONLY ordinary prospective days >= D0;
- same canonical day ids;
- preserve provenance;
- strategicEligible false;
- validation_only/quarantine unchanged.

No historical writes.

I. POST-ACTIVATION VERIFY

For every affected prospective day:
- algorithmVersion sleep-canon-v3;
- stored equals fresh v3 recompute;
- coherent-copy diagnostics;
- Evidence stageStatus available;
- stages/timeline served;
- strategicEligible false.

For Oct 2 specifically:
expect corrected coherent revision approximately:
- asleep 455 min;
- deep 98.5;
- REM 117.5;
- core 239;
- awake 25;
- 73 segments;
using sanitized rounded comparison only.

Verify:
- 87 historical days unchanged;
- 8,601 historical samples unchanged;
- validation corpus unchanged;
- strategic artifact mutation 0;
- Goal Confidence unchanged by Sleep;
- Strategy Confidence unchanged;
- no Narrative/Recommendation/Recovery publication.

J. CURRENT CANARY STATUS

If activation succeeds and no new correctness defect:
change canary from FAIL -> HOLD.

Do NOT call PASS.

Remaining natural gates:
- at least 2, preferably 3 natural v3 nights;
- ideally a natural duplicate-revision night;
- one closed-app >=75-minute background-delivery proof;
- Oct 4 Weekly scan for zero Sleep/Recovery strategic leakage;
- Oct 7 Midweek if needed;
- 14 reliable prospective nights before Recovery baseline can produce meaningful non-insufficient status.

If a new night arrived before activation:
include it in the bounded prospective verification and explain whether it was originally v2 then recanonicalized v3.

K. PHYSICAL FOUNDER CHECKLIST

After activation give minimal check:
- open Sleep Evidence;
- Oct 2 stages should display normally, not Being recalculated;
- verify Deep/REM/Core/Awake are present;
- no need to compare exact numbers unless Founder wants;
- current Watch Build 82 behavior unchanged.

L. TESTFLIGHT

DO NOT upload Build 82 in this task.

Reason:
Watch V1 still has broader physical acceptance gates.
This task only creates/installs the integrated development candidate and activates compatible Sleep v3.

M. BACKLOG

Update:
- residual ambiguity accepted;
- Native v3 compatibility integrated into Build 82 physical candidate;
- v3 activation status;
- canary HOLD if successful;
- remaining natural gates;
- Watch acceptance remains separate.

N. REPORT

Publish:
agent-handoffs/reports/<timestamp>-build82-sleep-v3-native-integration-activation.md

Include:
- exact integrated Native SHA;
- integration diff;
- tests;
- signed/install proof;
- dry-run target set;
- activation mutation ledger;
- affected prospective days;
- historical mutation 0;
- strategic mutation 0;
- Evidence result;
- canary status;
- next gates.

MANDATORY GH PROTOCOL

Before every stop:
- push implementation authority;
- publish checkpoint/final report to origin/main;
- update latest pointers;
- fetch/reverify main;
- re-read exact report;
- provide exact main report SHA.

END TASK.

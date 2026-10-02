Apple Watch V1 physical-acceptance patch — add Cancel Workout parity

Context:
Physical Founder acceptance found a real lifecycle gap in the current Watch Phase 1A candidate.

Current Watch implementation authority from latest checkpoint:
831f74d0482906e34b5fcbb306cff3a4e7af2742
Reverify current branch/main before work.

Founder observed:
After canceling/stopping the test workflow from the phone / while the Watch workout was in a state requiring Resume, the Watch had no way to Cancel or Finish without first resuming.

Founder requirement:
The Watch must have the same ability to CANCEL a workout as the phone.

This is V1-required lifecycle parity.

Semantics:
- Cancel Workout is DISTINCT from Finish Workout.
- Finish commits the performed projection (completed sets only) through the normal durable workout path.
- Cancel abandons/discards the structured workout according to the existing canonical phone Cancel semantics and MUST NOT turn completed/planned sets into a finished training session.
- Watch HealthKit workout must be ended/discarded/saved according to the correct product/canonical cancellation semantics; audit the current phone + HealthKit behavior rather than guessing.
- Phone Live Activity must terminate/reconcile.
- Watch must clear/reconcile to idle/prepared state.
- no duplicate structured or HealthKit event.
- Cancel must be available while ACTIVE and while PAUSED.
- Founder must NOT need to Resume merely to Cancel.
- Cancel requires confirmation because it is destructive.
- copy should clearly distinguish Cancel from Finish.

Audit first:
1. exact existing phone Cancel Workout semantics;
2. TrainingSessionAuthority cancel/end APIs;
3. whether any completed sets/evidence survive phone Cancel;
4. current HealthKit workout behavior on cancel;
5. Live Activity lifecycle;
6. current Watch command enum/router/control state;
7. the exact state created by the Founder's physical sequence so this is not merely a UI button hiding a deeper projection-state bug.

Implement:
- versioned Watch cancel command if absent;
- phone command-router canonical cancellation;
- idempotency/mutation id/revision handling;
- active + paused availability;
- confirmation UI on Watch controls page;
- correct HealthKit termination behavior;
- Live Activity termination;
- authoritative terminal projection/idle recovery;
- relaunch/retry safety.

Also audit the specific physical behavior:
If the phone cancels an active workout first, the Watch must receive/reconcile that terminal state automatically. It must not remain stranded showing Resume. If that is a separate projection/lifecycle bug, fix it too.

Tests:
- Watch Cancel active;
- Watch Cancel paused;
- confirmation dismissed;
- duplicate Cancel;
- stale Cancel;
- phone Cancel propagates to Watch;
- Watch Cancel propagates to phone;
- Live Activity ends;
- structured session not committed;
- no performed Training evidence created by Cancel;
- no PR/volume/history from canceled workout;
- HealthKit behavior exactly as product policy requires;
- app/Watch relaunch after Cancel;
- disconnect/reconnect around Cancel;
- Finish behavior unchanged;
- early Finish behavior unchanged;
- Pause/Resume unchanged.

Physical acceptance:
Build/install the patched development candidate on Founder iPhone + Watch if signing remains available.
Do not upload TestFlight yet.
Do not start/cancel a Founder workout automatically.
Publish a short physical checklist:
1. active -> controls -> Cancel -> confirm;
2. paused -> controls -> Cancel -> confirm without Resume;
3. phone Cancel -> Watch clears automatically.

Preserve all accepted Watch UI; do not redesign previous-set presentation or other surfaces.

Follow mandatory GH protocol. Before stopping, push implementation authority, publish report to origin/main, update latest pointers, fetch/reverify main, re-read exact report, and provide exact main report SHA.


PHYSICAL EVIDENCE ADDENDUM

Founder supplied physical Watch photos after canceling the active workout from the iPhone.

Observed stranded state:
- execution page still shows PAUSED;
- previous/current Bench Press rows remain;
- current set remains 2/4 with Load 135 / Reps 12;
- rest stopwatch remains at 4:23;
- lower status reports "Not recorded · sessionUnavailable";
- metrics page still renders elapsed 5:45, HR 68 BPM, active 21 CAL, total 30 CAL.

This is authoritative physical evidence of a terminal-projection reconciliation bug.

Required correction:
- phone Cancel is an authoritative terminal event;
- Watch must not retain/render the stale execution or metrics projection after cancellation;
- terminate/reconcile Watch HealthKit session according to canonical Cancel policy;
- clear pending command/rest/pause/metrics state;
- dismiss execution/metrics/control pages;
- return to idle or current prepared-plan state;
- if transport is temporarily unavailable, do not misleadingly render the canceled session as paused/active once the phone has authoritatively reported sessionUnavailable/terminal cancellation;
- add exact regression reproducing this state transition.

APP ICON — V1 RELEASE REQUIREMENT

Founder also observed the Watch app needs a proper app icon.

Audit the existing shipping PhysiqueOS iOS app icon/brand asset and use it as source of truth.

Implement the correct watchOS AppIcon asset/catalog entries required by the actual Watch target and current Xcode/watchOS SDK.

Requirements:
- unmistakably PhysiqueOS;
- preserve existing brand identity; do not invent a separate Apple-Watch-specific logo;
- correct watchOS icon slots/sizes/scales/appearance requirements;
- generator/project integration deterministic;
- no stretched/raster-degraded source;
- no Apple Workout visual identity;
- validate asset catalog compile;
- verify installed physical Watch app shows the icon in app launcher/list after reinstall;
- include icon in signed archive inspection before eventual release.

If the existing iOS source icon cannot legally/technically generate a high-quality Watch icon without a new source asset, stop and report rather than fabricating one.

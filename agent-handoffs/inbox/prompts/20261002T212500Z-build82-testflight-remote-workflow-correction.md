Workflow correction — stop tether polling and deliver integrated Build 82 through TestFlight

This supersedes the physical-tether delivery portion of:
agent-handoffs/inbox/prompts/20261002T210000Z-build82-sleep-v3-native-integration-activation.md

Founder is remote from the Mac. Routine PhysiqueOS delivery MUST return to the established workflow:

Remote Claude/Codex -> Xcode archive/upload -> TestFlight VALID -> Founder installs remotely -> physical acceptance.

Direct tethered iPhone/Watch installation is reserved for exceptional bring-up/debugging and must not be required for routine release delivery.

IMMEDIATE ACTION

1. Stop the current 30-minute polling/wait for the Founder's iPhone to become locally reachable.
2. Do not require USB, same-Wi-Fi, local device tunnel, or physical Mac access.
3. Keep sleep-canon-v3 dormant. Do NOT activate or recanonicalize prospective Sleep yet.
4. Preserve all completed integrated Build 82 source/test/signing work.

CURRENT CHECKPOINT

The current Claude session reports a main checkpoint at 8009496a. Fetch/re-read current origin/main and the checkpoint report before continuing.

Reverify:
- exact integrated Native candidate SHA;
- Build 82 number;
- latest uploaded TestFlight build remains Build 81;
- Server d0ff6596 remains v3 dormant;
- all tests/reviews already completed for this integrated candidate;
- disk floor.

TESTFLIGHT DELIVERY

If the integrated candidate is clean and Build 81 remains latest uploaded:

1. Produce/reuse a FRESH release archive from the exact integrated Build 82 source appropriate for TestFlight distribution.
2. Re-run release verifier and archive inspection.
3. Verify:
   - iPhone 1.0 (82);
   - Live Activity/Home Widget 1.0 (82);
   - Watch app 1.0 (82);
   - Watch companion relationship;
   - Watch HealthKit entitlement and workout-processing;
   - Watch AppIcon;
   - iPhone HealthKit/App Group unchanged;
   - Widget extension remains HealthKit-free;
   - Sleep Native recognizes v2 + v3 as stage-capable;
   - Progress Photos Build 81 work preserved;
   - Watch Cancel/terminal fixes preserved.
4. Use the established guarded Xcode/App Store Connect release tooling.
5. Dry run first.
6. Upload Build 82.
7. Wait for TestFlight/App Store processing status VALID.
8. Never browser-login to Apple Developer/App Store Connect.
9. If Xcode/App Store authentication genuinely requires Founder interaction, publish the exact blocker rather than falling back to tethering.

IMPORTANT WATCH DISTRIBUTION CHECK

This is the first TestFlight candidate containing the paired Watch app.

Verify the uploaded archive/package actually includes the Watch companion and passes App Store validation.

Do not claim the Watch app is remotely installed until Founder installs Build 82 from TestFlight and confirms Watch installation/availability.

SLEEP ACTIVATION GATE — UPDATED

Do NOT require local-device readback.

The compatibility gate becomes:

A. Build 82 reaches TestFlight VALID.
B. Founder installs Build 82 remotely on iPhone (and Watch companion as offered/installed by TestFlight/Watch app).
C. Founder confirms installation.

ONLY AFTER Founder confirms remote Build 82 installation may Sleep v3 activation proceed.

Until then:
- v3 policy stays dormant;
- ordinary Sleep ingestion stays v2;
- no Oct 2+ correction.

When Founder confirms installation, resume the guarded Server activation steps from the original prompt:
- fresh production authority verify;
- fresh bounded dry-run;
- discover exact prospective day set >= 2026-10-02;
- apply only if scope is safe;
- historical mutation 0;
- strategic mutation 0;
- verify Evidence stages;
- canary FAIL -> HOLD if successful.

DO NOT ACTIVATE merely because TestFlight is VALID. Founder installation confirmation is required.

DURABLE WORKFLOW RULE

Update the backlog/report to record:
- normal Native distribution is TestFlight-first for remote Founder workflow;
- tethered installs are exceptional bring-up/debugging only;
- future prompts must not make local Mac/device reachability a routine release gate.

REPORTING

Publish an updated checkpoint/final report to origin/main with:
- exact integrated candidate;
- TestFlight archive/delivery id;
- VALID status;
- Watch inclusion/validation;
- Sleep v3 remains dormant pending Founder remote install;
- next action is Founder installs Build 82 remotely and confirms.

Follow mandatory GH protocol before stopping.

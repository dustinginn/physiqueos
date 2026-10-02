# Apple Watch Workout V1 Phase 1A — signed archive and install checkpoint

Generated: 2026-10-02T15:26:26Z
Implementation branch: `codex/apple-watch-workout-v1-phase1a-overnight`
Implementation authority: `1b8838a40613fead6d5f8d62f1d9831cb977f83f`
Shipping Native reverified: Build 81, `6a0932517cbd8de165bf25c7637a2d2d6fea03dc`
Production Server unchanged: `4ffde0f5faf1832decfbc09d822088aeba0dca89`, deployment `faaf66bd-930f-46a2-9b8e-77e604c23a86`

## Outcome

The previous Apple signing blocker is resolved. Xcode automatic signing, using the Founder-authenticated account for Team `33GMTRM6G9`, created/refreshed an explicit HealthKit-capable Watch development profile, produced a fully signed Release archive, and installed the companion iPhone candidate on the Founder iPhone.

The strongest safe stopping point is now the physical Apple Watch Developer Mode gate. Direct Watch inspection/install is refused by watchOS because Developer Mode is disabled. The iPhone launch check is additionally waiting for the phone to be unlocked. No HealthKit consent was automated and no workout was started.

No source changed. The feature branch HEAD and `origin/codex/apple-watch-workout-v1-phase1a-overnight` remain exactly `1b8838a40613fead6d5f8d62f1d9831cb977f83f`. The only local dirt remains the previously documented unrelated Home Widget screenshot PNG set; it was not touched or included.

## Authority and Native revalidation

- `origin/main` was fetched immediately before release work and still identified Build 81 `6a0932517cbd8de165bf25c7637a2d2d6fea03dc` as the latest VALID Native authority. No newer shipping work required integration.
- The project generator ran twice and remained byte-identical: `18f619f9a57313892d4ee06d2f639fd5b8d203f1cba8009d8ce9bddba7886020`.
- No incidental Xcode project rewrite was committed.
- Prior Watch-task DerivedData/module caches only were removed; they are reproducible. Disk remained above the 15 GiB hard floor (approximately 18 GiB free after archive).

## Signed archive

Archive: `/private/tmp/PhysiqueOS-Phase1A.xcarchive`

Archive metadata:

- scheme/product: `PhysiqueOS` / `PhysiqueOS.app`;
- version/build: `1.0` / `81`;
- archive architecture: iPhone `arm64`;
- signing identity: `Apple Development: DUSTIN JOSEPH GINN (WHH2L8AXLW)`;
- team: `33GMTRM6G9`;
- products present: iPhone app, `PhysiqueOSLiveActivity.appex`, and embedded `Watch/PhysiqueOSWatch.app`.

Every product passes strict code-sign verification and the containing iPhone app passes recursive `codesign --verify --deep --strict`.

### iPhone app

- bundle: `com.physiqueos.native.dev`;
- version/build: `1.0` / `81`;
- explicit profile: `iOS Team Provisioning Profile: com.physiqueos.native.dev`;
- profile UUID: `00df369f-84ee-4ede-8644-800c8aa5024e`;
- signed entitlements unchanged from Build 81: HealthKit, HealthKit background delivery, and `group.com.physiqueos.native.dev.shared`.

### Live Activity / Home Widget extension

- bundle: `com.physiqueos.native.dev.WorkoutActivity`;
- version/build: `1.0` / `81`;
- explicit profile: `iOS Team Provisioning Profile: com.physiqueos.native.dev.WorkoutActivity`;
- profile UUID: `2a695b81-95ab-4261-8e7b-5bf8283e153a`;
- signed entitlement: existing shared App Group only;
- HealthKit and HealthKit background-delivery entitlements are absent, as required.

### Watch app

- bundle: `com.physiqueos.native.dev.watchkitapp`;
- version/build: `1.0` / `81`;
- minimum watchOS: 11.0;
- companion: `com.physiqueos.native.dev`;
- `WKApplication = true`; `WKRunsIndependentlyOfCompanionApp = false`;
- device binary contains `arm64` and `arm64_32` slices;
- new explicit profile: `iOS Team Provisioning Profile: com.physiqueos.native.dev.watchkitapp`;
- profile UUID: `610bddf1-25f9-4a20-94b4-e759ffc2da8f`;
- signed entitlement: `com.apple.developer.healthkit = true`;
- archived `Info.plist` contains `UIBackgroundModes = [workout-processing]` and both required Health usage descriptions.

Archived binary SHA-256 values:

- iPhone: `fe588f6a117a8f2b711ad26237b6162074456814c14471733027adce747a069e`;
- extension: `18340d335fb9d8efcfe85992d32ce71d07b3eef8a0cb9816963e6caf5165c6d5`;
- Watch: `64b17b99be98debeaec42c41cf0a3213498e7ae0c9fd96da90b9087d4eb848ee`.

## Physical install status

Paired devices discovered through Xcode tooling:

- Founder iPhone 17 Pro, iOS 27.0.1, UDID `00008150-000970321420401C`;
- Founder Apple Watch Ultra, watchOS 27.0, UDID `00008310-0008D5C03C40E01E`.

The signed candidate installed successfully on the iPhone using the same `com.physiqueos.native.dev` identity and Build 81 version. Device readback confirms it is installed as a developer app.

Direct Watch inspection/install stopped at the real device policy boundary:

`Installing cryptex com.apple.dt.developer-cryptex is disallowed because developer mode is not enabled.`

The non-destructive iPhone launch command also stopped safely because the phone was locked. No attempt was made to unlock devices, enable Developer Mode, accept Health permissions, launch the Watch app through UI automation, or start a workout.

## Trust and release decision

- Production exact-correlation bundle allowlist remains dormant.
- No Server deployment occurred.
- No TestFlight/App Store upload occurred.
- Physical Watch authorization, workout behavior, recovery, correlation and battery acceptance remain hard gates.
- Build 82 parity and a fresh archive/review remain required before any eventual upload.

## Shortest Founder action to continue

1. Unlock the paired iPhone and leave it connected to the Mac.
2. On Apple Watch, open **Settings > Privacy & Security > Developer Mode**, turn it on, allow the Watch to restart, then confirm Developer Mode after restart.
3. Leave the Watch unlocked, on wrist or charging, and connected to the paired iPhone/Mac; then tell Codex to continue.

Do not start a workout yet. Health authorization will remain a separate on-device tap gate after the Watch app is installed and launched.

No secrets, credentials, production exports or Founder evidence are included in this report.

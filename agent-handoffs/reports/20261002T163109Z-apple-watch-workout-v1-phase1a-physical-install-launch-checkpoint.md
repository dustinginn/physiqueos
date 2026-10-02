# Apple Watch Workout V1 Phase 1A — physical install and launch checkpoint

Generated: 2026-10-02T16:31:09Z  
Implementation branch: `codex/apple-watch-workout-v1-phase1a-overnight`  
Starting implementation authority: `1b8838a40613fead6d5f8d62f1d9831cb977f83f`  
Current implementation authority: `831f74d0482906e34b5fcbb306cff3a4e7af2742`  
Shipping Native reverified: Build 81, `6a0932517cbd8de165bf25c7637a2d2d6fea03dc`  
Production Server unchanged: `4ffde0f5faf1832decfbc09d822088aeba0dca89`, deployment `faaf66bd-930f-46a2-9b8e-77e604c23a86`

## Outcome

The signed PhysiqueOS Watch development candidate is installed and launches successfully on the paired Founder Apple Watch Ultra. Device readback verifies bundle `com.physiqueos.native.dev.watchkitapp`, version/build `1.0 (81)`, companion `com.physiqueos.native.dev`, connected/paired state, and Developer Mode enabled.

The first physical launch exposed a real Swift actor-isolation crash in the WatchConnectivity reply callback. The crash was diagnosed from physical Watch crash logs, symbolicated to `WatchWorkoutStore.send(_:)`, fixed with an explicit Sendable callback bridge that hops replies/failures onto `MainActor`, covered by off-main regression tests, rebuilt, re-signed, reinstalled, and re-proven on the physical Watch. The fixed app remains alive after its automatic phone refresh and no new crash log is created.

The Watch now shows the PhysiqueOS reachable empty state, **Prepare a workout on iPhone**, rather than **Phone unavailable**. This proves the paired phone/Watch session activated and the automatic interactive refresh completed without the previous callback trap. No workout was prepared or started during this gate, no Health authorization was automated, and no HealthKit workout or duplicate structured session was created.

Production exact-correlation trust remains dormant. No Server deployment, TestFlight upload, Health consent, real workout, or production mutation occurred.

## Provisioning correction

The archive from the prior checkpoint used Watch profile UUID `610bddf1-25f9-4a20-94b4-e759ffc2da8f`. Physical installation correctly failed integrity validation because that profile contained only the paired iPhone UDID and did not authorize the Watch UDID.

With the physical Watch selected as the Xcode destination, authenticated automatic signing registered the Watch and generated replacement profile UUID `f4ef7d4e-c707-4127-9741-b2d7d2f9c6c8`, authorizing both:

- Founder Watch: `00008310-0008D5C03C40E01E`;
- Founder iPhone: `00008150-000970321420401C`.

The replacement profile retains the explicit app identifier and required HealthKit capability. The fixed Release Watch product passes strict signature verification and installs normally. The old full archive remains useful as prior inspection evidence but is not release authority for the new crash-fix commit; a fresh full archive is required before any upload.

## Physical identity and pairing proof

- device: Dustin’s Apple Watch Ultra, physical `Watch7,12`, watchOS `27.0.1 (24R365)`;
- state: booted, connected, paired, Developer Mode enabled;
- Watch bundle: `com.physiqueos.native.dev.watchkitapp`;
- Watch version/build: `1.0 (81)`;
- installed as a removable developer app;
- companion identifier: `com.physiqueos.native.dev`;
- `WKRunsIndependentlyOfCompanionApp = false`;
- Watch background mode: `workout-processing`;
- signed Watch entitlement: `com.apple.developer.healthkit = true`;
- installed iPhone companion: `com.physiqueos.native.dev`, version/build `1.0 (81)`;
- fixed Watch binary SHA-256: `758d09df8f618a4ea1c29c702921024beaf83908135f0f41b1c1a056290f1e0a`.

## Runtime defect and correction

Two physical launch attempts created crash reports at 09:18:16 and 09:18:38 local time. Both were foreground `SIGTRAP`/`EXC_BREAKPOINT` failures on a WatchConnectivity utility queue. Symbolication resolved the app frame to the reply closure in `WatchWorkoutStore.send(_:)`.

Cause: Swift inferred MainActor isolation for closures formed inside the MainActor-isolated store, while WatchConnectivity invoked the reply callback on its own utility queue. Runtime actor checking correctly trapped before the acknowledgement could be delivered.

Correction at `831f74d0`:

- reply and failure callbacks are explicitly `@Sendable` non-actor entry points;
- each callback schedules its state mutation on `MainActor`;
- the exact command/ack, revision, idempotency and fail-closed semantics are unchanged;
- regression tests invoke both callbacks from `Task.detached` and prove delivery on the main actor.

## Validation

- authoritative project generator: exact SHA-256 remains `18f619f9a57313892d4ee06d2f639fd5b8d203f1cba8009d8ce9bddba7886020`;
- Watch simulator reducer/callback suite: **4/4 passed**;
- physical-target Release build: passed for both `arm64` and `arm64_32`;
- strict code-sign verification: passed;
- physical install: passed;
- installed metadata readback: bundle/version/build passed;
- phone launch: passed;
- Watch launch: passed;
- delayed process readback: `PhysiqueOSWatch` remained running;
- post-fix physical crash-log readback: no new crash report; only the two pre-fix reports remain;
- Watch UI readback: PhysiqueOS navy/purple **Prepare a workout on iPhone** state, proving reachable rather than unavailable;
- `git diff --check`: passed;
- implementation branch and origin both resolve to `831f74d0482906e34b5fcbb306cff3a4e7af2742`.

Fresh review found no change to structured authority, command identity, revision handling, HealthKit lifecycle, finish semantics, projection mapping, Live Activity parity or Server trust. The fix is confined to correct executor delivery for the existing WatchConnectivity callbacks.

## No-duplicate-authority proof at this gate

Launching the Watch app only activates WCSession, consumes the phone projection if present, and attempts recovery of an already-existing correlated HealthKit session. The phone remains the only `TrainingSessionAuthority`. HealthKit start is reachable only after the phone accepts a `startPreparedWorkout` command for a phone-authored Ready-for-Watch draft.

At this checkpoint:

- there was no Ready-for-Watch draft;
- no Start Workout action was invoked;
- no structured session start command was sent;
- no Health authorization request was triggered;
- no HealthKit workout was created;
- no performed Training evidence was written.

## Exact Founder interaction gate

The app is intentionally stopped one step before Health authorization because reaching that sheet requires the Founder to start a prepared workout.

1. On iPhone, open PhysiqueOS Workout Logger, prepare the short physical acceptance workout, and tap **Ready for Watch**. Do not complete any set on the phone.
2. On Watch, open PhysiqueOS. Confirm the prepared workout appears, then tap **Start Workout** once.
3. On the Apple Health permission sheet, enable **Workouts**, **Heart Rate**, **Active Energy**, and **Basal Energy** if individual switches are shown; then tap the affirmative **Allow** / **Allow All** control presented by watchOS.
4. Stop there and tell Codex authorization is complete. Do not complete a set or finish the workout yet; the remaining acceptance sequence should be observed deliberately.

The next gate is physical start/Health authorization proof followed by the planned Complete Set, Pause/Resume, disconnect/reconnect, relaunch, early-finish, full-finish, exact-correlation and battery acceptance. The production allowlist stays empty until that proof is complete.

No secrets, credentials, production exports or Founder evidence are included in this report.

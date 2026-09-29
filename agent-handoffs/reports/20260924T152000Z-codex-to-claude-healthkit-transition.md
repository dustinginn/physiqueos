# Codex-to-Claude HealthKit transition authority

Generated: 2026-09-24T15:20:00Z

Task ID: `codex-to-claude-healthkit-transition-20260924`

## Authority and purpose

This is the comprehensive transition authority for Claude’s Founder-phone takeover. It supersedes the operational next-step fields of earlier HealthKit checkpoints while preserving their immutable audit facts.

Codex completed the requested second fresh-context adversarial review and is handing off without deploying, archiving, uploading, operating the Founder device, repairing September 23 Activity, changing policy/strategic eligibility, or beginning Cardio.

## Exact reviewed source candidates

### Native

- Exact final reviewed SHA: `19cbfa10740c0ff5d10e638b57883027349c4b31`
- Branch: `codex/healthkit-revision-recovery-native`
- Existing worktree: `/private/tmp/physiqueos-healthkit-revision-recovery-native`
- Origin ref: `origin/codex/healthkit-revision-recovery-native`
- Base / installed Build 57 source: `6cca05813ce26e3ddd8ff2dead9867bb4e7e3bb9`
- Review verdict: APPROVE; worktree clean and equal to origin.

This is the exact worktree from which the new Claude Code Remote Control conversation must continue. Do not substitute `native-production-read-foundation`, create another Native worktree, switch branches, or rebase this one.

### Server companion

- Exact reviewed Server candidate: `07ed8230be28c2bc4989e2167b028d0bf425c6fa`
- Branch: `codex/healthkit-current-day-review-server`
- Existing worktree: `/private/tmp/physiqueos-healthkit-current-day-review-server`
- Origin ref: `origin/codex/healthkit-current-day-review-server`
- Exact production base: `28ac1e4f51afdf3a30f2fb50fcb5c95148a2709d`
- Review verdict: APPROVE; worktree clean and equal to origin.

The Server worktree was necessarily created from exact current production lineage because the older HealthKit Server worktree was based on pre-Midweek production. No existing task worktree was switched or rebased.

## Current production and installed authority

Production remains unchanged by the reviewed candidate work:

- Production Server SHA: `28ac1e4f51afdf3a30f2fb50fcb5c95148a2709d`
- Active deployment: `e8c3bed3-20f6-4f5c-b34a-d27ab0881480`
- Runtime build: `physiqueos-28ac1e4f-20260924`
- Web and worker source/runtime stamps: exact `28ac1e4f...`
- Health: live HTTP 200; ready HTTP 200; 9/9 checks ready at the last authority verification
- Migration readiness: `PROVIDER_MIGRATION_000014_APPLIED`
- Production Server candidate `07ed8230...`: **not deployed**

Native release/device authority:

- App Store Connect Build 57 source: `6cca05813ce26e3ddd8ff2dead9867bb4e7e3bb9`
- Bundle/version/build: `com.physiqueos.native.dev`, `1.0 (57)`
- Apple build/import: VALID
- Delivery UUID: `82ebe97c-2c38-482f-8a9c-d0e0d7490e1e`
- Founder explicitly reported Build 57 installed on the iPhone 17 Pro.
- Final Native candidate `19cbfa10...`: **not archived, uploaded, or installed**
- Sole permitted simulator: iPhone 17 Pro `A8157897-95ED-4480-9150-6136652A6519`

## What the final reviewed candidates do

The Native candidate makes current Activity and current Nutrition the first independent daily lanes, before unchanged Workout and before historical daily work. Historical Activity and Nutrition use exact-day durable scopes across the unchanged 30-day range so one collided date cannot starve current data or later historical dates. Transient delivery is not reported as durable success; zero-valued returned aggregates remain valid present observations; calendar/time-zone rollover and coalescing remain bounded.

The paired Server/Native correction closes the production identity and apply-authority gaps:

- Server pair/refresh returns the authenticated Server-owned device ID.
- Native uses that Server identity for collision-recovery digest verification; local cursor identity remains separate.
- Server exposes a read-only, authenticated, hard-bound September 23 preflight using `principal.deviceId` and no caller-selected date.
- Future repair apply obtains the preflight with `.reload` and compares runtime, policy, canonical/source revisions, exact-device source count, history count, September 24 absence, and identity before any query or upload.
- Founder diagnostics merge all exact-day historical scopes.

Validation authority:

- Native focused: 277/277 passed.
- Native expanded HealthKit/auth/photo: 349/349 passed.
- Server critical: 89/89 passed.
- Reviewer direct Server rerun: 83/83 passed.
- Independent review: APPROVE with no findings.
- Full Server package-7: 543 passed; six unrelated private-fixture/date-sensitive failures were documented.

## September 23 production facts

These are the last bounded read-only production facts; no newer production read was performed during review.

### Activity

- Canonical ID: `healthkit_canonical_day_activity_2026-09-23`
- Canonical/source revision: 50 / 50
- Source observation count: 50
- Revision history count: 49
- Coverage: `partial_day`
- Last canonical update: `2026-09-23T18:35:26.307Z`
- Stable values digest: `d83f06dac0181cb0d46ffc6f388a09df4219ac28e6d40c7cf049d1905cc37ea7`
- Stored active calories: approximately 606.041
- Stored exercise minutes: 102
- Stored stand hours: 5
- Stored steps: approximately 6,429
- Status: stale/incomplete; not repaired

The bounded successful repair prediction remains exactly one new operational automatic Activity observation at source revision 51 and one update of the existing canonical day to canonical/source revision 51, growing history to 50 and source observations to 51. Values must come from a fresh exact-day Apple Health query on the Founder phone; they must never be guessed, copied, or inferred from workout calories.

### Nutrition

- Canonical/source revision: 5 / 5
- Source observation count: 5
- Revision history count: 4
- Coverage: `complete_day`
- Status: independently healthy; no repair indicated or authorized

### Strength / Logger

- Strength graduation verdict: GREEN for the reviewed architecture and the September 23 real production case.
- Canonical workout: `healthkit_canonical_workout_9e609fffe3d46943d0b5d5525a89c99c441f9efe`
- Relationship: confirmed version 2, confidence 95, basis `logger_session_window`
- Rule: `healthkit-strength-auto-confirm-v1`
- Logger session: `training|authoritative|training_logger_draft_E0E5F723-E306-4CC1-9D35-7F867514A406`
- One-to-one claims: held; no integrity violations
- Logger detail: unchanged at four exercises and sixteen sets
- Logger end time: still genuinely absent; no synthetic end was manufactured
- Activity presentation: exactly one linked workout, 321 workout calories, no duplicate Training workout
- Evidence eligibility: quarantined; strategically eligible false
- Global Workout `linkAutoConfirm`: false
- Remaining observation nuance: the last acceptance checkpoint still marked the Log-row provenance label (`Strength Training · Apple Health`) as pending explicit Founder observation. Do not reopen or alter the confirmed relationship merely for that presentation check.

## September 24 production facts and acceptance state

At the last bounded read-only audit boundary:

- September 24 Activity observations: 0
- September 24 Activity canonical days: 0; revision absent
- September 24 Nutrition observations: 0
- September 24 Nutrition canonical days: 0; revision absent
- Duplicate September 23–24 canonical days: 0
- September 24 Activity 409-free: no / not reached
- September 24 second revision advance: not tested

Build 57 proved recovery progression by consuming successive Server recovery floors from August 25 through August 28, but its oldest-first 30-day Activity batch could still starve the current day. The final Native candidate corrects that architecture but has not been released or accepted on the real phone. Treat the September 24 facts as last-observed evidence, not as a claim about current unseen device state.

## Policy and strategic invariants

- Daily Activity/Nutrition policy: enabled from September 22, no historical backfill, strategically quarantined.
- Workout policy: Strength only from September 23, no historical backfill, strategically quarantined.
- Global Workout auto-confirm: off.
- Workout strategic eligibility: off.
- Confirmed September 23 relationship: quarantined and strategically inert.
- September 23 Activity repair: not applied.
- Cardio: not started.
- Midweek Native work: not merged or packaged into this candidate.

## Authorization gates and remaining sequence

Each mutation below is a distinct gate. Do not combine permissions or infer later authorization from an earlier one.

1. **Server deploy gate.** Obtain explicit Founder authorization to deploy exact Server `07ed8230be28c2bc4989e2167b028d0bf425c6fa` using the guarded production procedure: quoted refspec, app-spec SHA/build stamping on web and worker, force-rebuild, exact source/runtime authority, live/ready/migration health, and bounded pre/post zero-write audits.
2. **Native release gate.** Only after the Server contract is live and separately authorized, prepare the exact Native `19cbfa10...` release artifact under the guarded archive/upload process. Assign/verify the next legal build number rather than assuming one. TestFlight upload requires its own explicit authorization.
3. **Founder-device gate.** Install/operate the released Native build only with explicit authorization. Do not trigger repair merely by opening diagnostics; preserve ordinary automatic behavior and avoid manual canary/Test Day sync.
4. **Current-day acceptance.** Verify ordinary current Activity/Nutrition can complete before history, historical failures are isolated, diagnostics show exact-day failures, and a later material current-day Apple Health change advances the same day again without force-quit or a 409 loop.
5. **September 23 dry-run gate.** Run only the bounded read-only exact-day Activity repair dry-run on the Founder phone. Capture the real aggregate/digest and freshly read Server preflight. No upload.
6. **September 23 apply gate.** Obtain a separate explicit authorization tied to the immediately preceding dry-run facts. Apply only through the drift-fenced two-request maximum path, then run an independent post-write audit proving the exact 50→51 mutation and every unrelated invariant.
7. **Cardio gate.** Cardio begins only after current-day revision behavior and the September 23 Activity repair reach their final accepted verdicts. It remains out of scope now.

## Relevant durable reports

- Final clean review: `agent-handoffs/reports/20260924T151500Z-healthkit-current-day-priority-final-reviewed.md`
- Prior review rejection that defined the three corrected blockers: `agent-handoffs/reports/20260924T144325Z-healthkit-current-day-priority-fresh-review-rejected.md`
- First review corrections: `agent-handoffs/reports/20260924T143018Z-healthkit-current-day-priority-review-corrections.md`
- Current-day implementation/test checkpoint: `agent-handoffs/reports/20260924T140822Z-healthkit-current-day-priority-implemented-tested.md`
- Architecture audit: `agent-handoffs/reports/20260924T132959Z-healthkit-current-day-priority-architecture-audit.md`
- September 23 repair refusal/design: `agent-handoffs/reports/20260924T131323Z-healthkit-sep23-activity-repair-dryrun-refused.md`
- Build 57 / September 24 baseline and Strength acceptance: `agent-handoffs/reports/20260924T130511Z-healthkit-build57-sep24-baseline-strength-acceptance.md`
- Current production Server deployment authority: `agent-handoffs/reports/20260924T130954Z-midweek-server-deployment-complete.md`
- Build 57 Apple VALID upload: `agent-handoffs/reports/20260924T124636Z-healthkit-native57-testflight-valid.md`
- Build 57 prearchive/disk gate: `agent-handoffs/reports/20260924T052624Z-healthkit-native57-prearchive-disk-gate.md`
- Revision recovery/Strength implementation: `agent-handoffs/reports/20260924T033700Z-healthkit-revision-recovery-implemented.md`
- Final September 23 Strength graduation: `agent-handoffs/reports/20260924T030200Z-strength-sep23-deterministic-confirmed-final-green.md`
- Claude phone handoff protocol: `agent-handoffs/CLAUDE_PHONE_HANDOFF.md`

## Claude takeover instruction

Continue from `/private/tmp/physiqueos-healthkit-revision-recovery-native` at exact `19cbfa10740c0ff5d10e638b57883027349c4b31`. Treat this report and the final review report as authority. Await Founder direction through Remote Control. Do not deploy, archive/upload, operate the phone, repair September 23, change policy/strategic eligibility, or start Cardio without the matching explicit authorization.

## Transition flags

- FINAL_NATIVE_SHA: `19cbfa10740c0ff5d10e638b57883027349c4b31`
- FINAL_NATIVE_WORKTREE: `/private/tmp/physiqueos-healthkit-revision-recovery-native`
- FINAL_SERVER_CANDIDATE_SHA: `07ed8230be28c2bc4989e2167b028d0bf425c6fa`
- PRODUCTION_SERVER_SHA: `28ac1e4f51afdf3a30f2fb50fcb5c95148a2709d`
- PRODUCTION_DEPLOYMENT: `e8c3bed3-20f6-4f5c-b34a-d27ab0881480`
- INSTALLED_NATIVE_BUILD: 57
- INSTALLED_NATIVE_SHA: `6cca05813ce26e3ddd8ff2dead9867bb4e7e3bb9`
- STRENGTH_GRADUATION: GREEN
- SEP23_ACTIVITY_REPAIRED: NO
- SEP24_CURRENT_DAY_ACCEPTED: NO
- SERVER_DEPLOY_AUTHORIZED: NO
- NATIVE_UPLOAD_AUTHORIZED: NO
- FOUNDER_DEVICE_OPERATION_AUTHORIZED: NO
- POLICY_OR_STRATEGIC_ELIGIBILITY_CHANGED: NO
- CARDIO_STARTED: NO
- CODEX_DISENGAGE_AFTER_REMOTE_CONTROL: REQUIRED
- CONTAINS_SECRETS: NO

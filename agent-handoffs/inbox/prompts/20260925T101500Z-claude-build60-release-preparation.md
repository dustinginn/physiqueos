Task id: claude-build60-release-preparation-20260925

Continue in the existing persistent Midweek Briefing Founder Takeover Claude conversation. Reasoning: high.

This task authorizes Native Build 60 RELEASE PREPARATION ONLY:
safe disk cleanup if required -> exact authority reverification -> build-number delta -> tests directly affected by release metadata -> archive -> archive verification -> guarded TestFlight uploader DRY RUN / WOULD UPLOAD -> GH checkpoint -> STOP.

It does NOT authorize the actual TestFlight upload.

Read first:
agent-handoffs/STANDING_DISK_SAFETY.md
agent-handoffs/reports/20260925T170000Z-midweek-v3-predeploy-integrity-final.md
agent-handoffs/reports/20260925T150000Z-midweek-v3-server-e88b8ef7-deployment-checkpoint.md
HealthKit latest.json/latest.md and the reviewed HealthKit Native reports as needed.

Current authority to reverify:
- Production Server: e88b8ef78fa236ce09660997f4084bde069018a7, deployment 9727de79-588e-4445-9306-53b0ee26971e ACTIVE.
- Exact reviewed combined Native candidate: 2374e11aa707ba4124378958ace429ffd781feba on claude/midweek-standard-format-v3.
- Build59 release base was 1.0 (59).
- Native 2374e11a already has a clean full Native run: both suites passed, UI 12/12, and fresh-context integrated review PASS-WITH-NOTES/no blockers.
Reverify; do not rely blindly on this prompt.

STANDING DISK SAFETY — HARD GATE

Before any Xcode archive/full heavy build:
- read and obey agent-handoffs/STANDING_DISK_SAFETY.md;
- verify free disk;
- preferred reserve is >=20 GiB before archive/full Native heavy operations;
- current recent state was ~17 GiB, so safe cleanup is expected before archive.

If <20 GiB:
Safely reclaim regenerable artifacts only. Prioritize stale DerivedData, stale xcresult/test bundles, obsolete temporary build products/caches, and other clearly regenerable artifacts.
Do NOT delete source, uncommitted work, active worktrees, Claude session state, credentials/signing assets, release authority, active archives, GH reports, or current HealthKit/Midweek worktrees.
Before deleting any worktree, prove it is inactive/clean/reachable and not used by a persistent agent; prefer not deleting worktrees.
Report disk before/after and exact cleanup.
Do not start archive until >=20 GiB free.
If safe cleanup cannot reach 20 GiB, STOP for Founder direction.

PART A — exact Native release authority

Reverify:
- worktree clean;
- branch claude/midweek-standard-format-v3;
- HEAD exactly 2374e11aa707ba4124378958ace429ffd781feba before release metadata change;
- its lineage includes exact reviewed Midweek and HealthKit changes;
- no unrelated source drift since the clean full run/review;
- production Server is exact e88b8ef7 and healthy;
- no Build60 already exists in this release train.

Do not merge implementation branches to main merely to prepare the Native release unless established release procedure requires it. Preserve current release authority conventions.

PART B — Build 60 metadata delta only

Using the established project generator/release procedure, change ONLY the required sequential Native build metadata:
1.0 (59) -> 1.0 (60)

No product/source behavior changes are authorized.

Commit the release metadata change and record exact Build60 release SHA.
Prove diff from 2374e11a contains only expected build-number/generated-project metadata.

If any unexpected source/config diff appears, STOP.

PART C — release verification/tests

Because Native source behavior is unchanged and 2374e11a already passed a clean full suite/review:
- do NOT unnecessarily rerun the 14-minute full Native suite solely for a build-number bump;
- run the established release verifier and tests directly affected by bundle/build metadata;
- verify generated Xcode project agrees with canonical project configuration;
- verify no stale hard-coded build-number assertion remains.

If release metadata tooling changes executable source unexpectedly, then stop and reassess whether broader tests are required.

PART D — archive

With >=20 GiB free immediately before archive:
- archive using Xcode/established release procedure;
- do not open/login to App Store Connect or Apple Developer in a browser;
- if Xcode/CLI authentication requires user re-authentication, stop and tell Founder;
- archive must succeed without warnings/errors material to release integrity.

PART E — archive verification

Verify exact archive:
- bundle id com.physiqueos.native.dev;
- marketing version 1.0;
- build 60;
- expected Apple team/signing identity;
- Release configuration;
- arm64 executable;
- archive Info.plist / embedded app Info.plist agreement;
- codesign verification;
- dSYM UUID matches executable UUID;
- archive source/release SHA is the exact Build60 release commit;
- no unexpected embedded frameworks/entitlements/config drift;
- server compatibility remains e88b8ef7.

PART F — guarded TestFlight uploader DRY RUN ONLY

Use the established guarded TestFlight uploader in dry-run mode only.

Required expected result:
WOULD UPLOAD com.physiqueos.native.dev 1.0 (60)

Verify upload authentication/authority sufficiently for the dry-run, but DO NOT execute upload.
Do not use --execute.
Do not supply the real upload confirmation in an execution context.
Do not upload any binary.

PART G — Build60 acceptance inventory

Document exactly what Build60 contains for Founder acceptance after eventual upload:

HealthKit/Strength:
- Sep24 candidate relationship response decodes instead of “This session could not be loaded”;
- candidate vs confirmed relationship label is honest;
- Sep23 confirmed Strength remains healthy;
- prospective HKMetadataKeyIndoorWorkout capture/transport supports specific Indoor/Outdoor type fidelity;
- historical four deferred Sep23/24 walks remain untouched/generic until separately reconciled after Cardio activation.

Midweek:
- accepted Build59 format preserved;
- Hero uses holistic V3 thesis rather than incidental movement PR;
- Confidence explanation uses concrete referents;
- Energy card remains data-first / reduced redundant prose;
- Coach finale omits empty slots;
- “My Recommendation” replaced with “What To Do”;
- Server e88b8ef7 owns the deeper V3 engine, evidence settlement, historical Energy variability, watermark, timezone authority, and fail-closed settlement behavior.

Explicitly note:
- Build60 does NOT activate Cardio;
- does NOT reconcile deferred workouts;
- does NOT change workout policy;
- does NOT implement the later Native briefing-closeout HealthKit handoff unless inspection proves it is already present in 2374e11a (do not invent it).

PART H — GH checkpoint

Publish a timestamped Build60 release-preparation checkpoint to agent-handoffs/reports/ on main under explicit Founder authorization for the report only.
Do not overwrite HealthKit latest.json/latest.md.
Include:
- disk before/after cleanup and archive;
- exact cleanup performed;
- exact Build60 release SHA;
- diff proof;
- release-verifier result;
- archive identity/signing/UUID checks;
- uploader dry-run result;
- acceptance inventory;
- explicit statement TESTFLIGHT_UPLOADED = false.

STOP for separate Founder authorization before real TestFlight upload.

NOT AUTHORIZED

No TestFlight upload.
No Server deployment.
No production data mutation.
No HealthKit policy mutation.
No Cardio activation.
No deferred workout reconciliation.
No historical briefing regeneration.
No Native device operation.

Flags:
AUTHORITY_REVERIFIED
STANDING_DISK_SAFETY_OBEYED
DISK_AT_LEAST_20_GIB_BEFORE_ARCHIVE
BUILD60_METADATA_ONLY_DELTA
BUILD60_RELEASE_SHA_RECORDED
RELEASE_VERIFIER_PASS
ARCHIVE_SUCCEEDED
ARCHIVE_IDENTITY_PASS
CODESIGN_PASS
ARM64_PASS
DSYM_UUID_PASS
UPLOADER_AUTH_PASS
WOULD_UPLOAD_BUILD60
HEALTHKIT_STRENGTH_FIX_INCLUDED
MIDWEEK_V3_NATIVE_FIX_INCLUDED
CARDIO_NOT_ACTIVATED
DEFERRED_CARDIO_UNTOUCHED
TESTFLIGHT_UPLOADED
PRODUCTION_MUTATED
GH_REPORT_PUBLISHED

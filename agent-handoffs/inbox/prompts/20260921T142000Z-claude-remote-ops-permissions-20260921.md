Task id: claude-remote-ops-permissions-20260921

Goal

Prepare the Founder's Mac so Claude Remote Control can perform essentially all normal PhysiqueOS development and release operations from phone-started sessions without repeatedly stopping for local permission prompts, while using only supported Claude Code configuration and preserving repository/production correctness gates.

This is an operational environment/setup task. It may modify the Founder's local Claude Code user configuration and local PhysiqueOS release-tool configuration outside the repository. It must not weaken application correctness gates, mutate Founder production data, alter application behavior, or deploy anything merely to prove permissions.

The Founder explicitly authorizes broad standing local execution permissions for PhysiqueOS work. The goal is to eliminate avoidable Claude Code permission interruptions while the Founder is away from the Mac.

Remote Control baseline

Reverify the currently installed Claude Code version and supported permission/settings schema before editing anything.

Current intended Remote Control model:
- persistent host launched from ~/Developer/PhysiqueOS/native-remote-control
- worktree spawn mode = worktree
- user setting worktree.baseRef = head
- accepted Native anchor = Build 47 SHA f372699fc6dfd4501d77c2a570a80c00d256a0ec unless independently verified otherwise
- each phone-started session gets an isolated Remote Control-managed worktree
- agents must still verify task authority before editing
- agents must not create/switch/delete additional worktrees during normal Remote Control tasks unless a task explicitly authorizes an exception

First verify that a fresh Remote Control worktree still starts from the intended anchor behavior. Do not change Git history to achieve this.

Permission objective

Using only Claude Code's documented/supported local configuration mechanisms, configure persistent user-level permissions so future Remote Control sessions can execute normal PhysiqueOS workflows without pausing for routine permission approval.

The Founder explicitly authorizes standing permissions sufficient for these categories:

1. Git/repository operations
- git status/log/show/diff/rev-parse/fetch
- branch creation inside the current Remote Control worktree when needed
- commit
- cherry-pick/rebase/merge when a task explicitly requires it
- push normal feature/control-plane branches
- fast-forward push to combined-app-platform-cutover when the GitHub task explicitly authorizes production deployment
- push to main only for the established agent-handoffs control-plane paths/protocol
- no standing force-push requirement; do not enable/normalize force-push workflows

2. Server development and validation
- npm/node/npx commands used by PhysiqueOS
- test/lint/build scripts
- local bundle/replay/audit tooling
- read-only production console/audit runner described by agent-handoffs/PRODUCTION_READONLY_ACCESS.md
- doctl read operations through established PhysiqueOS contexts
- doctl production deploy operations when the active GitHub task explicitly authorizes deployment, including the established apps update and apps create-deployment --force-rebuild path
- deployment/status/log reads and verification
- no database write is implicitly authorized by these standing shell permissions; production data mutation still requires explicit task authorization

3. Native/iOS/Xcode development
- xcodebuild build/test/archive/exportArchive
- xcrun/simctl
- codesign/security/plutil/dwarfdump and normal archive-verification utilities
- Swift/Xcode project-generation tooling
- DerivedData cleanup and ordinary local build-artifact cleanup
- App Store Connect/TestFlight upload commands when the task explicitly authorizes an upload
- future API-key-authenticated upload tooling
- no browser login automation

4. Local PhysiqueOS operational tooling
- ~/.physiqueos-release/bin/*
- local scripts under the active PhysiqueOS worktree
- safe temporary/scratch files used for tests, builds, audit payloads, and release verification
- shell pipelines needed for bounded logs and read-only diagnostics
- ordinary process inspection/cleanup for Claude's own spawned/test processes

5. GitHub control-plane workflow
- physiqueos-inbox fetch/claim
- physiqueos-handoff-publish
- creation/update of sanitized agent-handoffs files through the established tools
- normal origin/main fetch/read for control-plane discovery

Use a broad permission pattern if that is the supported and reliable way to achieve this. The Founder is prioritizing uninterrupted remote operation over granular shell prompting.

Important distinction

Standing local execution permission is NOT standing business authorization.

Even if Claude Code is locally allowed to run a command:
- production deployment still requires the active task to authorize deploy
- production data mutation still requires explicit task authorization
- TestFlight upload still requires the active task to authorize upload
- destructive Git history changes still require explicit task authorization
- secrets/private keys must never be printed or copied into GitHub/chat/logs
- application authority must still be independently reverified
- test/review/deploy gates remain in force

Do not encode application/business authorization into local permission configuration. The settings should remove local approval friction, not bypass task scope.

Implementation requirements

1. Inspect the current ~/.claude/settings.json and any other supported Claude Code user/project permission configuration.
2. Determine the exact documented permission syntax supported by the installed version. Do not guess configuration shape.
3. Preserve existing settings, including theme, push notifications, and worktree.baseRef=head.
4. Add the minimum broad standing permission configuration that reliably covers the categories above.
5. Do not edit undocumented internal databases/state if a documented settings mechanism exists.
6. Do not place credentials, tokens, private keys, account ids, production URLs containing secrets, or other sensitive values in Claude settings.
7. Do not modify repository application files merely to configure Claude permissions.
8. Record a sanitized description of what changed, not secret-bearing file contents.

Verification

After configuration, prove the permissions in a safe way.

Use non-destructive/read-only or dry-run probes wherever possible:
- git fetch/status and a harmless branch/ref read
- a no-op/test push only if an existing protocol-supported control-plane test can safely prove push permission without changing application code; otherwise do not manufacture production branch changes
- doctl app/deployment read
- production deploy command permission classification may be tested via a supported dry-run/help/validation mode if one exists; do not trigger a production deployment merely to test permission
- xcodebuild version/project read or harmless compile/test command
- local release helper invocation in a non-uploading validation mode
- physiqueos-inbox fetch or equivalent control-plane read

If the local Claude permission classifier cannot be configured through supported settings to permit a category, identify the exact remaining blocker and the exact one-time Founder action required. Do not bypass or patch Claude Code internals.

Pending Server deploy continuity

There is a reviewed Server candidate from the immediately prior task:
a428fbda42757620750264e63eaee18950ab7132

The prior task report says:
- base 714dcaef03a28f53f7f34f1d825419b253744b53
- candidate read-model-only photo fix
- tests/gates clean versus base
- independent review APPROVED
- predeploy baseline captured
- deployment blocked only by local permission classifier
- candidate exists locally and was not pushed

After the permission configuration is complete and verified, locate that candidate safely in the local repository without modifying another active worktree.

If and only if:
- the current production Server authority still matches the prior verified base/deployment expectations,
- candidate a428fbda is still exactly one reviewed commit on top of that production base,
- the prior GitHub handoff/report confirms the deployment was already explicitly authorized,
- no intervening production drift invalidates the baseline/gates,
- and the permission setup now permits the exact fast-forward/deploy operations,

then resume and complete the previously authorized deployment workflow:
- fast-forward push a428fbda to combined-app-platform-cutover, no force
- update only established identity/build stamps
- force rebuild using the established production deploy context if required by stale-source behavior
- verify actual web and worker source_commit_hash equal a428fbda
- /live and /ready 200
- schema/cost unchanged
- run the prepared/read-only postdeploy zero-write audit and functional proof
- confirm the canonical Sep 19 photo session is selected, JPEG derivative is served, duplicate legacy read-model session suppressed, and Photo Briefing availability resolves

Do not deploy if any prior gate/review/authority assumption is stale. In that case stop and report what must be rerun.

Do not begin Build 48 in this task.

Travel-readiness deliverable

Before finishing, produce a concise "phone-only readiness" checklist for the Founder covering:
- persistent Remote Control host status
- worktree base behavior
- GitHub inbox/handoff workflow
- production read-only access discovery
- production deploy permissions
- Xcode/archive permissions
- remaining Apple/App Store Connect dependency before API-key upload is fully proven
- what still genuinely requires Founder interaction, if anything

Completion handoff

Claim this task through the GitHub inbox protocol and publish a sanitized completion under the same task id:
claude-remote-ops-permissions-20260921

Any terminal blocker requiring Founder action is a mandatory handoff publication point. Do not merely pause in chat.

Report:
- installed Claude Code version
- supported permission mechanism used
- user-settings changes at a structural/sanitized level
- verification results by permission category
- whether production deploy permissions are now functional
- whether a428fbda was deployed
- deployment id/source if deployed
- postdeploy zero-write and functional proof if deployed
- any remaining phone-only blockers
- no secrets/credentials included

Explicit flags:
REMOTE_CONTROL_WORKTREE_BASE_CORRECT
CLAUDE_STANDING_PERMISSIONS_CONFIGURED
GIT_WORKFLOW_PERMISSION_READY
PRODUCTION_READONLY_PERMISSION_READY
PRODUCTION_DEPLOY_PERMISSION_READY
XCODE_BUILD_ARCHIVE_PERMISSION_READY
TESTFLIGHT_UPLOAD_PERMISSION_READY
GITHUB_CONTROL_PLANE_PERMISSION_READY
PHOTO_SERVER_FIX_DEPLOYED
ZERO_WRITE_POSTDEPLOY_AUDIT_PASSED
PHONE_ONLY_WORKFLOW_READY
FOUNDER_MAC_INTERACTION_STILL_REQUIRED
PRODUCTION_DATA_MUTATED_DURING_SETUP

Stop after permission setup and, if still valid/authorized, completion of the previously blocked Server deployment. Do not begin Build 48 or HealthKit.

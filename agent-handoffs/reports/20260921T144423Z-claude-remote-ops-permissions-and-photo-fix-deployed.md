# Remote-ops permissions configured; photo Server fix a428fbda deployed and verified

Task id: claude-remote-ops-permissions-20260921
Agent: claude (Remote Control worktree session on the Founder's Mac)
Completed: 2026-09-21T14:44Z
Follow-up to the earlier blocked completion of the same task id (report 20260921T142802Z-claude-remote-ops-permissions-blocked.md). That blocker was cleared when the Founder explicitly authorized, in the session chat, editing the Claude user configuration and continuing the deployment.

## Result

- Claude user settings configured (supported mechanism: `permissions.allow` / `permissions.ask` plus the `autoMode` block in `~/.claude/settings.json`). Installed Claude Code: 2.1.278.
- Server candidate a428fbda42757620750264e63eaee18950ab7132 deployed to production: deployment d3783f4c-bc14-469b-b10c-93635a047325 ACTIVE, web and worker source_commit_hash both a428fbda (verified from the API, not from stamps).
- Postdeploy zero-write audit passed and the functional proof confirms the Sep 19 photo fix against real production state.
- No production data was written. Production runtime changed only by the code deploy and the four build-stamp env values.

## Claude configuration (structural, sanitized)

Backup of the previous file kept at `~/.claude/backups/settings.json.pre-remote-ops-permissions-20260921`. Preserved: theme, agentPushNotifEnabled, worktree.baseRef=head. No credentials, tokens, account ids or secret-bearing URLs were added.

- `permissions.allow` (55 narrow rules, which survive auto mode): git read commands, fetch, add, commit, checkout -b, switch -c, cherry-pick, rebase, merge; npx vitest run, npm test/lint/build; xcodebuild, xcrun simctl/xcodebuild/stapler validate, codesign, security find-identity/cms, plutil, dwarfdump, xcodegen, swift build/test/package; DerivedData deletion; doctl read verbs and the read-only `--context physiqueos-audit`; the approved console runner; physiqueos-inbox, physiqueos-handoff-publish, physiqueos-asc-upload auth-check/status; Read of the PhysiqueOS worktree tree; Edit of /tmp and /private/tmp scratch.
- Not allow-listed on purpose: `git push`, doctl deploy verbs, real ASC upload. An allow rule would bypass the classifier's production-deploy gate. They are covered by conditional `autoMode.allow` exceptions that require the Founder to have authorized the named SHA or archive (in chat or in the executed GitHub task).
- `permissions.ask` (7 rules, human checkpoint): git push force forms (`--force`, `-f`, `+refspec`) and `git commit --amend`. Force pushes stay gated; nothing normalizes them.
- `autoMode.environment` (with `$defaults`): organization and use, source control (dustinginn/physiqueos; main = control plane; combined-app-platform-cutover = production deploy branch), cloud providers (DigitalOcean App Platform via saved doctl contexts, App Store Connect), org CLIs, sensitive remote targets (production DB/components: read-only diagnostics only), host containment (personal Mac hosting Remote Control worktrees).
- `autoMode.allow` (with `$defaults`): local Native build/verification, release-tool use, authorized production deploy, authorized upload.
- Verified with `claude auto-mode config`: effective allow 21, soft_deny 70 (built-ins intact), hard_deny 1, environment 27, PhysiqueOS entries present. JSON validated.
- Rejected: bare `Bash` allow (dropped in auto mode) and `bypassPermissions` (unavailable to a Remote Control session started without it; disables gates).

## Authority reverified before deploying (read-only)

- Production branch head 714dcaef03a28f53f7f34f1d825419b253744b53; active deployment 7292d936-bd71-4f1b-b242-acf740f1557f; both unchanged since the prior report. /live and /ready 200.
- Candidate a428fbda is a direct child of 714dcaef (merge-base is-ancestor true, rev-list count 1). The prior report confirms tests clean vs base (zero candidate-only failures), independent review APPROVED, predeploy baseline captured, deployment authorized. The Founder re-authorized the deployment in chat.
- Worktree base: Remote Control worktree HEAD equals the Build 47 anchor f372699f with baseRef=head (correct). No worktree created, switched or deleted.

## Deployment steps

1. `git push origin a428fbda:refs/heads/combined-app-platform-cutover`: fast-forward 714dcaef..a428fbda, no force.
2. Spec update (deploy context): diff verified to change exactly four values, PHYSIQUEOS_GIT_SHA and PHYSIQUEOS_BUILD_ID on web and worker (build id physiqueos-a428fbda-20260921). Nothing else. Working copies of the spec were deleted afterwards.
3. That spec update created deployment dccc8dfb, which was building the OLD commit 714dcaef (the known stale-source behavior). Superseded and CANCELED.
4. `create-deployment --force-rebuild` created d3783f4c: building web and worker at a428fbda from the start; reached ACTIVE.
5. Verified from the API on the active deployment: web a428fbda, worker a428fbda. Instance sizes unchanged (apps-s-1vcpu-1gb-fixed x1 each), so cost unchanged. /live 200, /ready 200 (all 9 checks ready, schema check PROVIDER_MIGRATION_000014_APPLIED, buildId physiqueos-a428fbda-20260921).

## Postdeploy verification

Zero-write audit (approved read-only runner; REPEATABLE READ READ ONLY, transaction_read_only on, owner-scoped, ROLLBACK, success marker present):
- Runtime gitSha a428fbda and buildId physiqueos-a428fbda-20260921 confirmed inside the component.
- Compared with the predeploy baseline: zero differences in all 29 per-collection record digests, the briefing artifact digests, energy protocols and versions, Sep 19 session/media/legacy rows/briefing sections, outbox status counts, pending evidence reviews, and migrations (14, last 000014).
- Compiled correction marker present in 2 server chunks (340 files scanned).

Functional proof (bundle of the deployed read-model code against real production state, read-only):
- Session count 18 (was 19 on the base): the duplicate legacy Sep 19 session is suppressed.
- Latest session is the canonical `photo_session_..._2026-09-19`, mode canonical, not legacy-adapted, 5 views, first pose front-relaxed.
- Its five media are exactly the five JPEG derivative media (set-equal to the derivative references, none of the five DNG original references).
- Published Sep 19 Photo Event briefing found with its photo narrative, so Photo Briefing availability resolves.
- Legacy rows untouched: 49 total, 5 dated Sep 19.

Not done: an authenticated HTTP request against the live Native endpoint (no Founder credential is available to the agent). On-device acceptance is not claimed.

## Permission probes by category (with the new settings)

- Git: fetch, ls-remote, rev-parse, merge-base, rev-list, cat-file ran without prompts; the non-force fast-forward push to the deploy branch succeeded. commit, checkout -b, cherry-pick, rebase and merge rules are configured but were not exercised.
- Production read-only: doctl audit-context reads and the console runner (two runs) ran without prompts.
- Production deploy: doctl apps update and create-deployment (deploy context) and the deploy-branch push all ran with the Founder's chat authorization plus the autoMode entries. Functional.
- Xcode: `xcodebuild -version` (Xcode 27.0) and `xcrun simctl list runtimes` ran; archive/exportArchive were not exercised.
- Release tooling / TestFlight: `physiqueos-asc-upload auth-check` passes (API key, read-only); `upload` and `--execute` were NOT run. A real API-key upload remains unproven.
- GitHub control plane: inbox fetch/claim and this handoff publish.

## Remaining items

- Founder on-device re-check of Build 47 (no Mac needed): Progress Photos Sep 19 latest set: first image loads instead of Retry photo; photos 2 to 5 load; Progress Photos no longer says Photo Briefing is being prepared; Read Photo Briefing opens the published Sep 19 briefing; Home and Briefing History unchanged.
- Prove xcodebuild archive/exportArchive and a real API-key upload under the new permissions on the next Native task.
- Do not begin Build 48 or HealthKit until the Founder re-check.

## Explicit flags

- REMOTE_CONTROL_WORKTREE_BASE_CORRECT: true
- CLAUDE_STANDING_PERMISSIONS_CONFIGURED: true
- GIT_WORKFLOW_PERMISSION_READY: true (reads and non-force deploy-branch push proven; commit/rebase rules not exercised)
- PRODUCTION_READONLY_PERMISSION_READY: true
- PRODUCTION_DEPLOY_PERMISSION_READY: true
- XCODE_BUILD_ARCHIVE_PERMISSION_READY: false (only version/simctl proven; archive not exercised)
- TESTFLIGHT_UPLOAD_PERMISSION_READY: false (auth-check proven; real upload not exercised)
- GITHUB_CONTROL_PLANE_PERMISSION_READY: true
- PHOTO_SERVER_FIX_DEPLOYED: true
- ZERO_WRITE_POSTDEPLOY_AUDIT_PASSED: true
- PHONE_ONLY_WORKFLOW_READY: false (Git, Server deploy, read-only audit and control plane ready; Xcode archive and real upload still unproven)
- FOUNDER_MAC_INTERACTION_STILL_REQUIRED: false (only the on-device Build 47 photo re-check)
- PRODUCTION_DATA_MUTATED_DURING_SETUP: false

Production deployed: yes (code and stamp env only). TestFlight uploaded: no. No secrets, credentials, account ids or Founder evidence in this report.

# Founder-present Mac DigitalOcean console PAT maintenance — final

Task ID: `mac-do-console-pat-maintenance-20261002`

Generated: 2026-10-02T02:56:04Z

Status: **complete**

Repository: `dustinginn/physiqueos`

## Outcome

The existing least-privilege DigitalOcean context `physiqueos-final-cutover-config` can read the current App Platform application and open the current production `web` component console. The bounded console payload printed only a fixed smoke marker and the remote Node version, then exited successfully. The PAT maintenance objective is complete. The PAT was not broadened, replaced, or rotated.

No SQL ran. No production user data, runtime binding, environment value, database URL, certificate, token material, provider spec, or credential was printed, copied, queried, or published. No production state was mutated.

## Runner recovery and authority

- The temporary runner was absent after restart and safe cleanup.
- Repository history identifies commit `4025f17560e926b7e33a1cad6757a06716b16d24` on `origin/codex/production-readonly-mac-bootstrap-handoff` as the authoritative portable runner implementation.
- The approved source path in that commit is `scripts/operations/runAppConsoleContextGzipSourceOnOpen.mjs`.
- It was restored as the ignored local-only file `.tmp/digitalocean/run-app-console-context-gzip-source-on-open.mjs`.
- The restored file's Git blob is `f7123347a43fb5dcfe8ae2a3029897d5ddb11fa7`, exactly equal to the authoritative historical blob.
- The runner remains local-only and is not part of this report commit.

Local compatibility checks passed: the saved context is present, `doctl` is available, the YAML dependency resolves, and the local Node runtime exposes WebSocket support. The local shell Node version is v22.23.2; the approved runner nevertheless executed successfully. The remote component reported Node v24.21.0.

## Current App Platform authority

All provider commands used the explicit context `physiqueos-final-cutover-config` with retries disabled.

- Application name: `physiqueos-foundation-staging`
- Application ID: `bf57cf56-48cc-4cd6-90e4-a23ee5381741`
- Active deployment: `421cae1a-dbc6-494c-9f73-9b8778e45efd`
- Deployment phase: `ACTIVE`, progress `9/9`
- Current instances independently showed component names `web` as `SERVICE` and `worker` as `WORKER`.
- The bounded console test targeted the verified `web` component, not a historical component identifier.

The post-restart `doctl account get` 403 supplied by the Founder is expected for this intentionally least-privilege PAT and is not an App Platform console failure.

## Bounded console acceptance

The exact payload behavior was limited to:

1. print the constant `PHYSIQUEOS_CONSOLE_SMOKE_OK`;
2. print `process.version`;
3. exit.

Observed sanitized result:

- fixed marker: present;
- remote Node: v24.21.0;
- runner remote exit status: 0;
- local process exit status: 0;
- SQL statements: 0;
- production data reads: 0;
- production writes: 0.

This is direct proof that the existing PAT has working `app:access_console` permission. Per the maintenance contract, it must not be rotated or broadened.

## Other credential-maintenance audit

The current `origin/main` handoff history was searched for outstanding PAT, token, saved-context, signing-key, credential-rotation, and manual-authentication work.

- A 2026-10-01 report notes that the older `physiqueos-audit` doctl context returns 401 and says it is worth refreshing before another audit relies on it.
- The standing production-read policy names `physiqueos-final-cutover-config`, not `physiqueos-audit`, as the approved Mac read and console path. The approved context now passes both application listing and console execution. No current handoff requires the legacy context, so refreshing it would be speculative credential work and was not done.
- The App Store Connect Admin API-key path was previously installed and proven through successful guarded uploads. No later main-visible report identifies a missing or expired Apple credential.
- No current main-visible handoff identifies another PAT or manual credential operation as an unresolved blocker.
- Deployment, migration, native-sandbox, and other saved contexts were not exercised or rotated. Their permissions are separate from this read-console maintenance and no current authority requested maintenance on them.

Conclusion: **no other manual credential maintenance is presently outstanding based on the current main-visible handoff authority.** If a future workflow produces a concrete authentication failure on its own approved context, diagnose that failure in that workflow rather than rotating credentials preemptively.

## Validation performed

- Fetched current `origin/main` and the authoritative runner branch.
- Read the mandatory main-branch checkpoint protocol.
- Read the standing production-read policy and portable-runner safety contract.
- Verified the restored runner by exact Git blob equality.
- Verified local runner prerequisites without reading token contents.
- Listed apps with the explicit context.
- Read the active deployment state with the explicit context.
- Listed current app instances to establish the `web` component.
- Ran the bounded constant-plus-version console payload successfully.
- Audited current main-visible handoffs for unresolved credential maintenance.

No unit suite or application build was run because no application source changed. No independent code review was required for a byte-identical restoration of ignored local tooling.

## Repository and local-state notes

- `origin/main` before publication: `2d5e8b72c584d4227f1a475931c62dba775325a7`.
- Active implementation branch and HEAD were not changed.
- Two pre-existing untracked Sleep reports in the active worktree were left untouched.
- The recovered console runner remains ignored, local-only scratch under `.tmp/digitalocean/` and may be removed again by future safe cleanup; its durable authority remains commit `4025f17560e926b7e33a1cad6757a06716b16d24`.
- No Server deployment, Native build, TestFlight upload, infrastructure mutation, or production data mutation occurred.

## Safe next step

No Founder credential action is needed. Continue using `physiqueos-final-cutover-config` for authorized bounded App Platform read-console work. Preserve the least-privilege scope and do not refresh the unused legacy `physiqueos-audit` context unless a future explicitly authorized workflow still depends on it.

## Safety flags

- CONTAINS_SECRETS: NO
- CONTAINS_CREDENTIALS: NO
- CONTAINS_PRODUCTION_EXPORTS: NO
- CONTAINS_FOUNDER_EVIDENCE: NO
- SAFE_FOR_CHATGPT_RETRIEVAL: YES

# PhysiqueOS agent handoffs

## Purpose

When a Claude or Codex agent finishes a substantial task, it publishes a small **sanitized** handoff
here. The Founder then tells ChatGPT only "Claude finished." or "Codex finished."; ChatGPT reads the
handoff through its GitHub connection and reports: what changed, whether it worked, what matters to the
Founder, anything concerning, decisions required, remaining backlog, and the recommended next step.
No copy/paste of completion reports.

## Layout

| Path | Role |
| --- | --- |
| `agent-handoffs/latest.json` | Primary machine-readable interface. Compact. Overwritten by every substantial task. |
| `agent-handoffs/reports/<UTC timestamp>-<short-task-name>.md` | Immutable detailed technical report, one per substantial task. Never edited or overwritten. |
| `agent-handoffs/latest.md` | Human-readable pointer to the latest handoff (generated from `latest.json`). Not authoritative. |
| `agent-handoffs/README.md` | This protocol. |

The report file name is `YYYYMMDDTHHMMSSZ-<slug>.md` (slug: lowercase letters, digits, hyphens).

## `latest.json` schema (version 1)

All keys below are required. Do not add or omit top-level keys (a change needs a new `schema_version`).
Values that do not apply are `null` (or an empty array). **Never fabricate a value to fill the schema.**

```
schema_version            1
generated_at_utc          "YYYY-MM-DDTHH:MM:SSZ"
task                      { id, title, agent: "claude"|"codex", status: "completed"|"partial"|"blocked"|"failed" }
repository                "dustinginn/physiqueos"
authority                 { base_sha, final_sha, production_server_sha, production_deployment,
                            native_sha, native_build }        (SHAs are lowercase hex; others string/number/null)
result                    { summary, success, production_mutated, deployed, testflight_uploaded }   (last four: booleans)
validation                { tests, review, zero_write_audit }  each null or { status, summary }
                            tests:            passed | failed | not_run | not_applicable
                            review:           approved | changes_requested | not_run | not_applicable
                            zero_write_audit: passed | failed | not_run | not_applicable
decisions_required        [ string | object ]   decisions only the Founder can make
blockers                  [ string | object ]
unexpected_findings       [ string | object ]
backlog                   [ string | object ]
recommended_next_step     string | null
full_report_path          "agent-handoffs/reports/<timestamp>-<slug>.md"
safety                    { contains_secrets, contains_credentials, contains_production_exports,
                            contains_founder_evidence, safe_for_chatgpt_retrieval }   (booleans)
```

Field notes:

- `authority.final_sha` is the final SHA of the *work being reported* (implementation or release). It is
  `null` for tasks that produce no commit other than the handoff itself. The handoff's own commit is the
  most recent commit that touched `latest.json`.
- `authority.production_server_sha` / `production_deployment` describe the live Server as verified by the
  agent at handoff time. `native_sha` / `native_build` describe the current Native build. A recorded SHA
  may exist only in a local worktree and not on GitHub; say so in `unexpected_findings`.
- `result.production_mutated`, `deployed` and `testflight_uploaded` are answered honestly (`true` if it
  happened in this task), not left `false` by default.
- Every `safety.contains_*` must be `false` and `safe_for_chatgpt_retrieval` `true` to publish. If any
  contains_* would be `true`, **do not publish**.

## Security boundary

A handoff must NEVER contain: private keys, `.p8` contents, JWTs, passwords, database credentials,
DigitalOcean credentials, Apple credentials, API tokens, secret environment values, raw production
database exports, raw Founder health/evidence data, Founder progress-photo media, signing material, or
private logs that contain secrets. Also keep out email addresses and bulk data dumps.

Allowed, when operationally useful: commit SHAs, deployment ids, build numbers, upload / App Store Connect
delivery ids, repository paths, test counts, and record ids needed to explain a repair. Non-secret is not
the same as publishable: do not publish raw Founder evidence merely because it is technically non-secret.
Summarize sensitive production findings instead of quoting them.

Handoff publication must not change application behavior or production state, and failing to publish must
never alter production. Handoff commits contain only files under `agent-handoffs/`, are never
force-pushed, and are kept separate from implementation commits.

## Publication procedure (agents)

1. Finish the real work first (implementation, gates, review, deploy or release). Verify authority values
   (production SHA/deployment, Native SHA/build) at handoff time; do not copy stale values.
2. Write `latest.json` and the detailed report to a staging directory **outside** the repository
   (the report must mention `task.id`). The report should preserve: scope, authority, implementation,
   tests, review, deployment, production mutation details, acceptance, unexpected findings, open issues,
   decision boundaries, and final flags. It may be long; it must stay sanitized.
3. Run the sanitization gate and publish:

   ```
   ~/.physiqueos-release/bin/physiqueos-handoff-publish --latest <latest.json> --report <report.md> --dry-run
   ~/.physiqueos-release/bin/physiqueos-handoff-publish --latest <latest.json> --report <report.md>
   ```

   The tool validates the schema and safety fields, scans for credential/PII/raw-dump patterns, checks
   size caps, builds the commit in a throwaway worktree on `origin/main` containing only `agent-handoffs/`
   files, pushes without force, and verifies the remote commit (valid JSON, `full_report_path` resolves,
   only intended files changed). It refuses to publish if sanitization cannot be proven.
4. If the tool is unavailable, do the same checks by hand (inspect the staged files, scan for
   credential-like material, verify the safety fields, confirm only `agent-handoffs/` files are staged).
   If sanitization cannot be proven, do not push; report that in chat.
5. Tell the Founder only a short status (published or not, commit SHA, paths).

Handoffs are published to `main` on purpose: `main` is not the Server production branch
(`combined-app-platform-cutover`), so a handoff push cannot trigger or alter a deployment.

## How ChatGPT consumes it

1. Read `agent-handoffs/latest.json` from `dustinginn/physiqueos` (branch `main`).
2. Check `schema_version`, `generated_at_utc` (is it recent?), and `task.agent` against what the Founder
   said ("Claude finished" / "Codex finished"). If the agent differs or the handoff looks stale, say so.
3. Confirm `safety.safe_for_chatgpt_retrieval` is `true` and every `safety.contains_*` is `false`.
4. Translate for the Founder: what changed, whether it worked, what matters, anything concerning,
   decisions required, remaining backlog, recommended next step.
5. Fetch `full_report_path` only when the JSON is not enough (diagnosis, a concerning finding, or a
   Founder question). Reports are immutable history.

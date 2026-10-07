# Handoff latest-pointer housekeeping (handoff-latest-pointer-housekeeping-20261007)

Status: **Handoff latest-pointer housekeeping ready for Founder merge authorization.**

- Agent: claude (Remote Control, isolated worktree)
- Prompt: `agent-handoffs/inbox/prompts/20261007T162000Z-claude-handoff-latest-pointer-housekeeping.md` @ b36fe01b
- Task class: repository housekeeping / handoff protocol only. No product code, no Native or Server
  behavior, no deploy, no production read or write, no build bump, no TestFlight.

## 1. Candidate

| | |
| --- | --- |
| Branch | `claude/handoff-release-authority-housekeeping-20261007` (pushed) |
| Candidate SHA | `a60f98f0` (single commit on `origin/main` b36fe01b) |
| Merge type | fast-forward of `main` if `main` has not moved; otherwise rebase (only `agent-handoffs/` + `docs/CODEX.md`) |
| `main` | **not modified** by this task (housekeeping edits existing protocol/pointer files, so it is not eligible for the additive report-only rule) |

Authority reverified 2026-10-07T16:21Z: production `/api/v1/health/live` buildId `physiqueos-e7ffc671-20261007`
(= e7ffc671, matches the prompt). Native release authority Build 90 per 57877afc.

## 2. Latest pointer before / after

| | Before (origin/main b36fe01b) | After (candidate a60f98f0) |
| --- | --- | --- |
| task.id | `build92-training-variant-server-foundation-20261007` | `build90-testflight-release-20261007` |
| Class | Server implementation candidate (testflight_uploaded false) | Accepted Native release |
| native_sha / build | 32baf1d5 / 90 (carried) | 32baf1d5 / 90 |
| TestFlight | n/a | delivery 68dc945f-cfaa-43bb-a1ff-d0020fed54ff VALID |
| production_server_sha | e7ffc671 / b98c26e4 (live-at-task) | 1b6687ff / cbe6be96 (snapshot at Build 90 release) |
| full_report_path | `reports/20261007T155922Z-build92-training-variant-server-foundation.md` | `reports/20261007T025954Z-build90-testflight-valid.md` |

`latest.json` and `latest.md` are **byte-identical to 57877afc** (`git diff 57877afc a60f98f0 -- latest.*` empty).
No Build 89 authority values (no 51399425, no build 89). Moves made by 63bf054e (training variant audit/design) and
786432ca (Build 92 Server candidate) are undone only in these two files; both timestamped reports are preserved.

`production_server_sha` decision: the restored pointer keeps 1b6687ff/cbe6be96 as a **historical
server-at-release snapshot**. Live Server (e7ffc671) is not mixed into the release pointer; this is now written
down in `RELEASE_AUTHORITY.md`.

## 3. Files changed (candidate)

- `agent-handoffs/latest.json`, `agent-handoffs/latest.md`: restored from 57877afc.
- `agent-handoffs/RELEASE_AUTHORITY.md` (new): the rule, task-class table, field semantics, three-concepts
  audit, guard usage, mandatory prompt clause, narrow report-only main contract and exact authorization text.
- `agent-handoffs/README.md`: **restored the protocol.** Unexpected finding: since 2026-09-23 (741d4465, Codex)
  `README.md` on main was a stale copy of a latest pointer, written via `physiqueos-handoff-publish --readme`; the
  real protocol (43cf6637) had been gone from main for two weeks. Restored and updated (release rule banner,
  layout table, prompt clause, completion procedure, ChatGPT consumption path).
- `agent-handoffs/README_REPORTING_STANDARD.md`: removed the "every task updates latest.json/latest.md" mandate
  (the root instruction behind the misplaced moves); "check GH" path now reads the newest report.
- `agent-handoffs/CLAUDE_PHONE_HANDOFF.md`, `docs/CODEX.md`: one-sentence alignment.
- `agent-handoffs/tools/release_pointer_guard.py` (new), `test_release_pointer_guard.py` (new), `fixtures/` (6 real
  sanitized latest.json docs already on main), `.gitattributes` (diff-check exemption for `*.patch` context lines).
- `agent-handoffs/tools/physiqueos-handoff-publish.release-authority.patch` (new, **proposed, not installed**).

No file outside `agent-handoffs/` except `docs/CODEX.md` (the documented control-plane pointer). No app/Server
source, config, infrastructure, Native or build file changed.

## 4. Exact protocol rule

> `latest.json` / `latest.md` are the latest ACCEPTED NATIVE RELEASE AUTHORITY, not the latest task/report.
> Audit, design, report-only, incident/hotfix, implementation-candidate and Server-deploy tasks publish a
> timestamped report under `agent-handoffs/reports/` and MUST leave both files unchanged. Only the accepted Native
> release workflow may move them, at the accepted point (guarded TestFlight upload, delivery VALID).

Separate concepts audit: no Server pointer and no task pointer exist. Latest Server = live health endpoint +
read-only doctl (recommended name if ever wanted: `agent-handoffs/latest-server.json`, not created). Latest task =
newest timestamped file in `reports/` (or inbox `lifecycle.completion_handoff_path`). A `latest-task.json` was
deliberately not created: a file rewritten by every task would break the additive-only report publication contract.

## 5. Automated guard

`agent-handoffs/tools/release_pointer_guard.py` (stdlib). Uses structured schema-v1 fields, not commit text. A
pointer change is allowed only if the new `latest.json` has `task.status=completed`, `result.success=true`,
`result.testflight_uploaded=true`, hex `native_sha`, integer `native_build`; the build does not go backwards; the
same build keeps the same `native_sha`; `latest.md` equals the publisher-generated pointer; `full_report_path`
exists. Unchanged pointer = pass.

- `--base origin/main --head HEAD` on the candidate: PASS ("pointer moved to accepted Native release
  build90-testflight-release-20261007 (build 90, native 32baf1d5)").
- Proposed publisher patch: report-only is the default (publishes only the report, plus the inbox flip with
  `--inbox-task-id`); `--release-authority` moves the pointer only after the guard accepts the transition from
  the current origin/main pointer; `--readme` refused. Sandbox dry-runs of the patched copy: see the addendum.

## 6. Report-only publication permission disposition

- Contract documented in `RELEASE_AUTHORITY.md` (new files only under `agent-handoffs/reports/`, no existing
  file modified, fresh fetch + plain fast-forward, stop on any other delta; inbox flip not covered).
- No repository-owned Remote Control / permission policy file exists (no `.claude/` in the repo). The auto-mode
  classifier is outside repository control: **external configuration is still required**. Claude Code allow
  rules match command text, not commit contents, so the contract cannot be encoded without granting broad
  `git push`; none was added. Reusable Founder sentence (also in `RELEASE_AUTHORITY.md`):

> I authorize a report-only publication to main: one commit that only adds new file(s) under
> agent-handoffs/reports/, modifies no existing file, fast-forwards freshly fetched origin/main without force,
> and stops on any other delta.

- Durable option (not built): a dedicated `publish-report-only` tool that enforces conditions itself and can be
  allow-listed by exact command. The proposed publisher patch's default mode is that tool for completion reports.

## 7. Tests / verification

- `python3 -m unittest discover -s agent-handoffs/tools -p 'test_*.py' -v`: **17/17 OK**. Covers: audit reject,
  design report reject, implementation candidate reject, report-only incident reject, Server-only deploy reject,
  accepted Build 90 TestFlight release allow, restore-over-misplaced allow, build regression reject, same-build
  SHA swap reject, failed/partial release reject, latest.md mismatch reject, and replay of real commits
  (63bf054e refused, 786432ca refused, 57877afc allowed, 83552509 allowed, unchanged pointer passes).
- Guard on candidate range: PASS. `git diff --check` clean. Changed-path audit: only `agent-handoffs/**` + `docs/CODEX.md`.
- No repository handoff protocol test suite existed before this task; the publisher/inbox tools have no tests.
- Patched publisher sandbox dry-runs: see the addendum below.

## 8. Recommended merge procedure

1. Founder reviews `a60f98f0` on `claude/handoff-release-authority-housekeeping-20261007`.
2. On approval: `git fetch origin && git push origin a60f98f0:refs/heads/main` (fast-forward only; if `main`
   moved, rebase the single commit onto it, rerun the guard + tests, then fast-forward).
3. Separately authorize installing the publisher patch: copy `agent-handoffs/tools/release_pointer_guard.py`
   into `~/.physiqueos-release/lib/` and apply the patch to `~/.physiqueos-release/bin/physiqueos-handoff-publish`.
   Until installed, non-release tasks must publish only their report (the installed publisher still rewrites
   `latest.*` on every run).
4. Add the mandatory clause from `RELEASE_AUTHORITY.md` to every non-release ChatGPT/Codex/Claude prompt.

Decisions required: merge authorization for a60f98f0; publisher patch install authorization.

## Addendum: patched publisher sandbox dry-runs

A patched copy of the publisher plus the guard ran from a scratch directory with `PHYSIQUEOS_REPO` set to this
worktree, `--dry-run` only. The installed tool was not changed and nothing was pushed by these runs.

| Run | Result |
| --- | --- |
| This task's handoff, default mode | PASS, rc 0: `mode: report-only (latest.json/latest.md unchanged)`; files: this report only |
| Same handoff with `--release-authority` | REFUSED, rc 1: `result.testflight_uploaded is not true ... MUST NOT move latest` |
| `--readme` | REFUSED, rc 1: `--readme is retired` |
| Synthetic build-91 release doc with `--release-authority` vs current main pointer | PASS, rc 0: files latest.json, latest.md, report |

This report is published as a single new file under `agent-handoffs/reports/` (the narrow report-only contract).
`latest.json` and `latest.md` on `main` are not touched by this publication. They still point at the misplaced
Build 92 candidate until a60f98f0 is merged.

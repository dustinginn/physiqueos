# Handoff housekeeping merged and guarded publisher installed (handoff-housekeeping-merge-install-20261007)

Status: **Handoff release-authority housekeeping installed and verified.**

- Agent: claude (same Remote Control conversation/worktree as the housekeeping task)
- Prompt: `agent-handoffs/inbox/prompts/20261007T164500Z-claude-merge-install-handoff-housekeeping.md` @ 70ee42d5
- Founder authorization: merge a60f98f0 + install the reviewed publisher patch.
- Previous report: `agent-handoffs/reports/20261007T162116Z-handoff-latest-pointer-housekeeping.md` (cc2f00f9)

## 1. Main

| | SHA |
| --- | --- |
| main before | `70ee42d56fc676c7751da4e4b910ee8466378469` |
| reviewed candidate | `a60f98f0` (base b36fe01b; main had since gained 14f59cc0 storage-cleanup prompt, cc2f00f9 housekeeping report, 70ee42d5 this prompt) |
| merged housekeeping SHA (rebased) | `3057bea5aab5a5f143ecbdd0c4a1e0beb8c866ab` |
| main after merge | `3057bea5aab5a5f143ecbdd0c4a1e0beb8c866ab` (ls-remote and fetch read-back match) |

The single reviewed commit was cherry-picked onto fresh origin/main (branch
`claude/handoff-release-authority-housekeeping-rebased-20261007`). There were no conflicts. Its tree delta for every
housekeeping path is identical to a60f98f0 (`git diff a60f98f0 3057bea5 -- <housekeeping paths>` empty). No
intervening report or prompt was modified or deleted (`--diff-filter=DM` on reports/ and inbox/ empty). Build 91 and
Build 92 reports all remain. Changed paths are only `agent-handoffs/**` + `docs/CODEX.md`. The push was a plain
fast-forward `70ee42d5..3057bea5`, with no force.

Pre-push gates on 3057bea5: guard tests 17/17 OK; `release_pointer_guard.py --base origin/main --head HEAD`
PASS ("pointer moved to accepted Native release build90-testflight-release-20261007 (build 90, native 32baf1d5)");
`git diff --check` clean.

## 2. Live main pointer (read from origin/main 3057bea5)

- task `build90-testflight-release-20261007`, testflight_uploaded true
- native_sha `32baf1d5f43120cd07088df1210e1dc84ed26a78`, native_build 90
- TestFlight delivery `68dc945f-cfaa-43bb-a1ff-d0020fed54ff` (VALID, in summary)
- full_report_path `agent-handoffs/reports/20261007T025954Z-build90-testflight-valid.md`
- Server snapshot at release 1b6687ff / cbe6be96. Live Server e7ffc671 is not mixed in: it appears nowhere in latest.json or latest.md.
- latest.json/latest.md byte-identical to 57877afc.

## 3. Publisher installation

| Item | Value |
| --- | --- |
| Installed publisher | `~/.physiqueos-release/bin/physiqueos-handoff-publish` |
| Original sha256 | `732cbee82c0cf187dac7628c92ee91b7d87f2a97ce99a244d4ed943d4a43a18d` (= the copy the patch was generated from) |
| Backup | `~/.physiqueos-release/state/physiqueos-handoff-publish.bak-pre-release-authority-20261007` (cp -p, sha256 identical to original; adjacent to the existing `release.conf.bak-pre-admin-key` convention) |
| Patch | `agent-handoffs/tools/physiqueos-handoff-publish.release-authority.patch` from main 3057bea5; `patch --dry-run` clean (no offset/fuzz), applied with `--fuzz=0` |
| Installed sha256 | `2bd4e1b0c0f47b80bb38f1ecbbf8ac0947e39d5c10b4ed87dbf3f52cbe4b3781` |
| Installed guard | `~/.physiqueos-release/lib/release_pointer_guard.py` (mode 600) sha256 `cce4458f3f3ad0765d23d131191bc9daf8733fbbadb7c49eeac963c74d097faa` = repo `agent-handoffs/tools/release_pointer_guard.py` @ 3057bea5 |

No hand edits were made around the patch. `physiqueos_handoff_lib.py`, `physiqueos-inbox`, `physiqueos-asc-upload`,
config, credentials and Claude permission/allow rules were not touched.

## 4. Installed-tool validation (dry-run only; `PHYSIQUEOS_REPO` = this worktree; nothing committed or pushed)

| Case | Result |
| --- | --- |
| A ordinary report, default mode | PASS rc 0: `mode: report-only (latest.json/latest.md unchanged)`; files: one new `reports/` file only |
| B non-release task with `--release-authority` | REFUSED rc 1: `result.testflight_uploaded is not true ... MUST NOT move latest` |
| C1 synthetic valid Build 91 release, default mode | PASS rc 0 as report-only: the pointer is not moved without explicit mode |
| C2 same with `--release-authority` | PASS rc 0: `mode: RELEASE AUTHORITY`; files latest.json, latest.md, report (guard accepted 90 -> 91 against live main pointer) |
| D legacy `--readme` | REFUSED rc 1: `--readme is retired` |
| Extra: Build 89 doc with `--release-authority` | REFUSED rc 1: `native_build would go backwards (90 -> 89)` |
| E repository guard suite | 17/17 OK (before merge, after install) |

origin/main stayed `3057bea5` through all dry-runs.

## 5. Rollback

Not needed: validation passed. The backup is retained. To roll back:
`cp -p ~/.physiqueos-release/state/physiqueos-handoff-publish.bak-pre-release-authority-20261007 ~/.physiqueos-release/bin/physiqueos-handoff-publish`
(expect sha256 732cbee8...) and optionally remove `~/.physiqueos-release/lib/release_pointer_guard.py`.

## 6. Permission contract

- The repository has no file that controls the external permission classifier (no repo `.claude/` policy). None was added.
- No broad `git push` allow rule or other permission change was made.
- The installed guarded publisher is now the durable narrow local enforcement: its default mode publishes only
  new report files (plus the inbox flip with `--inbox-task-id`) and refuses to move latest without a valid
  `--release-authority` transition.
- Report-only publication still needs whatever execution authorization the external classifier asks for. The tool
  enforces the content scope.

## 7. This completion report

Published with the installed publisher in default report-only mode. It adds only this new file under
`agent-handoffs/reports/`, and latest.json/latest.md stay Build 90.

## 8. Boundaries

There were no product, Native or Server source changes. Nothing changed in production, deploys, Build 91/92
candidates, Xcode builds, TestFlight, archives or credentials.

Note: the installed publisher's commit trailer still reads `Co-Authored-By: Claude Sonnet 5`. That is pre-existing
and was left unchanged, because the instruction was to apply the reviewed patch exactly.

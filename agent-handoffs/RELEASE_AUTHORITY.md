# Release authority: who may move `latest.json` / `latest.md`

**Rule.** `agent-handoffs/latest.json` and `agent-handoffs/latest.md` are the latest **ACCEPTED NATIVE
RELEASE AUTHORITY**. They are not the latest agent task or report. **Only an accepted Native release workflow
may move them.** Every other task leaves both files byte-for-byte unchanged.

| Task class | Publishes | `latest.json` / `latest.md` |
| --- | --- | --- |
| Audit, investigation, design, options/visual package | timestamped report under `agent-handoffs/reports/`; artifacts on its own branch | **MUST remain unchanged** |
| Report-only task, checkpoint, review | timestamped report | **MUST remain unchanged** |
| Implementation candidate (Native or Server), integration candidate, release candidate not yet uploaded | timestamped report; candidate on its branch | **MUST remain unchanged** |
| Production incident audit, hotfix candidate, repair report | timestamped report | **MUST remain unchanged** |
| Server production deploy | timestamped report | **MUST remain unchanged** (no Server pointer exists; see below) |
| Accepted Native release (guarded TestFlight upload, delivery **VALID**) | timestamped report **and** `latest.json` + `latest.md` | may move, once, at the accepted point |

The accepted release point is the existing release sequence step "Apple accepted: delivery VALID" from the
guarded API-key upload tool. In the handoff schema that is a completed, successful handoff with
`result.testflight_uploaded: true`, an integer `authority.native_build` and `authority.native_sha`.

## Field semantics of the release pointer

- `authority.native_sha` / `authority.native_build`: the released Native build.
- `authority.production_server_sha` / `authority.production_deployment`: a **historical snapshot** of the
  production Server at release time. They are not live Server authority and are not updated when the Server
  later deploys. Always reverify the live Server (health endpoint / read-only `doctl`) before relying on it.

## Three separate concepts (do not overload `latest.json`)

| Concept | Where it lives today |
| --- | --- |
| Latest accepted Native release | `agent-handoffs/latest.json` + `latest.md` (this rule) |
| Latest Server production deployment | **No pointer exists.** Live authority = production health endpoint + read-only `doctl`; history = the deploy task's timestamped report. If one is ever wanted, use a separate file (recommended name `agent-handoffs/latest-server.json`), never `latest.json`. |
| Latest agent task / report | The newest file in `agent-handoffs/reports/` (filenames start with a sortable UTC timestamp). For an inbox task: `agent-handoffs/inbox/latest.json` -> `lifecycle.completion_handoff_path`. |

A separate "latest task" pointer file is deliberately not created: it would be an existing file rewritten by
every task, which breaks the additive-only report publication contract below.

## Automated guard

`agent-handoffs/tools/release_pointer_guard.py` (stdlib Python) refuses any change to `latest.json` /
`latest.md` unless the new `latest.json` is an accepted Native release by the structured fields above, the
build does not go backwards, the same build keeps the same `native_sha`, `latest.md` is exactly the pointer
generated from `latest.json`, and `full_report_path` exists.

```
python3 agent-handoffs/tools/release_pointer_guard.py --base origin/main --head HEAD     # before any push to main
python3 -m unittest discover -s agent-handoffs/tools -p 'test_*.py' -v                    # guard regression tests
```

The tests replay the real misplaced moves (63bf054e audit/design, 786432ca Server candidate) as refusals and
the real Build 89 / Build 90 releases (83552509, 57877afc) as allowed.

The publisher `~/.physiqueos-release/bin/physiqueos-handoff-publish` lives outside the repository and, until
its proposed patch is installed, still writes `latest.json` / `latest.md` on every publish. Until then
non-release tasks must not publish through it (publish only the report, below). The proposed patch
(`agent-handoffs/tools/physiqueos-handoff-publish.release-authority.patch`) makes report-only the default,
moves the pointer only with `--release-authority` after this guard passes, and retires `--readme` (which
overwrote this protocol with a stale pointer copy on 2026-09-23).

## Mandatory clause for every agent task prompt

Paste into every Claude/Codex task prompt that is not the accepted Native release:

> `agent-handoffs/latest.json` and `agent-handoffs/latest.md` MUST remain unchanged. This task publishes only
> its timestamped report under `agent-handoffs/reports/`. Only the accepted Native release workflow may move
> the latest pointer (`agent-handoffs/RELEASE_AUTHORITY.md`).

A Native release prompt says instead: "After delivery VALID, update the latest pointer as the accepted release
authority (`--release-authority`)."

## Narrow report-only `main` publication contract

A report-only publication to `main` may be pre-authorized **only** when every condition holds:

1. it adds exactly one or more **new** files, all under `agent-handoffs/reports/`;
2. it modifies **no** existing file (so: not `latest.json`, `latest.md`, `README.md`, any protocol file,
   `inbox/latest.json`, source, config or infrastructure);
3. `main` was freshly fetched and the push is a plain fast-forward of `origin/main` (never force);
4. before pushing, `git diff --name-status origin/main..HEAD` shows only `A agent-handoffs/reports/...`;
5. any unexpected delta (another path, a modification, a non-fast-forward rejection) stops the operation.

An inbox completion flip edits `agent-handoffs/inbox/latest.json` (an existing file) and is therefore **not**
covered; it needs normal authorization. Nothing here relaxes protection of code, config or `main`.

The Claude permission classifier (auto mode) and Remote Control policy live **outside this repository**; no
repository file can grant this permission. The Founder pre-authorizes it per task with this exact sentence:

> I authorize a report-only publication to main: one commit that only adds new file(s) under
> agent-handoffs/reports/, modifies no existing file, fast-forwards freshly fetched origin/main without force,
> and stops on any other delta.

Claude Code permission rules match command text, not the files a commit touches, so this contract cannot be
encoded as a settings allow rule without granting broad `git push`; do not add one. Durable pre-authorization
would need a dedicated publish-report-only tool (a future option, not built here) that enforces conditions 1-5
itself and could then be allow-listed by exact command.

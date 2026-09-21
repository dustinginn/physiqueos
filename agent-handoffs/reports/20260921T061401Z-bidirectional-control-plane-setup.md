# Bidirectional control-plane setup: detailed report

Task id: `bidirectional-control-plane-setup-20260921`
Agent: claude
Generated (UTC): 2026-09-21T06:14:01Z
Repository: dustinginn/physiqueos (branch `main`)

## Scope

Add the reverse direction (ChatGPT -> GitHub -> Claude/Codex) to the already-proven agent -> ChatGPT completion
handoff, so the Founder can say only "Read the latest PhysiqueOS task from GitHub and execute it." Control-plane
setup only. Out of scope and not done: application behavior, deployment, Native build, production data, App
Store Connect credentials, Build 48, and executing the published test task.

## Authority (re-verified read-only during this task)

- Base: `origin/main` = `25003f9e3148d2e46e1b22d75d8d0619843f8566` (the earlier protocol-install handoff).
- Production Server SHA `714dcaef03a28f53f7f34f1d825419b253744b53`: active deployment
  `7292d936-bd71-4f1b-b242-acf740f1557f` reports it for web and worker; `combined-app-platform-cutover` points at
  the same commit and was not touched.
- Native Build 47 SHA `f372699fc6dfd4501d77c2a570a80c00d256a0ec` (local worktree; not pushed to GitHub).
- `authority.final_sha` records the last work commit, `884e5d71656561d0263e1c54202fdc8a22fb251d` (the test task).

## Implementation

Commits on `main` (each verified against the remote):

1. `11c2988705c7a90f2dcf76247f2791e73393a69b` docs: `agent-handoffs/README.md` rewritten for both directions and
   `docs/CODEX.md` gets a four-line additive pointer. Only those two files changed.
2. `884e5d71656561d0263e1c54202fdc8a22fb251d` inbox: `agent-handoffs/inbox/latest.json` and the immutable prompt
   `agent-handoffs/inbox/prompts/20260921T060902Z-github-bidirectional-transport-test-20260921.md`. Only those two
   files changed.
3. This completion handoff (latest.json, latest.md pointer, this report), published separately.

Repository instruction files: only `docs/CODEX.md` exists (identical on `main` and the production branch). There is
no `AGENTS.md` or `CLAUDE.md`. The pointer therefore went into `docs/CODEX.md` only. An existing unit test asserts
specific mobile-first phrases in that file; the change is purely additive and those assertions were rechecked.
No new instruction files were invented.

Protocol design (documented in the README):

- Branch model: `main` is the control/handoff branch; production deploys from `combined-app-platform-cutover`;
  handoff pushes cannot trigger a deployment; application authority is always independently reverified; no
  application code moves onto `main`.
- Inbox schema v1: `task {id,title,status ready|claimed|completed|cancelled}`, `target {agent claude|codex|either,
  reasoning, chat_preference}`, `repository`, nullable `authority.expected_*`, `prompt_path`,
  `instructions {reverify_authority, publish_completion_handoff}`, optional `lifecycle`, and `safety`
  (`safe_for_agent_retrieval`). The prompt Markdown is authoritative; the JSON is routing metadata.
- Agent behavior, conversation-context rule (GitHub task and current authority win over stale chat), prompt security
  boundary, and the statement that a prompt cannot authorize disclosing secrets, force-pushing, bypassing gates, or an
  unrequested irreversible action.
- Task identity: the completion `task.id` must equal the inbox task id. No completion schema change was needed;
  `--inbox-task-id` enforces it.
- Replay/claim safety without locks or production state: unique ids; status check; refusal of completed/cancelled
  tasks; refusal when a completion already exists for the id (outbound latest.json id or a
  `handoff(<agent>): <id>` commit on main); completion flips the inbox to `completed`; an optional lightweight `claim`.

Local tooling (outside the repository, in `~/.physiqueos-release/`):

- `lib/physiqueos_handoff_lib.py`: one shared sanitization scan, git/worktree helpers, and inbox schema validator so
  both directions use the same gate.
- `bin/physiqueos-inbox`: `publish` (gate, uniqueness, immutable prompt, refuses to overwrite an open task without
  `--supersede`), `fetch` (agent consumption gate, prints the prompt only after every check), `claim`, `cancel`.
- `bin/physiqueos-handoff-publish`: refactored onto the shared lib; new `--inbox-task-id` enforces identity, refuses
  replays, and marks the inbox completed in the same commit.
- All tools work in a throwaway worktree on fresh `origin/main`, stage only expected paths (refusing if the staged set
  differs), never force-push, and verify the remote afterward. No active worktree is touched.

## Tests

- Inbox publisher: 40 dry-run cases, each asserting the specific guard that fires (schema, statuses, target agent, id
  format, wrong repository, stale timestamp, each unsafe safety flag, bad/traversal/absolute/mismatched prompt path,
  missing/empty prompt, prompt lacking task id, pre-filled lifecycle, and secret/PII/raw-dump patterns: PEM, JWT,
  DigitalOcean and GitHub tokens, credential URLs, database strings, password assignment, bearer, email, oversize
  file, very long line, base64 blob, data URI, secret in metadata).
- Unexpected staged files: 3 cases (untracked extra, pre-staged extra, modified unrelated tracked file) refused before
  any commit. Wrong repository: refused for publish and fetch.
- Completion publisher regression after the refactor: 16 cases plus 7 more after the scanner fix (including a check
  that path-masking cannot hide a blob).
- Sandbox lifecycle rehearsal against a local bare remote (URL carries the repo slug): 37/37 covering fetch refusals
  (wrong agent, completed, cancelled, claimed without/with resume and by another agent, missing prompt, tampered
  prompt, stale, schema violation, unsafe flag, missing inbox), replay evidence (outbound id, completion commit), claim,
  identity enforcement, completion flip to `completed`, and post-completion refusals. The real test task was not used.
- Real remote, read-only: `fetch` reports the test task executable for claude and refused for codex; no claim made.
- Remote verification: each publish confirmed head, changed-file set, and byte-identical contents.

Defect found and fixed: the long `prompt_path` string tripped the base64-blob pattern, failing the valid dry run and
masking the intended failures of the secret-pattern cases. Fixed by masking only strictly-structured handoff paths
for that one check; the harness now asserts the specific guard per case so masking cannot recur silently.

## Review

No independent review; documentation and tooling only.

## Deployment

None. No Server, Native, TestFlight or infrastructure action.

## Production mutation

None. Production was only read (active deployment record and branch heads).

## Test task published, not executed

`github-bidirectional-transport-test-20260921`: status `ready`, target claude, unclaimed, marker
`PHYSIQUEOS_BIDIRECTIONAL_TASK_TEST_V1`. Its prompt asks only for retrieval and marker verification, read-only
authority reverification, and a completion handoff with the same task id. It was intentionally not executed here and
its completion handoff was not created here.

## Acceptance

Setup commit changes only `agent-handoffs/README.md` and `docs/CODEX.md`; the inbox commit changes only the two inbox
files; no application source in either. The end-to-end reverse test is pending the Founder telling Claude to read and
execute the latest GitHub task.

## Unexpected findings

- Scanner false positive found and fixed (see Tests).
- Only `docs/CODEX.md` exists as an instruction file; it lives on `main` and the production branch, but the pointer is
  only on `main`. Agents in worktrees on other branches will not see it, so discovery currently relies on the Founder's
  explicit sentence and the assistant's memory.
- Native SHA `f372699f` remains local-only.

## Open issues and decision boundaries

Founder decisions: (1) add root AGENTS.md/CLAUDE.md pointers and/or propagate the pointer to working branches;
(2) confirm ChatGPT can write files to the repo via its GitHub connection (untested; an agent can publish on its
behalf with the inbox tool otherwise). Not done: Build 48, pushing the Native branch.

## Final flags

- BIDIRECTIONAL_PROTOCOL_INSTALLED: YES
- TEST_TASK_PUBLISHED: YES (status ready; not executed)
- INSTRUCTION_FILES_UPDATED: YES (docs/CODEX.md only)
- PRODUCTION_MUTATED: NO
- DEPLOYED: NO
- TESTFLIGHT_UPLOADED: NO
- APPLICATION_CODE_CHANGED: NO
- CONTAINS_SECRETS: NO
- CONTAINS_CREDENTIALS: NO
- CONTAINS_PRODUCTION_EXPORTS: NO
- CONTAINS_FOUNDER_EVIDENCE: NO
- SAFE_FOR_CHATGPT_RETRIEVAL: YES

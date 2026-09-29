# Handoff protocol setup: detailed report

Task id: `handoff-protocol-setup-20260921`
Agent: claude
Generated (UTC): 2026-09-21T05:55:04Z
Repository: dustinginn/physiqueos (branch `main`)

## Scope

Formalize the GitHub agent-handoff protocol proven by the earlier transport test (ChatGPT retrieved
`agent-handoffs/latest.md` directly through its GitHub connection), so the Founder no longer copies
completion reports between agents. Replace the test-only artifact with: a README documenting the protocol,
a compact machine-readable `latest.json`, an immutable `reports/` directory, and a sanitization-gated
publisher. Explicitly out of scope: Build 48, any application/Server/Native change, deployment, TestFlight,
infrastructure, credentials.

## Authority (re-verified at handoff time, read-only)

- Base: `origin/main` = `2d69065c588fed6eb066c6c9160fd899ba45a016` (the transport-test commit).
- Production Server SHA: `714dcaef03a28f53f7f34f1d825419b253744b53`. The active deployment record
  `7292d936-bd71-4f1b-b242-acf740f1557f` (ACTIVE) reports this commit for both web and worker, and the
  remote branch `combined-app-platform-cutover` points at the same commit.
- Native Build 47 SHA: `f372699fc6dfd4501d77c2a570a80c00d256a0ec` (worktree `native-build47`, branch
  `codex/build47-native-closure`, clean tree). This commit is not on GitHub (see unexpected findings).
- No implementation commit exists for this task; `authority.final_sha` is therefore null. The handoff commit
  is the most recent commit that touched `agent-handoffs/latest.json`.

## Implementation

Published to `main` (files under `agent-handoffs/` only):

- `README.md`: purpose, layout, schema v1, field notes, security boundary, publication procedure, and how
  ChatGPT consumes the handoff.
- `latest.json`: compact schema-v1 handoff describing this setup task.
- `latest.md`: replaced the test marker with a short human-readable pointer generated from `latest.json`
  (not authoritative).
- `reports/20260921T055504Z-handoff-protocol-setup.md`: this report (immutable).

Local tooling (outside the repository, not published):

- `~/.physiqueos-release/bin/physiqueos-handoff-publish`, a stdlib-only Python tool that:
  1. validates `latest.json` against the schema (exact top-level keys, types, enums, lowercase hex SHAs,
     recent `generated_at_utc`, report path pattern, safety flags must be all-clear);
  2. scans `latest.json`, the report, the README and the generated pointer for credential and PII patterns
     (PEM blocks, JWTs, DigitalOcean/GitHub/other token prefixes, credential URLs and assignments, database
     connection strings, email addresses, data URIs, long base64 blobs) and enforces size and line-length
     caps as a raw-export guard;
  3. refuses if the report path already exists on `origin/main` (reports are immutable);
  4. builds the commit in a throwaway worktree on a fresh `origin/main`, so no active worktree is touched;
  5. stages only the expected `agent-handoffs/` paths and refuses if the staged set differs;
  6. pushes without force (one retry on a race, never force), then verifies the remote: head matches,
     the commit changed only the intended files, files are byte-identical, `latest.json` parses, and
     `full_report_path` resolves.
  A publication failure exits non-zero and has no effect on production state.

Design decision: handoffs go to `main`, not the production branch. Production deploys from
`combined-app-platform-cutover` (a plain git source with no deploy-on-push), and `main` has no CI workflows,
so a handoff push cannot trigger or alter a deployment.

## Tests

The gate was exercised before publication using dry runs only (no push): one passing baseline and 23
negative cases covering schema/keys/types, unsafe safety flags, stale timestamp, bad SHA, wrong repository,
report path traversal, missing task id in the report, each credential/PII/raw-dump pattern class, oversize
file and overlong line. All 24 behaved as expected (baseline exit 0; every negative exit 1 with the intended
failure). Post-publication remote verification results are produced by the publisher itself and reported to
the Founder in chat.

## Review

No independent review was run. This is a documentation and tooling setup task with no application code.

## Deployment

None. No Server, Native, TestFlight or infrastructure action was taken.

## Production mutation

None. Production was only read: the active deployment record and remote branch heads were queried
read-only to record authority values. No production data was accessed.

## Acceptance

Acceptance criteria from the Founder request: protocol files exist on the remote; `latest.json` is valid
JSON; `full_report_path` resolves; the report exists; safety fields are correct; the remote commit contains
only the intended handoff files. The publisher's remote verification checks each of these.

## Unexpected findings

- Native Build 47 SHA `f372699f` exists only in a local worktree; its branch has not been pushed, so
  ChatGPT can read the SHA but cannot resolve the commit on GitHub. Nothing was pushed because it was not
  requested.
- `main` is far behind production (last non-handoff commit dates from August 2026). Safe for handoffs, but
  it means the handoff files sit on a stale branch relative to the code they describe.
- The local `main` branch is behind `origin/main` by the handoff commits. Harmless.
- The Founder-facing instruction for agents lives in the README and in the assistant's local memory, not in
  a repository instruction file, so Codex will not follow it automatically yet.

## Open issues and decision boundaries

Founder decisions:

1. Whether to add a short pointer to `agent-handoffs/README.md` in the repository `AGENTS.md`/`CLAUDE.md`
   so Codex follows the protocol. This edits files outside `agent-handoffs/`, so it was not done here.
2. Whether `main` remains the handoff branch.

Not decided or done here: pushing the Native Build 47 branch; any Build 48 work.

## Final flags

- HANDOFF_PROTOCOL_INSTALLED: YES (pending remote verification by the publisher)
- PRODUCTION_MUTATED: NO
- DEPLOYED: NO
- TESTFLIGHT_UPLOADED: NO
- APPLICATION_CODE_CHANGED: NO
- CONTAINS_SECRETS: NO
- CONTAINS_CREDENTIALS: NO
- CONTAINS_PRODUCTION_EXPORTS: NO
- CONTAINS_FOUNDER_EVIDENCE: NO
- SAFE_FOR_CHATGPT_RETRIEVAL: YES

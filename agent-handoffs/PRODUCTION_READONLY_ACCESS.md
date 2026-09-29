# PhysiqueOS production read-only access for agents

## Purpose

This is the standing discovery pointer for Claude and Codex when a PhysiqueOS task needs bounded production inspection.

It documents **how to find and use the already-approved read-only path**. It does not grant production-write authority, and it contains no credentials or secret values.

## Approved path

On the Founder's PC, the established production read-only runner is in:

`C:\Users\dusti\Documents\GitHub\physiqueos`

Runner:

`.tmp/digitalocean/run-app-console-context-gzip-source-on-open.mjs`

The runner uses a saved DigitalOcean CLI context named:

`physiqueos-final-cutover-config`

Invocation shape:

`<runner> <saved-context> <verified-app-id> <verified-component-name> <gzip-base64-node-source>`

Historical app/component identifiers may appear in old handoffs, but they are **hints only**. Reverify current application authority and the current component before every production inspection. Never assume an old app id, deployment id, component, SHA, schema version, or owner scope is still authoritative.

The runner executes bounded Node audit code inside the production App Platform component and consumes the component's existing production database URL / CA bindings internally.

## Hard safety contract

Every production SQL audit must:

1. Be diagnostic/read-only only.
2. Start a transaction with `BEGIN READ ONLY` (use REPEATABLE READ when a stable multi-query snapshot is needed).
3. Explicitly verify `transaction_read_only = on` before reading application data.
4. Use bounded, owner-scoped SELECT queries only.
5. Avoid bulk exports and avoid returning raw Founder evidence/media when a structural or summarized result is sufficient.
6. `ROLLBACK` at the end, including error paths where possible.
7. Print only sanitized diagnostic output and a unique success marker.
8. Stop on 401/403, unavailable console access, missing production bindings, read-only verification failure, ambiguous owner scope, authority mismatch, or any requirement for mutation.

## Secrets and credentials

Never:

- paste, print, export, decrypt, log, commit, or store production database credentials;
- copy production database URLs, CA material, DigitalOcean tokens, or other secret environment values into prompts, source, shell history, GitHub handoffs, scratch files, or reports;
- create a local `.env` containing production credentials;
- manually decrypt credentials;
- expose secret values merely to prove that a binding exists.

The production component already has the required bindings. The runner is specifically intended to avoid moving those credentials onto the local machine or into agent context.

## Authority and scope

Before an audit:

- independently reverify current production Server SHA/deployment/component;
- independently identify the Founder/owner scope required by the task;
- treat task/handoff authority values as hints, not facts;
- keep queries narrowly scoped to the records needed for the diagnosis.

Read-only access is not permission to repair, replay, confirm, dismiss, enqueue, regenerate, deploy, alter outbox state, modify evidence, or perform any other production write. Any mutation requires separate explicit authorization and its own guarded path.

## Mac / Remote Control sessions

Normal Claude Remote Control Native sessions run on the Mac. The approved runner above is a **PC production-inspection path**. If the task requires production inspection and the current Mac session cannot reach that approved path through an already-established authorized mechanism, do not invent a new credential path and do not weaken permissions.

Instead:

- continue source/local analysis that is independently valid;
- clearly mark conclusions that require production evidence as unproven;
- report that the approved PC read-only audit is required;
- stop the affected diagnosis if production evidence is necessary for correctness.

A task may explicitly establish another approved read-only path in the future. Until then, absence of PC access is a stop condition, not permission to improvise.

## Agent startup rule

When a new Claude or Codex task requires production inspection, read this file before attempting production access. If the GitHub task has stricter limits, the task wins. If current authority conflicts with historical documentation, current verified authority wins.

# DEXA Event presentation-only republication (October 9 2026)

Status: candidate on `claude/dexa-oct9-presentation-republication-20261009`, based on
production Server `5e91aa5d`. Not deployed and not needed in the deployed image: the
operation runs as a console payload. Preview has been run read-only; apply has not.

## Why not `regenerate`

The October 9 DEXA Event was published on `539f7006`, before the plain-language
presentation. The existing `regenerate` path re-runs Confidence finalization in
`publish-successor` mode against the current snapshot, which is this briefing's own
assessment, so it would publish a successor assessment (history 34 to 35) and could
change the published 70% (down from 80). This operation re-words the stored record
only.

## What it changes, and what it cannot change

`DexaEventPresentationRepublication` composes the new text with the deployed
`composeDexaEventPlainLanguage` from the stored briefing and the stored assessment's
narrative plan; nothing is recomputed. The goal-progress band comes from the stored
outlook fraction and must agree with the stored V3 meaning sentence.

A whole-record diff must fall inside this allowlist, or the plan refuses:

* `hero.title`, `hero.body`
* `hero.results[i].label` and `.context` (values and emoji unchanged)
* `interpretation.*` (including the evidence note: supporting evidence, uncertainty)
* `coachInsight.biggestWin|protect|watch|next`
* `plainLanguage` (schema, claims, and the republication audit block; apply adds
  the authorization reference, time and command id)

Everything else is byte-for-byte identical, including `confidencePublication`,
`goalConfidence`, `narrativeV3`, progress, snapshot, references, evidence binding,
`updatedAt` and the row's metadata columns. No other row is written.

## Modes

Build with `scripts/operations/buildDexaPresentationRepublicationPayload.mjs`. The
builder refuses a `--sha` whose composer, write path or authority store differs from
what it bundles, or whose presentation path does not publish plain language. Run each
payload with the accepted console runner on `web`. The printed JSON holds real
identifiers and scan values: keep it in local operator scratch, mode 600, never
published.

1. **Preview** (`--mode preview`, read-only bundle with no write path):
   `BEGIN REPEATABLE READ READ ONLY`, `transaction_read_only = on`, owner-scoped SELECTs,
   ROLLBACK. Prints the rewrite, its changed paths and the seal: owner digest, record id
   and version, record digest, assessment id/version/digest, Confidence binding digest,
   snapshot pointer, linked fingerprints (assessment, Confidence history and snapshots,
   canonical and legacy scan, DEXA analyses, Apple Health receipts, other DEXA Events),
   before/after presentation digests and the preserved-fields digest.
2. **Founder** reviews the sanitized preview and gives a separate authorization reference.
3. **Apply** (`--mode apply --seal <scratch>/seal.json --authorization-ref <ref>`): one
   `executePostgresFounderRecordMutation` (owner advisory lock, runtime authority
   boundary, row FOR UPDATE). Inside it every fact is re-read with row locks and
   re-planned; anything other than an exact seal match refuses (`SEAL_DRIFT`, or the
   specific refusal) and rolls back with nothing written. Otherwise one UPDATE fenced on
   version 1, the runtime revision bump, COMMIT. Re-running reports `already_applied`.
4. **Postflight** (`--mode postflight --seal ...`, read-only): version advanced once, the
   record is the sealed rewrite, preserved fields, Confidence binding, assessment,
   snapshot and every linked fingerprint unchanged.

Refusals include: not exactly one briefing for the scan date; owner or identity
mismatch; version not 1; already plain language; presentation version differs;
Confidence not 70 from 80 (decrease) or binding mismatch; assessment not singleton or
not published by this briefing; snapshot not pointing at it; runtime authority not
writable or first-write boundary not recorded; band unavailable or uncorroborated;
change outside the allowlist; tiles change shape; row metadata would be rewritten.

## Rollback

The apply changes one row, and that row carries the text it replaced
(`plainLanguage.republication.previousPresentation`: title, body, tile labels and
contexts, interpretation, Coach's Insight). Restoring those fields and removing
`plainLanguage` reproduces the stored record exactly (pinned by the tests). The
restore would be one more named-record mutation fenced on version 2, a separate
authorized act. Confidence, history, snapshot and evidence never change, so nothing
else needs restoring.

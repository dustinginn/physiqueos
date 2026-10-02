Priority Skip follow-up — peptides + Foam Rolling notification capability

TASK TYPE

Claude focused Native/Server-contract follow-up after Build 78.

Keep isolated from Codex Home Screen Widget work.

READ FIRST

Build 78:
agent-handoffs/reports/20261002T010500Z-native-build78-completion-notification-polish.md

Backlog:
agent-handoffs/backlog/PHYSIQUEOS_PRODUCT_BACKLOG.md

GH protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

BASE

Exact Build 78 source:
5911dd2a6f968c5a355ec68d3313f0e5e644d529

FOUNDER REQUIREMENT

1. Peptides MUST be skippable.
2. Foam Rolling MUST expose Skip from its actionable notification.

Peptide Complete remains specialized/dose-aware.

Skip is an independent capability from completion mode.

A. AUDIT FIRST

Audit exact current Server + Native semantics for:
- peptide Priority detail;
- peptide notification contract;
- Support priority types;
- Foam Rolling Priority detail;
- Foam Rolling notification contract;
- priority.skip.v1;
- completionContext/dose/protocol;
- notificationAction;
- skip command/capability;
- occurrence lifecycle;
- Home reconciliation.

Reverify current production Server authority if Server source changes may be required.

B. CANONICAL CAPABILITY MODEL

Target semantics:

A Priority occurrence can independently have:
- plainCompleteAllowed;
- specializedCompleteAllowed;
- skipAllowed;
- snoozeAllowed;
- requiresDetail/input.

Specialized completion MUST NOT imply skip=false.

Peptide:
- Complete planned dose remains dose-aware;
- "Took a different amount" remains available in detail;
- Skip = intentionally did not take the peptide for this occurrence;
- Skip records NO dose;
- skipped occurrence is canonical skipped state;
- Home/detail/notification reconcile.

Foam Rolling:
- already skippable in Priority Detail;
- notification should expose Skip;
- canonical same priority.skip.v1 path.

C. SERVER-OWNED SKIP CAPABILITY

Build 78 documented that Native currently guesses Skip eligibility because notificationAction lacks an explicit skipCommand.

Fix that architectural gap if feasible.

Preferred additive contract:
notificationAction includes explicit skip capability/skipCommand when the exact occurrence may be skipped.

Native renders Skip based on Server-owned contract, not Priority name/type.

Requirements:
- peptide notification gets explicit Skip;
- Foam Rolling notification gets explicit Skip;
- unsupported Support priorities do not accidentally get Skip;
- old Build 78 payloads remain decode-compatible;
- old clients fail soft/ignore additive field.

Do not broaden Server changes beyond this capability contract.

D. PEPTIDE DETAIL UI

Add canonical Skip affordance to peptide Priority detail.

Placement should be clear but subordinate to Mark Complete.

Do not require editing dose to Skip.

If existing generic Mark Skipped UI can be safely reused, use it.

Haptic:
- existing Build 78 Skip haptic applies after canonical acknowledgement.

E. PEPTIDE NOTIFICATION

Actions should preserve:
- Complete using Server-planned dose/protocol;
- Skip using canonical skipCommand;
- Snooze.

No plain Complete path.

Skipping must not write:
- amountTaken;
- dose;
- completionContext as completed dose;
- evidence claiming administration.

F. FOAM ROLLING NOTIFICATION

Expose:
- Complete if current canonical contract permits direct completion;
- Skip;
- Snooze where currently supported.

If completion is specialized/open-only, do not broaden Complete merely to add Skip.

Skip alone may be available independently.

G. FAILURE / IDEMPOTENCY

Test:
- duplicate Skip;
- stale version;
- already skipped;
- already completed;
- past/future occurrence;
- unsupported;
- network failure;
- background notification response;
- app foreground;
- locked/auth required;
- Home/detail reconciliation.

No fake local skipped state.

H. SERVER TESTS IF CHANGED

If Server contract changes:
- additive backward compatibility;
- exact occurrence capability;
- peptides;
- Foam Rolling;
- unsupported Support;
- skipCommand identity/version;
- no dose on skip;
- completion semantics unchanged;
- notification serialization;
- no strategic/briefing impact.

Deploy Server only if:
- additive;
- independently reviewed;
- tests green;
- backward compatible;
- no historical mutation.

Use guarded production workflow and verify live/ready/SHA parity.

I. NATIVE TESTS

- decode old/new notificationAction;
- capability resolver;
- specialized Complete + Skip coexist;
- peptide detail Skip;
- peptide notification actions;
- Foam Rolling notification Skip;
- unsupported no Skip;
- dose/protocol cannot route plain Complete;
- skip writes no dose;
- notification reconciliation;
- haptic after success;
- Build 78 notification regressions.

J. RELEASE COORDINATION

DO NOT independently bump/upload a Native build.

Codex is concurrently implementing Home Screen Widget V1.

Produce a clean reviewed patch branch based on Build 78 and STOP at integration-ready.

The next Native release should consolidate:
- this Skip patch;
- Codex Home Screen Widget candidate;
unless Founder explicitly changes scope.

If a Server additive contract must deploy first, that Server deployment may proceed independently after review, but Native upload waits for consolidation.

K. REPORT

Publish to origin/main:
agent-handoffs/reports/<timestamp>-priority-skip-peptides-foam-notification.md

Include:
- exact Native candidate;
- Server candidate/deployed SHA if any;
- contract change;
- peptide semantics;
- Foam semantics;
- tests/review;
- integration instructions for consolidated Native build.

Follow mandatory GH-main protocol.

END TASK.

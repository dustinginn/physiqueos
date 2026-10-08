# Build 93 Mac console recovery correction — Static Hold and historical Super Set read-only audit

Task id: `build93-mac-console-historical-audit-correction-20261008`

Source assignment: `agent-handoffs/inbox/prompts/20261008-codex-mac-console-recovery-correction.md` at `11ad6ad4`.

Status: **BOUNDED PRODUCTION READ-ONLY AUDIT COMPLETE; EXACT CORRECTIONS PREVIEWED; APPLY HOLD.**

No credential change, production write, seed/APPLY, deployment, build bump, Xcode action, or TestFlight upload occurred. Accepted release pointers remain unchanged.

## Executive result

The October 2 Mac recovery was valid. The exact approved portable runner was recovered and verified byte-for-byte, the saved least-privilege context retained the required App Platform and component-console authority, and both audits completed against the current active production runtime in repeatable-read/read-only transactions that explicitly verified `transaction_read_only=on` and ended with `ROLLBACK`.

The production facts now establish two exact, independent future corrections:

1. **Static Hold:** create exactly two missing per-exercise definitions: Spider Curls / Static Hold and Pendulum Squat Machine / Static Hold. Do not rewrite evidence.
2. **Historical Super Set:** correct exactly three active Training sessions (six occurrences) by removing the misclassified `super_set` execution variant and adding one ordered `superset` relationship group per session. Preserve all 22 affected set entries and every other session field.

Both remain **HOLD**. The Static Hold runner received no APPLY mode or authorization reference. No guarded Super Set execute utility exists yet, and no Super Set mutation is authorized.

## Corrected Mac access finding

The superseded PC-only conclusion in the October 8 source-only report was incorrect.

- Authoritative runner source: `scripts/operations/runAppConsoleContextGzipSourceOnOpen.mjs` at `4025f17560e926b7e33a1cad6757a06716b16d24`.
- Authoritative Git blob: `f7123347a43fb5dcfe8ae2a3029897d5ddb11fa7`.
- Recovered ignored Mac path: `.tmp/digitalocean/run-app-console-context-gzip-source-on-open.mjs`.
- Recovered file SHA-256: `aa2d3247917184199b718d5e7558a74cc8dcf46bf34713b3f73b8e506816a608`.
- Saved context: `physiqueos-final-cutover-config`.
- Local prerequisites passed: Node/WebSocket available, `doctl` and `js-yaml` available, exactly one protected context configuration discovered, and the runner remained ignored by Git.
- Current console executions returned the unique audit markers and exactly one remote exit status `0`.

No token, database URL, certificate, environment binding, or Founder evidence is included here. An unrelated `doctl account get` 403 remains expected for this least-privilege context and was not treated as a console failure. No credential was rotated or broadened.

`agent-handoffs/PRODUCTION_READONLY_ACCESS.md` was independently corrected on `origin/main` by narrow commit `3c35d00c058443a37beea7398eaa0724fc7337e7` while this task was running. The current runbook now explicitly preserves the verified Mac recovery path, distinguishes the expected account-endpoint 403 from a real app/console denial, and retains all SQL, owner-scope, secret, and no-write restrictions. No redundant documentation edit was made.

## Fresh production authority

Authority was checked before and after the audits and did not change:

- app: `physiqueos-foundation-staging` / `bf57cf56-48cc-4cd6-90e4-a23ee5381741`;
- active deployment: `32143aa4-90d4-496a-81b2-17f35a609fde`;
- deployment state: `ACTIVE`, 9/9 steps successful, no in-progress deployment;
- components: `web` service and `worker` worker;
- source SHA on both components: `84cc64e4e7205b2540bf78ea43afd1cbfb068d06`;
- runtime payload SHA fence: matched that same 40-hex SHA;
- owner fence: matched the configured canonical Founder owner;
- public liveness check: healthy with build id `physiqueos-84cc64e4-20261008`.

Historical app/deployment values were used only as hints until these fresh checks passed.

## Static Hold production dry run

The audited payload was built from an exact source archive of runtime SHA `84cc64e4e7205b2540bf78ea43afd1cbfb068d06`. It opened `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, verified read-only mode, used only owner-scoped reads through the canonical record store, and rolled back.

Fresh facts:

| Fact | Result |
|---|---:|
| Existing execution-variant definitions | 0 |
| Definition digest | `4f53cda18c2baa0c0354bb5f9a3ecbe` |
| Canonical evidence records | 594 |
| Evidence identity/version digest | `6a3119f32bf34442b1f122a9c3abc48b` |
| Active Training sessions | 248 |
| Spider Curls Static Hold occurrences | 4 |
| Pendulum Squat Machine Static Hold occurrences | 1 |
| Legacy `super_set` occurrences excluded from this seed | 6 |
| Predicted definition writes | 2 creates |
| Predicted evidence writes | 0 |

### Exact proposed Static Hold correction

- Create active `legacy_seed` definition `tev_2ed2b6434373f5becfed0d37091263ea` for `spider_curl`, display name `Static Hold`, key/legacy alias `static_hold`.
- Create active `legacy_seed` definition `tev_af25a36b758fb2afdebb26241b577452` for `pendulum_squat_machine`, display name `Static Hold`, key/legacy alias `static_hold`.
- Preserve all 594 evidence records and all five historical Static Hold occurrences byte-for-byte.
- Do not add duration/timed-hold semantics and do not seed any Superset variant.

### Static Hold APPLY gates

A later APPLY must require a separate Founder authorization reference bound to this exact authority and fact set. Immediately before mutation it must reverify app/deployment/runtime/owner authority, definition/evidence counts and digests, the two deterministic targets, zero conflicting definitions, and the six excluded legacy Super Set occurrences. Any drift refuses and rolls back. Maximum mutation scope is two definition records.

Post-apply, a fresh read-only check must find one active compatible definition per target, unchanged evidence count/digest, unchanged occurrence set facts, no `super_set` definition, and a replay dry run predicting zero writes.

Rollback is a separately authorized compensating operation: retire only definitions created by this apply using their exact identities and expected current versions. Never delete or rewrite historical evidence.

## Historical Super Set production census

The dedicated census opened the same fenced repeatable-read/read-only transaction, used bounded owner-scoped SELECTs, verified read-only mode, captured the minimum exact identities into a mode-0600 local private manifest, printed only a controlled success marker to the operator channel, and rolled back.

Sanitized facts:

| Fact | Result |
|---|---:|
| Active target sessions | 3 |
| Misclassified occurrences | 6 |
| Confirmed ordered Leg Extensions -> Sissy Squats pairs | 2 |
| Confirmed ordered Seated Hip Adductions -> Seated Hip Abductions pairs | 1 |
| Affected set entries to preserve | 22 |
| Existing relationship groups on target sessions | 0 |
| Structural review issues on target sessions | 0 |
| Confirmed lineage records inspected | 9 |
| Forbidden Superset definitions | 0 |
| Performance events tied to the three sessions | 6, all for unrelated exercises |

The reviewed source lineage explicitly labels both members of each pair as one Super Set and establishes the same order as the current canonical occurrence order. Pairing and order are therefore evidenced, not inferred.

Private manifest semantic digest: `afee950ee49b28c4e09fdc71520a8d1b5427f193a3e89f53a57c300b3133e905`.

Private manifest file SHA-256: `cbbfb06714682e5175e9b34b8a5dcd2eeabcaab4a77fb7c72b0efbd43654e69f`.

Exact proposed-correction manifest SHA-256: `c86292b3c06728d2cf75a7e8474c8e2a09c88533f18d1a3a57f29f0d91f37430`.

The private files remain local under `/private/tmp` with owner-only permissions. GitHub receives no storage IDs, canonical IDs, occurrence IDs, source text, dates, raw set values, or private workout evidence.

### Exact proposed Super Set correction

For each of the two confirmed Leg Extensions -> Sissy Squats sessions:

- require the exact private record identity, canonical identity, current version, full payload digest, two occurrence identities, order, and set digests;
- remove `executionVariant` only from those two existing occurrences;
- add exactly one ordered `superset` relationship group referencing those same two occurrence identities in Leg Extensions -> Sissy Squats order;
- preserve all eight set entries and every unrelated field.

For the one confirmed Seated Hip Adductions -> Seated Hip Abductions session:

- enforce the same sealed identity/version/digest checks;
- remove `executionVariant` only from those two existing occurrences;
- add exactly one ordered `superset` relationship group in Seated Hip Adductions -> Seated Hip Abductions order;
- preserve all six set entries and every unrelated field.

Across all three records: exactly six variant fields are removed and exactly three relationship groups are added. No occurrence, set, performance event, or evidence record is created or deleted; no set/reps/load value changes; no round, rest, timing, duration, or other workout fact is inferred; no `super_set` definition is created.

### Progression and performance impact

A second bounded read-only impact query inspected 21 active sessions containing the four affected exercise identities and 12 stored performance events for those exercise identities.

The correction only reclassifies the six legacy contexts:

- Leg Extensions: two occurrences / eight sets move from legacy `variant:super_set + standalone` into the already-existing ordinary + Superset-with-Sissy partition, producing four relationship-aware occurrences / 16 sets total.
- Sissy Squats: the same two occurrences / eight sets move into the matching ordinary + Superset-with-Leg-Extensions partition, also producing four / 16 total.
- Seated Hip Adductions and Abductions: one occurrence / three sets each moves from legacy variant + standalone into a new ordinary + structured partner partition.
- Ordinary standalone history remains unchanged.

None of the three target sessions has a performance event for an affected member, so the proposed correction requires zero performance-event writes. The 12 existing events for these exercise identities remain unchanged and context-separated. Focused progression tests confirm that exact variant and relationship context partitions are isolated.

### Super Set APPLY implementation gates

Before any future mutation, implement and test a dedicated guarded preview/execute service. It must:

1. Default to preview/read-only and recreate the exact three-record/six-occurrence private manifest.
2. Seal app/deployment/runtime/owner authority, record/canonical identities, current versions, full payload and set digests, occurrence ordering, lineage proof, existing relationships, structural issues, and the zero-derived-event-write conclusion.
3. Require a separate Founder authorization reference plus the intact preview digest.
4. Execute in one serializable transaction with an owner advisory lock, expected versions, an exact three-record scope, and a strict six-removal/three-addition mutation diff.
5. Refuse on any drift, supersession, ambiguity, conflicting group, missing occurrence, source-order disagreement, affected derived event, or scope expansion.
6. Verify before commit that every set digest and unrelated field is unchanged, exactly three corrected canonical revisions exist, no forbidden definition exists, and no unrelated record changed.
7. Replay as already corrected with zero writes.

Post-apply verification must run in a fresh repeatable-read/read-only transaction and prove exactly three valid groups, zero legacy fields on those members, no overlapping/dangling members, identical set digests, unchanged performance events, correct progression partitions, and a zero-write replay preview.

Rollback must be a separately authorized compensating canonical correction using the sealed pre-images and exact expected post-apply versions. It must restore all three records atomically through the canonical lineage/version mechanism, preserve every set digest, and never delete records, decrement versions, use a broad catalog reset, or partially roll back one session.

## Verification

- Exact runner Git blob check: passed.
- Runner SHA-256 check: passed.
- Saved-context and protected-config prerequisites: passed without printing secret values.
- Fresh app/deployment/component/runtime/owner checks: passed before and after the audit.
- Static Hold dry run: `transaction_read_only=on`, rollback verified, success marker, remote exit 0.
- Super Set census: `transaction_read_only=on`, rollback verified, success marker, remote exit 0.
- Super Set impact audit: `transaction_read_only=on`, rollback verified, success marker, remote exit 0.
- Focused exact-live-SHA tests: 5 files passed, 47 tests passed, 0 failed.
- Public liveness: healthy after the audits.
- Worktree: clean; active Codex and Claude candidate branches untouched.

The focused tests covered Static Hold seed scope, dry-run zero-write behavior, apply drift/idempotency/refusal, reserved Superset naming, correction-to-stable-occurrence mapping, relationship validation, and exact progression partition isolation.

One non-blocking tooling warning was observed: the existing Static Hold seed dry-run issues concurrent reads on a single `pg` client, which triggers a future-compatibility deprecation warning in the installed driver. The transaction still verified read-only mode, produced the expected result and success marker, rolled back, and exited 0. A later maintenance change should serialize those reads before a Node/driver upgrade; it does not change this audit result.

## Decision and safety

- Static Hold: exact two-definition candidate is ready for a separately authorized guarded APPLY; currently HOLD.
- Super Set: exact private correction preview is ready; guarded execute implementation, tests, and separate Founder authorization are still required; currently HOLD.
- Production reads: bounded and owner-scoped.
- Production writes: 0.
- Credential changes: 0.
- Deployments/builds/uploads: 0.
- GitHub private evidence or exports: 0.
- Release pointers changed: no.


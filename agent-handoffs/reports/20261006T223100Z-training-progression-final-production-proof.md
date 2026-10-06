# Training progression final production-read proof — doctor PASS, Founder shadow blocked

- Generated: 2026-10-06 15:31 PDT / 2026-10-06T22:31:00Z
- Task authority: `f18c8706b30b258388b419f5f2ab31833853d217`
- Operational candidate: `d789ce2770eda2f9bdb13a48bbc572901f2c61e2`
- Security-contract report: `015ba1dc70401a50410b7c644d19a53c159a4621`
- Current production Server source: `b7eb1e397f0238df9ae904fd182ddbb51602e8d8`
- Progression candidate: `999a225a38ced9ddb16a65bbe840896472265468`
- Recommendation: **DO NOT DEPLOY**
- Production deployment: **NO**
- Production mutation: **NO**
- Native Build 89 / Build 90 touched: **NO**

## Executive verdict

The final Mac zero-data proof passed all three required stages under the historically established Option B boundary. Local tooling, control-plane authority, and the real App Platform console doctor were green; the console doctor verified the exact production SHA, binding-presence booleans, one bounded database connection, `REPEATABLE READ READ ONLY`, `transaction_read_only=on`, `SELECT 1`, rollback, canonical frame, one marker, zero remote exit, and stable post-check. This makes Mac Stage 1 real-console acceptance **GREEN** for operational candidate `d789ce27`.

The subsequent single authorized Founder read did not produce an accepted result. The provider console WebSocket closed abnormally before the runner received a canonical frame, marker, or remote-exit control. The parser therefore failed closed with only `WEBSOCKET_ABNORMAL_CLOSE`; it returned no Founder rows and no shadow result. No retry was made because the task authorized one bounded Founder read.

The progression candidate's source and test evidence remains green, but the mandatory real Cable Machine Front Raises and bounded-control production shadow is unproven. The deployment decision is therefore **DO NOT DEPLOY**. This is an evidence/transport blocker, not a newly discovered progression-code defect.

## 1. Zero-data Mac doctor

All doctor stages used only the existing saved context `physiqueos-final-cutover-config`. There was no login, reauthentication, credential rotation, alternate context, or credential-value output.

| Stage | Result | Verified evidence |
| --- | --- | --- |
| Local | **PASS** | Darwin arm64; Node `v22.23.2`; doctl `1.168.0`; approved context present; owner-only configuration; operational tools tracked and clean at exact candidate `d789ce2770eda2f9bdb13a48bbc572901f2c61e2` |
| Control plane | **PASS** | App `bf57cf56-48cc-4cd6-90e4-a23ee5381741` / `physiqueos-foundation-staging`; active deployment `6fa4e887-8849-450b-b068-5bdb11b90009`; ACTIVE 9/9; no in-progress deployment; web and worker source exact `b7eb1e397f0238df9ae904fd182ddbb51602e8d8`; live health `ok`; build `physiqueos-b7eb1e39-20261005` |
| Console | **PASS** | Runtime SHA exact; database URL and CA presence `true` without values; one bounded connection; `REPEATABLE READ READ ONLY`; `transaction_read_only=on`; `SELECT 1` true; explicit rollback; canonical structured frame; success marker exactly once; remote exit zero; Option B ignored non-authoritative bounded PTY wrapper noise; post-console authority stable |

The console doctor touched no Founder table and returned no Founder record. It was the one explicitly authorized zero-data Mac console-doctor attempt.

### Option B acceptance result

The real provider console has now proved the selected security boundary end to end. Canonical frame integrity, credential scanning, output bounds, exact marker/exit controls, SQL guards, read-only transaction enforcement, rollback, owner scope when configured, sanitized report schema, and post-check remain authoritative. Provider-owned prompt/banner/echo text outside the canonical frame remains non-authoritative and is never parsed or returned.

**Operational conclusion:** Mac Stage 1 real-console acceptance is green. `d789ce27` should proceed through normal review for integration into the operational tooling/runbook. PC parity remains a later follow-up after the PC's 401 context is restored; it does not invalidate the independently successful Mac proof.

## 2. Authorized Founder read outcome

After all three doctors passed, one bounded audit was prepared with these enforced limits:

- exact runtime SHA `b7eb1e39`;
- exact owner binding, never emitted;
- one `REPEATABLE READ READ ONLY` transaction with `transaction_read_only=on`;
- SELECT-only SQL and hard row caps;
- active Training root/current version only;
- three explicit exercise identities only: `cable_machine_front_raise`, `pull_up`, and `spider_curl`;
- date window 2026-06-01 through 2026-10-06;
- finalized/non-superseded records only;
- sanitized set/load/rep, variant, and relationship context only;
- explicit rollback before structured output;
- exact report-key schema, 64 KiB report cap, credential scan, owner-ID exclusion, one canonical frame/marker/exit.

The restricted local network preflight could not request the DigitalOcean exec URL and returned `DIGITALOCEAN_EXEC_REQUEST_FAILED`; no provider console was opened in that preflight. The authorized host execution then reached the provider exec path, but the WebSocket terminated with `WEBSOCKET_ABNORMAL_CLOSE` before an accepted frame existed.

Fail-closed consequences:

- no canonical JSON frame was accepted;
- no success marker or zero-exit proof was accepted;
- no Founder record or database value was printed, retained in the repository, or included in this report;
- no active Training Strategy row was claimed;
- no Cable or control occurrence was claimed;
- no current-versus-candidate recommendation was inferred;
- no additional production attempt was made.

The payload could not write: its SQL guard accepted SELECT only, its database transaction was declared read only, and an interrupted PostgreSQL session rolls back any open transaction. No deploy or other production mutation path was invoked.

## 3. Production progression authority and shadow

| Required result | Status |
| --- | --- |
| Exactly one active Training protocol/current version | **UNPROVEN in this final read** |
| Real rule type / condition / action / successful-session count | **UNPROVEN in this final read** |
| Configured `minimumExposureDays`, if present | **UNPROVEN in this final read** |
| Cable exact identity / variant / relationship | **UNPROVEN in this final read** |
| Finalized current-load set-profile run | **UNPROVEN in this final read** |
| Qualifying count / first success / exposure days | **UNPROVEN in this final read** |
| Safe target-increment provenance | **UNPROVEN in this final read** |
| Current `b7eb1e39` recommendation | **UNPROVEN in this final read** |
| Candidate `999a225a` recommendation | **UNPROVEN in this final read** |
| Bounded Maintain control | **UNPROVEN in this final read** |
| Bounded Progression-Opportunity control | **UNPROVEN in this final read** |

No provisional history from prior reports is promoted to production evidence here. In particular, this report does not claim a qualifying count, exposure anchor, target, or progression eligibility for Cable Machine Front Raises.

## 4. Candidate evidence that remains green

The failed Founder transport does not change the already verified source package:

| Candidate gate | Result |
| --- | --- |
| Production base | `b7eb1e397f0238df9ae904fd182ddbb51602e8d8` |
| Candidate | `999a225a38ced9ddb16a65bbe840896472265468` |
| Integration topology | clean three-commit fast-forward |
| Focused progression gate | **128/128 passed** |
| Exact Phase 6 Training gate | **167/167 passed** |
| Migration/backfill | none |
| Native contract | backward-compatible additive fields; no Native progression math |
| Native Build 89 / 90 | untouched |

The candidate continues to fail closed for unsupported/ambiguous strategy data, preserves exact exercise/variant/relationship partitions, gives regression recovery precedence, anchors exposure at the first qualifying success, requires the configured session count plus the 14-day Founder floor, and refuses to invent a load without at least two compatible historical increments.

These source facts are necessary but not sufficient for production deployment. The task explicitly requires the real bounded production shadow and controls.

## 5. Deployment decision

**DO NOT DEPLOY `999a225a38ced9ddb16a65bbe840896472265468`.**

Reason: the real production Founder Training Strategy, Cable current run, and Maintain/Opportunity controls were not accepted through the bounded read. Without those results, the exact current-versus-candidate behavior, eligibility gates, context partition, and target provenance cannot be authorized.

The next production-data attempt requires fresh Founder authorization. It should use the now-proven `d789ce27` Option B tooling and the same narrow payload, while diagnosing the provider WebSocket close without printing raw console output or broadening the parser.

## 6. Prepared deploy and rollback identities — do not execute

### Deploy identity

- production ref: `refs/heads/combined-app-platform-cutover`
- expected pre-deploy source: `b7eb1e397f0238df9ae904fd182ddbb51602e8d8`
- candidate: `999a225a38ced9ddb16a65bbe840896472265468`
- required topology: exact normal fast-forward, three commits
- app hint: `bf57cf56-48cc-4cd6-90e4-a23ee5381741`, to be freshly reverified
- migration/backfill: none
- expected topology/cost change: none / `$0`

No deployment command is authorized by this report. If a later bounded production shadow is green and the Founder separately authorizes deployment, the reviewed fast-forward command remains:

`git push origin "999a225a38ced9ddb16a65bbe840896472265468:refs/heads/combined-app-platform-cutover"`

The established guarded deployment flow must then preserve the entire live spec except the four web/worker release stamps, force one rebuild, require ACTIVE 9/9, exact web/worker source/runtime identity, no pending deployment, and fully green live/readiness checks.

### Rollback identity

- rollback source: `b7eb1e397f0238df9ae904fd182ddbb51602e8d8`
- lease expectation after candidate deployment: production ref exactly `999a225a38ced9ddb16a65bbe840896472265468`

Only after a separately authorized deployment, restore the ref with the exact lease:

`git push --force-with-lease=refs/heads/combined-app-platform-cutover:999a225a38ced9ddb16a65bbe840896472265468 origin "b7eb1e397f0238df9ae904fd182ddbb51602e8d8:refs/heads/combined-app-platform-cutover"`

Then repeat the guarded four-stamp update and one forced rebuild for `b7eb1e39`, requiring ACTIVE 9/9, exact source/runtime/build identity, green health/readiness, unchanged migration state, and a separately authorized bounded read matching the pre-deploy baseline.

## 7. Stop state and notification

- Mac Stage 1 doctor acceptance: **GREEN**
- Operational candidate recommendation: **normal-review integration of `d789ce27`**
- Founder production shadow: **BLOCKED / no accepted result**
- Progression deployment recommendation: **DO NOT DEPLOY**
- Production deployed or mutated: **NO**
- Native Build 89 / Build 90 changed: **NO**

Notification: **PhysiqueOS Training progression remains DO NOT DEPLOY. The Mac Option B production-read doctor is green, but the single authorized Founder read failed closed at the provider WebSocket boundary and returned no production evidence. Fresh Founder authorization is required before another production-data attempt.**

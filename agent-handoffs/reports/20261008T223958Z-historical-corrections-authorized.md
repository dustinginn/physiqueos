# Historical corrections authorization — Static Hold applied, Super Set utility and sealed preview ready

Task id: `historical-corrections-authorized-20261008`

Source assignment: `agent-handoffs/inbox/prompts/20261008-codex-historical-corrections-authorized.md` at `9519b672`.

Status: **STATIC HOLD APPLY COMPLETE AND VERIFIED; SUPER SET GUARDED CANDIDATE + FRESH SEALED PREVIEW COMPLETE; SUPER SET APPLY NOT EXECUTED.**

The work remained independent of Build 93 release assembly. No credential/PAT change, Server deployment, Recovery activation, Native build bump, Xcode action, TestFlight upload, or release-pointer change occurred.

## Executive result

- The freshly repeated Static Hold preflight matched every sealed fact from the authorized audit.
- The existing guarded seed then created exactly two active version-1 definitions and changed no historical evidence.
- An independent read-only postflight found both definitions, the same evidence count/digest and occurrence counts, and a replay plan with zero writes.
- A dedicated Super Set preview/execute utility was implemented, tested and published on an isolated branch rooted at the exact live Server SHA.
- The utility's final production use was **preview only**: three target sessions, six legacy fields, three ordered relationship groups and 22 preserved sets. It ran in `REPEATABLE READ READ ONLY`, verified `transaction_read_only=on`, and rolled back.
- No Super Set production record was changed. Its execute path still requires separate final Founder authorization plus the intact fresh seal.

## Authority and transport

Preflight and postflight authority remained stable:

- app: `physiqueos-foundation-staging` / `bf57cf56-48cc-4cd6-90e4-a23ee5381741`;
- active deployment: `32143aa4-90d4-496a-81b2-17f35a609fde`;
- deployment: `ACTIVE`, 9/9 steps successful, no in-progress deployment;
- `web` and `worker` source SHA: `84cc64e4e7205b2540bf78ea43afd1cbfb068d06`;
- runtime SHA and canonical owner fences: matched;
- final public liveness: healthy, build `physiqueos-84cc64e4-20261008`.

The exact approved ignored Mac runner remained byte-identical to Git blob `f7123347a43fb5dcfe8ae2a3029897d5ddb11fa7` and SHA-256 `aa2d3247917184199b718d5e7558a74cc8dcf46bf34713b3f73b8e506816a608`. It used only the existing `physiqueos-final-cutover-config` context. No secret value or private database binding was printed, copied or changed.

## Static Hold authorized operation

### Matching preflight

The preflight used the exact live-SHA seed implementation in a repeatable-read/read-only transaction and rolled back. It returned:

| Gate | Fresh result |
|---|---:|
| Existing variant definitions | 0 |
| Definition digest | `4f53cda18c2baa0c0354bb5f9a3ecbe5` |
| Evidence records | 594 |
| Evidence identity/version digest | `6a3119f32bf34442b1f122a9c3abc48b` |
| Active Training sessions | 248 |
| Spider Curls Static Hold occurrences | 4 |
| Pendulum Squat Machine Static Hold occurrences | 1 |
| Excluded legacy `super_set` occurrences | 6 |
| Predicted writes | 2 definition creates, 0 evidence writes |

The deterministic targets matched exactly:

- `tev_2ed2b6434373f5becfed0d37091263ea` — Spider Curls / Static Hold;
- `tev_af25a36b758fb2afdebb26241b577452` — Pendulum Squat Machine / Static Hold.

No conflicting, retired or pre-existing definition appeared, so the operation did not enter a drift/refusal path.

### APPLY result

The guarded apply payload was bound to runtime SHA `84cc64e4e7205b2540bf78ea43afd1cbfb068d06`, the exact preflight fact JSON, and authorization reference `founder-authorized-9519b672-static-hold-apply-20261008`.

In one bounded transaction under the canonical owner advisory lock, the existing utility:

- created exactly the two deterministic definition records;
- reported `outcome=applied` and `writes=2`;
- verified both definitions inside the transaction;
- verified the evidence identity/version digest was unchanged;
- verified no `super_set` definition was introduced;
- committed only after those checks passed;
- emitted the unique success marker and remote exit 0.

The definitions inherit each exercise's existing weighted-reps/load semantics. No duration, timed-hold or historical-evidence rewrite was introduced.

### Independent postflight

A newly built read-only payload opened a separate repeatable-read transaction, verified read-only mode and rolled back. It found:

| Postcondition | Result |
|---|---:|
| Active variant definitions | 2 |
| Definition digest | `11ffa440fbc2f32af8ef4df9c73a441c` |
| Definition versions | both version 1 |
| Replay-predicted writes | 0 |
| Evidence records/digest | unchanged: 594 / `6a3119f32bf34442b1f122a9c3abc48b` |
| Active Training sessions | unchanged: 248 |
| Static Hold occurrences | unchanged: 4 Spider Curls + 1 Pendulum Squat Machine |
| Legacy `super_set` occurrences | unchanged: 6 |

No rollback was needed. Any future compensating retirement remains a separate authorization and must target only these two exact identities and expected versions; historical evidence must never be rewritten.

## Super Set guarded candidate

Branch: `codex/build93-historical-superset-correction-utility-20261008`

Candidate: `1116e65789cb33f3f26431bbde855780aea1cfd9` (rooted directly at live Server `84cc64e4`).

The candidate adds:

- a fixed-scope domain runner for the three historical corrections;
- an App Platform console entrypoint;
- a payload builder with preview/apply fencing;
- focused unit tests for preview, execute, replay and refusal behavior.

The guarded behavior is:

- exact Founder-owner and live-SHA fences;
- bounded target, lineage, impact, event, definition and evidence-metadata reads;
- exactly two Leg Extensions -> Sissy Squats targets and one Seated Hip Adductions -> Seated Hip Abductions target;
- stable occurrence identities and evidenced member order;
- exactly 22 weighted-reps/load set entries with no duration semantics;
- zero existing/conflicting relationship groups or structural issues;
- confirmed source lineage for each pair/order;
- no forbidden Superset execution-variant definition;
- no affected-member performance event tied to a target session;
- deterministic relationship identities and correction provenance bound to authority task `9519b672`, prior version and prior payload digest;
- exact before/after payload, set, evidence-metadata, event and progression-context seals.

Preview is the default. It requires `REPEATABLE READ READ ONLY`, explicit `transaction_read_only=on`, owner-scoped SELECTs and rollback.

Execute is implemented but was not invoked. It requires a separate authorization reference and intact preview, opens one `SERIALIZABLE` transaction, takes the owner advisory lock, enforces expected versions, updates exactly three canonical evidence records, verifies three and only three writes, checks every sealed postcondition before commit, and supports an already-corrected zero-write replay. Any drift, ambiguity, unexpected performance event, conflicting structure or scope expansion refuses and rolls back.

## Final sealed Super Set preview

The final candidate preview was built from `1116e657` and executed against the verified live runtime without deployment. Private output and manifest are owner-only local files; no raw record/canonical/occurrence IDs, dates, source text or set values are included in GitHub.

- Preview semantic digest: `924a81592ce6cbeecef1f5395f87148f59fc9ffe8084cafc1854e51e0b2c6a0f`.
- Private manifest file SHA-256: `1658e0939155a3eb3bd61fc477c2c7e6d58d84abc68328cd1cff0498feb9d94f`.
- Built preview payload SHA-256: `21d0bc515238d2141b38664bf9171e5d886fcf91c220912dfd747e62d685b9f6`.
- Transaction: read-only `on`; rollback verified; one success marker; one remote exit 0.

Sanitized production facts:

| Fact | Result |
|---|---:|
| Target sessions | 3 |
| Misclassified occurrences | 6 |
| Proposed relationship groups | 3 |
| Affected sets preserved | 22 |
| Exact referenced lineage records inspected | 8 |
| Evidence records | 594 |
| Impact sessions containing affected movements | 21 |
| Target-exercise performance events | 12 |
| Events tied to target sessions | 6 |
| Events both tied to a target session and an affected member | 0 |
| Forbidden Superset definitions | 0 |
| Predicted production mutations | 3 canonical session updates; 0 event writes |

### Sealed progression-context effect

Ordinary standalone history is unchanged. The preview changes only the six miscoded legacy contexts:

| Exercise | Current legacy context | Proposed structured context |
|---|---:|---:|
| Leg Extensions | 2 occurrences / 8 sets | existing structured total becomes 4 / 16 with Sissy Squats |
| Sissy Squats | 2 / 8 | existing structured total becomes 4 / 16 with Leg Extensions |
| Seated Hip Adductions | 1 / 3 | 1 / 3 with Seated Hip Abductions |
| Seated Hip Abductions | 1 / 3 | 1 / 3 with Seated Hip Adductions |

The 12 existing target-exercise performance events remain ordinary/context-separated and are not rewritten. The six events tied to the target sessions belong to unrelated exercises. Therefore the sealed correction predicts zero performance-event writes and does not borrow standalone or legacy-variant progression baselines.

## Verification

- ESLint on all four new/changed candidate files: passed.
- Syntax checks and bundled preview build: passed.
- Focused suite: 6 files, 53 tests passed, 0 failed.
- Coverage includes Static Hold seed fences, execution-variant identity, explicit Superset correction/remapping, relationship validation, progression partition isolation, exact Super Set preview, three-record execute simulation, byte-preserved sets/unrelated fields, drift refusal, structural/lineage/event refusal, serializable/advisory-lock payload contract and zero-write replay.
- Final production Super Set preview: passed read-only/rollback/marker/exit gates.
- Candidate branch push: non-force, verified at `1116e657`.
- Worktree after publication candidate: clean.

The repository-wide unit command was also attempted, but the exact live-SHA baseline is not a valid clean gate in this restricted worktree: numerous unrelated suites require the intentionally unavailable `private/founder/runtime-store.json`, some exercise localhost listeners rejected by the sandbox, and other pre-existing source-contract fixtures fail. The focused 53-test suite and lint are green; no claim is made that the unrelated repository-wide baseline passed.

## Hold and safety decision

Static Hold is complete and verified.

Super Set remains **HOLD**. Reviewing this candidate/report is not authorization to apply it. A later task must explicitly authorize Super Set APPLY by reference to candidate `1116e657` and sealed preview digest `924a8159…c6a0f`, after a matching immediate preflight. Any changed preview requires renewed review.

- Static Hold production writes: exactly 2 definition creates.
- Super Set production writes: 0.
- Other production writes: 0.
- Credential changes: 0.
- Deployments/build bumps/uploads: 0.
- Release pointers changed: no.
- GitHub private evidence/exports: 0.

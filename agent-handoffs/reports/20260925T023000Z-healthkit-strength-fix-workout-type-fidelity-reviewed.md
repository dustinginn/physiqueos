# HealthKit Sep24 decode fix + workout-type fidelity — implemented and independently reviewed

Generated: 2026-09-25T02:30:00Z

Task id: `claude-healthkit-strength-fix-workout-type-fidelity-20260924`

Agent: Claude (Remote Control, HealthKit lane), executing `agent-handoffs/inbox/prompts/20260924T214500Z-claude-healthkit-strength-fix-workout-type-fidelity.md`

## Result

**Both parts implemented, tested, and independently fresh-context reviewed: APPROVE on both the final Native and Server candidates.** Code/test/review only, exactly as authorized. Nothing was archived, uploaded, deployed, or mutated in production. The Midweek lane's live worktree and the now-superseded HealthKit Native worktree were both left completely untouched throughout.

## Authority reverified

- Production Server: `01d1900bcbb9db32ce270e49c7d24e919ba0d7d7`, deployment `8da160ac-7ae5-4b69-8fd7-342cfff30099`, confirmed unchanged at task end.
- Installed Native: combined Build 59, `a269700bdc391476403c368d13f49887dd4a366a` (Midweek lane, worktree `/Users/dustinginn/Developer/PhysiqueOS/native-midweek-v3`) — inspected read-only only in the prior diagnostic task; **not touched at all in this task**.
- **New isolated HealthKit Native worktree**, created specifically for this task from exact Build 59 authority, preserving it byte-for-byte: `/private/tmp/physiqueos-healthkit-strength-fix-workout-type-fidelity`, branch `codex/healthkit-strength-fix-workout-type-fidelity`, based on `a269700b...`.
- **Final Native candidate**: `6a108d25e2a05b63c9561be3aeb9952f4e9dafe1`, 2 commits ahead of exact Build 59.
- **Final Server candidate**: `c58dcca97e7b1a32c829485b7f8dc3d8fa5bb5a5`, 1 commit ahead of the currently-live `01d1900b...`.

## Part A — Sep24 Training Detail decode defect: fixed

`ios/PhysiqueOS/Contracts/TrainingReadModel.swift`'s `HealthKitWorkoutAttachmentReadModel.Relationship.confirmedAt` changed from a required `String` to `String?`; added optional `matchOutcome`/`confidence` to decode the candidate shape's own fields. No fake confirmation is ever synthesized. No Server change was needed (confirmed: the Server's two intentionally different relationship shapes were already correct; the client was the sole point of failure).

Real-`JSONDecoder` tests added (not hand-built structs) for both the confirmed and candidate shapes, plus a full production-shaped Sep 24 fixture proving Logger exercises and HK telemetry decode and coexist correctly. The decoder configuration used in the tests (`.convertFromSnakeCase`) was independently confirmed by the reviewer to match the real production decode path exactly.

**A genuine follow-up defect was found by the independent review and fixed before finalizing**: `TrainingSessionDetailView.swift` had a hardcoded, unconditional "Confirmed with Workout Logger" label that — because only a confirmed relationship could previously decode at all — was implicitly always true before this fix. Once the decode fix made the candidate shape reachable, this label would have falsely claimed confirmation for the Founder's real, unconfirmed Sep 24 match, directly undercutting the task's own "honest candidate/confirmed relationship semantics" requirement. Fixed: the label now reads "Possible match with Workout Logger" for a candidate and only says "Confirmed" for a genuinely confirmed relationship, with two new tests proving each case.

## Part B — Workout-type fidelity: Indoor Walk vs Outdoor Walk (and prospectively Run/Cycle)

### Root cause (Native)

Apple's `HKWorkoutActivityType` uses the same raw numeric code for Indoor and Outdoor variants of walking/running/cycling — the distinction lives in a separate HealthKit metadata boolean, `HKMetadataKeyIndoorWorkout`. `HealthKitQueryClient.swift`'s metadata allowlist never included this key, so the signal was dropped before ever leaving the device. **A second, independent transport gap was found and fixed in the same pass**: a distinct, narrower wire-transport struct (`HealthKitObservationNormalizer.swift`'s own `Workout` shape, which is what `HealthKitS1WireMapper` actually JSON-encodes and sends) also needed the new field threaded through — the field could have been correctly populated in memory and still never reached the Server without this second fix. The independent Native reviewer traced the real network call chain end to end and confirmed both structs now carry the field, and that a `nil` value is genuinely omitted from the encoded JSON (not sent as an explicit `null`).

The new field, `isIndoorWorkout: Bool?`, is read ONLY from `HKMetadataKeyIndoorWorkout` (handling both `Bool` and `NSNumber` representations), never from GPS/location/speed/date, and is `nil` (never a guessed default) when the key is absent — verified by the reviewer with an explicit grep of the full diff for any location/GPS-based inference (none found).

### Root cause closure and classification (Server)

`HealthKitObservationService.js`'s workout-observation schema accepts the new optional field, purely additively (a signal-less payload normalizes byte-identically to before; verified). `HealthKitWorkoutService.js`'s `classifyHealthKitWorkoutType` was extended with a `CARDIO_LOCATION_VARIANTS` overlay: when the signal is present, a cardio workout's `canonicalType` becomes specific (`indoor_walking`/`outdoor_walking`, generalized to running/cycling too, per the task's "prospectively to all supported types" requirement); when absent, it stays generic (`walking`/etc.) exactly as before. **`family` (`"cardio"`) is never touched by the signal** — confirmed by the reviewer's own mutation test (temporarily made the signal change `family`, confirmed 7 tests immediately failed, restored, confirmed green again).

Verified, both by the implementer and independently by the reviewer reading the actual code (not just trusting the design): the already-deployed deferred-Cardio-reconciliation runner and the already-deployed Activity Detail `contributingWorkouts` presentation both required **zero changes** — they already reuse the shared classifier/constructor and pass `canonicalType` through verbatim, so the new fidelity flows through automatically for any future deferred observation that carries the signal.

**The Server's own request-bounds accounting was also correctly extended** (a real, necessary fix the implementer found along the way) so the new field is properly counted in the HealthKit ingestion byte-budget derivation — confirmed by the reviewer to be purely additive and unable to shrink the budget available to any other existing field.

### Historical data: explicitly NOT touched, confirmed unrecoverable

Per the prior diagnostic's proof (independently re-affirmed here, not re-derived): none of the 4 known deferred Cardio observations, nor the 3 already-canonicalized September 22 workouts, carry this signal in what's already stored — and, per this codebase's replay-dedup design, they never can retroactively gain it through ordinary future sync. This fix is prospective-only for all of them, exactly as the Founder confirmed is acceptable ("I'm fine with just changing it for future fixes"). No test, comment, or claim anywhere in either diff overstates this — the reviewer specifically checked for and found none.

## Fresh-context independent reviews

**Final Server candidate `c58dcca9...`: APPROVE.** No rejection-worthy issues. Independently re-verified the full diff, backward compatibility (including additional adversarial inputs beyond the shipped tests), the classifier extension's non-destructiveness (every call site traced, `family` invariance mutation-tested), the deferred-reconciliation and Activity Detail passthrough claims (read the actual production code, not just the tests, and tried an additional input value beyond what the shipped tests covered), and the request-bounds fix. Ran package7 (559/565, 6 pre-existing unrelated) and phase4 (139/139) exactly matching claims, plus all directly-affected files together (68/68). One minor, non-blocking note: the implementer's own commit message slightly misattributed which test file grew (a documentation-prose slip, not a code or test defect).

**Final Native candidate `6a108d25...`: APPROVE** (the one concern from the first review pass — the hardcoded confirmation label — was fixed and is reflected in this final SHA). Independently re-verified the full diff scope, traced the real network encode/send call chain by hand to confirm the two-struct transport fix genuinely reaches the wire, confirmed the decode tests use the real production decoder configuration, confirmed backward compatibility of the three pre-existing test fixtures, and confirmed the `HKMetadataKeyIndoorWorkout`-only read with no GPS/location inference anywhere in the diff. Full suite 1377/1377 (up from the pre-fix 1375, plus the 2 new label tests), targeted suites (`FounderServerAPITests` 188/188, `TrainingSessionDetailPresentationTests` 13/13, `HealthKitWorkoutIndoorOutdoorFidelityTests` 8/8) all green.

## Bounded deferred Cardio ledger (unchanged from the prior diagnostic; restated here for the record)

| Date | Local start–end (America/Chicago) | Active cal | State | Specific type |
|---|---|---|---|---|
| 2026-09-23 | ~08:29–08:47 AM | 78.6 | DEFERRED (`family_not_in_activation_scope`) | **Outdoor Walk** per the Founder's own real-world knowledge; **not recoverable from stored data** — will present as generic `walking` if/when reconciled |
| 2026-09-23 | ~09:57–10:12 AM | 107.1 | DEFERRED (`family_not_in_activation_scope`) | **Outdoor Walk** per the Founder; not recoverable from stored data |
| 2026-09-24 | 11:04–11:22 AM | 157.6 | DEFERRED (`family_not_in_activation_scope`) | **Indoor Walk** per the Founder; not recoverable from stored data |
| 2026-09-24 | 11:50 AM–12:06 PM | 188.1 | DEFERRED (`family_not_in_activation_scope`) | **Indoor Walk** per the Founder; not recoverable from stored data |

The Founder's own real-world knowledge of these four (Sep 23 = Outdoor Walk ×2, Sep 24 = Indoor Walk ×2) is accepted and not disputed — it is simply not, and per this codebase's architecture never can be, derivable from what HealthKit ingestion actually captured for these specific four historical observations, since the fix that would have captured it did not exist yet when they were first delivered. Any future presentation of these four (once Cardio is activated and Part D's reconciliation runner is authorized to run) will correctly show them as generic Cardio/Walking, not a fabricated specific type. This is intentional and matches the Founder's own explicit acceptance of a prospective-only fix.

For context, not part of the pending-reconciliation set: three already-canonicalized September 22, 2026 workouts (predating the current workout policy's effective date) were also re-audited for type-fidelity consistency — none of them carry the signal either, for the identical historical reason, and none require any action.

## Mutation and scope ledger

- Production deployed/mutated: **NO**.
- Policy mutated: **NO**.
- Cardio activated: **NO**.
- Deferred Cardio observations reconciled: **NO**.
- Historical/already-stored observation data mutated or backfilled: **NO** (explicitly out of scope and structurally impossible via this fix alone, by design).
- Frozen Sep 24 Logger evidence package: **NOT mutated**.
- Founder-device operated: **NO**.
- TestFlight uploaded: **NO**.
- Midweek lane's live worktree (`native-midweek-v3`): **NOT touched** in this task (only inspected read-only in the prior diagnostic).
- Superseded HealthKit Native worktree (`physiqueos-healthkit-revision-recovery-native`): **NOT touched**.
- Both final candidates (`6a108d25...` Native, `c58dcca9...` Server) are local-only commits on their respective branches — neither pushed to `origin`.

## Recommended release sequencing (unchanged in spirit from the prior reports; updated SHAs)

1. Authorize Server deployment of `c58dcca97e7b1a32c829485b7f8dc3d8fa5bb5a5` (ships the Sep24 presentation fix's Server-side counterpart already deployed in `01d1900b`, plus the new type-fidelity classifier/schema — activates nothing by itself).
2. Authorize folding `6a108d25e2a05b63c9561be3aeb9952f4e9dafe1` into whatever the next consolidated Native release candidate is (this isolated worktree preserves exact Build 59 as its base, so it should merge or rebase cleanly onto any further Midweek-lane work without conflict — that reconciliation step itself needs its own authorization and is not part of this task).
3. Real-device acceptance of both the Sep 24 Training Detail fix and the (now honest, non-overclaiming) candidate-relationship label, once the consolidated build is released and installed.
4. Real-device acceptance that NEW workouts (a future Indoor or Outdoor walk/run/ride) now correctly capture and would display the specific type, once Cardio is eventually activated.
5. Dry-run, then a separate apply, of the already-deployed atomic policy-replacement tooling (Strength-only → `[cardio, strength]`).
6. Dry-run, then a separate apply, of the already-deployed deferred-Cardio-reconciliation runner, for all four known identities (presenting as generic Cardio/Walking, per the ledger above).
7. September 23 Activity repair: remains not required, unaffected.

## Flags

- AUTHORITY_REVERIFIED: YES
- BUILD59_BASE_PRESERVED: YES (verified byte-for-byte at `a269700b...`)
- SEP24_CANDIDATE_RELATIONSHIP_DECODE_FIXED: YES
- CONFIRMED_RELATIONSHIP_DECODE_PASS: YES
- CANDIDATE_RELATIONSHIP_DECODE_PASS: YES
- SEP23_TRAINING_DETAIL_REGRESSION_PASS: YES
- SEP24_TRAINING_DETAIL_FIX_PASS: YES
- WORKOUT_TYPE_PIPELINE_AUDITED: YES
- SEP23_OUTDOOR_WALK_1_PROVEN: PARTIAL — Founder-asserted and accepted; not derivable from stored HealthKit data (proven unrecoverable, not proven present)
- SEP23_OUTDOOR_WALK_2_PROVEN: PARTIAL — same
- SEP24_INDOOR_WALK_1_PROVEN: PARTIAL — same
- SEP24_INDOOR_WALK_2_PROVEN: PARTIAL — same
- CARDIO_FAMILY_DOES_NOT_ERASE_TYPE_PASS: YES (mutation-tested)
- DEFERRED_RECONCILIATION_TYPE_FIDELITY_PASS: YES
- ACTIVITY_DETAIL_SPECIFIC_TYPE_PASS: YES
- FOUR_ITEM_CARDIO_LEDGER_READY: YES
- NATIVE_TESTS_PASS: YES (1377/1377)
- SERVER_TESTS_PASS: YES (all directly-affected + package7/phase4 matching established baseline)
- PRODUCTION_WEBPACK_BUILD_PASS: YES
- FRESH_CONTEXT_REVIEWED: YES (both candidates, both APPROVE — Native's one finding fixed before finalizing)
- TESTFLIGHT_UPLOADED: NO
- POLICY_MUTATED: NO
- CARDIO_ACTIVATED: NO
- DEFERRED_CARDIO_RECONCILED: NO
- PRODUCTION_DATA_MUTATED: NO
- GH_REPORT_PUBLISHED: YES
- CONTAINS_SECRETS: NO

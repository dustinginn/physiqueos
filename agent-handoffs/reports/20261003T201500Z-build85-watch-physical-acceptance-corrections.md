# Build 85 Watch physical-acceptance corrections — early root-cause checkpoint

Generated: 2026-10-03T20:15:00Z  
Status: **AUDIT COMPLETE / PRODUCTION UNCHANGED / IMPLEMENTATION NOT STARTED**

## Authority and isolation

- Founder prompt authority: `999498283bb3fc7b7a268d3d2c0c934fe89479f1`.
- Installed Native authority: Build 84, source `bcd92c74602695766c270fe6af052de45afece4b`, TestFlight delivery `a4b7b504-e0ba-4cb5-9909-3e01cc8156d5` (VALID and installed).
- Production Server authority reverified: `b47663b32372a78010dbc8e4aa41303012d98dc7`, build `physiqueos-b47663b3-20261003`, deployment `b9449c52-5444-4dae-9f44-fd0261b1a9d3` ACTIVE.
- Existing Build 84 Native and Server worktrees were inspected and remain clean and unchanged. The separate Home UI/design exploration was not touched.
- DEXA prospective policy remains active exactly as authorized on main; DEXA controls, Sleep v3, Cardio/Cooldown, Live Activities and historical strategic artifacts were not touched.

## Production read-only incident audit

The approved, byte-verified App Platform console runner was used inside the exact active web runtime. The audit required exact runtime SHA/build and Founder-owner authority before opening the database, used one `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` transaction, verified `transaction_read_only=on`, issued bounded owner-scoped `SELECT`s only, explicitly rolled back, and emitted its unique success marker after rollback. Identifiers below are short SHA-256 digests; no raw private HealthKit or canonical identity is published.

For 2026-10-03 the bounded snapshot proves:

- exactly one structured Logger Training evidence object for the physical strength workout (`28194bb09bba0b76`), live Logger provenance, four exercises, 18:53:52.789Z–19:58:05.931Z;
- exactly one corresponding PhysiqueOS-created HealthKit Traditional Strength Training observation (`425250d29c066b0a`), source bundle `com.physiqueos.native.dev`, indoor, 18:53:50.000Z–19:58:05.000Z;
- exactly one canonical Strength workout (`78f76c25492c3233`), with one candidate relationship to that Logger session;
- exactly one pending Workout Match review (`641fb527fb075931`), outcome `confident_match`, reason `single_overlapping_session`, matcher `healthkit-strength-matcher-v5`, 95% `logger_session_window`, substantive overlap with both boundaries aligned;
- one candidate link and zero held claims; no resolution is present;
- no `physiqueOSSessionId` or exact association authority on the stored HealthKit observation;
- no duplicate performed Training evidence and no duplicate HealthKit strength workout in the bounded event;
- HealthKit physiology is canonicalized but is waiting behind the generic candidate/review relationship rather than being exactly associated to the Logger session;
- the separate preceding Stair Stepper is its own one canonical Cardio workout, not a duplicate of the strength event;
- canonical Activity day inputs remain present. This audit performed no repair and did not rewrite Activity, Training, Briefings, Confidence or any other artifact.

The Founder-left Pending Review remains pending and byte-unmodified.

## Root cause 1 — false OFFLINE during inactive/Always-On display

This is proven as a presentation/state-model defect, not proof that the structured workout was lost.

Build 84 maps every `WCSession.isReachable == false` callback directly to `.phoneUnavailable` (`WatchWorkoutStore.swift:996-1012`). The execution header then renders `OFFLINE · HEALTH ON` for every state other than `.reachable` (`WatchWorkoutViews.swift:357-359`). `isReachable` describes immediate interactive `sendMessage` availability; it is not a durable assertion that application-context delivery, paired-phone authority, or the last authoritative projection has been lost. The observed exact wake/dim correlation is therefore fully explained by this code.

The command path still uses interactive messages and correctly fails closed if a mutation is attempted while no immediate phone reply path exists. Today's production records prove the structured session committed once and the Watch HealthKit workout saved once. No audit evidence establishes a real authority loss during the dim periods. The earlier disconnect observation remains an unproven possible transport interruption and will be covered by deterministic stale/failed-command/reconnect tests rather than hidden.

Required correction: separate passive transport availability from actionable authority failure. A mere reachability transition must not show OFFLINE. A pending command that cannot be delivered/acknowledged, or an authoritative projection that crosses a defined stale/failure threshold, must still surface a clear warning and remain fail-closed. HealthKit recording remains independent.

## Root cause 2 — exact trusted Watch correlation never entered the production path

The Build 83 pure trust checker is not the defective part. Its contract requires an allowlisted source bundle, exact UUID registry membership, owner scope, Strength + indoor facts and time-envelope containment, and its focused tests cover spoofing and ambiguity.

The production path is deliberately dormant at two independent boundaries:

1. Native normalizer state defaults to `.disabled`, and `HealthKitBatchBuilder.build` constructs a fresh default normalizer instead of accepting/wiring an authoritative correlation registry (`HealthKitObservationNormalizer.swift:3-4,54-76`). Thus Build 84 read the Watch workout but stripped the correlation to `nil` before upload.
2. The exact-correlation Server work from commit `18f4569a` is not an ancestor of production Server `b47663b...`. Even on the source line that contains it, `createCanonicalPersistenceCommandPorts` defaults the trusted bundle list to `[]`, and production composition calls it without an allowlist (`CanonicalPersistenceCommandPorts.js:243-247`; `phase4PostgresComposition.js:172`).

The live source bundle fact is `com.physiqueos.native.dev`; the safe policy must bind that exact observed production source identity rather than assume the Watch extension bundle name.

The existing Workout policy is enabled/open-ended for Cardio + Strength, but `linkAutoConfirm=false`. That generic switch is intentionally unrelated to the desired exact path: enabling heuristic 95% auto-confirm would be unsafe and is not proposed. Because Native supplied no trusted identity and Server had no active exact path, the ordinary matcher correctly produced the observed 95% Pending Review.

Conclusion: this incident is the expected consequence of the previously documented post-acceptance activation hold plus incomplete production composition, not a failure of the pure trust predicate. Build 85 needs narrowly reviewed Native and Server implementation/configuration before the exact path can operate. No Server deploy or production allowlist/config mutation is authorized yet.

Today's pending review is a suitable single bounded repair target after the corrected runtime is deployed, but no repair should infer authority from the 95% score alone. A future dry run must re-prove the exact source metadata/session envelope and one-to-one graph; any drift must refuse. Apply remains Founder-gated.

## Root cause 3 — PR celebration polish only

Functional physical acceptance passes for both the session-volume and reps-at-load records. The one-shot gate, visible-presentation guard, celebratory haptic and Reduce Motion behavior are already correct. The current local burst is only 20 pieces, 4–6 points wide and under one second, clipped to a card-top overlay. The safe Build 85 change is a local increase in particle count/size/spread and overlay presence without touching PR detection, shared design tokens, lifecycle gating or Reduce Motion.

## Next gated work

1. Create a dedicated Build 85 branch/worktree from exact Build 84 source; do not edit the Build 84 worktree.
2. Implement/test the reachability presentation state model and larger local confetti.
3. Implement the dormant trusted-correlation pipeline end to end on reviewed Native/Server descendants, including source identity `com.physiqueos.native.dev`, owner/session registry, envelope checks, exact association, duplicate-claim rejection and replay safety.
4. Prepare an exact production allowlist/config operation and a one-record incident repair dry run; obtain fresh independent review.
5. Publish the exact reviewed Server/operation authority and **STOP for Founder authorization before any Server deployment, allowlist/config mutation, or review repair**.

Production mutation in this checkpoint: **none**.  
Native/Server implementation mutation in this checkpoint: **none**.


# Build 83 first-real-workout corrections — CHECKPOINT 2 (Native green locally; Server D1/D2 in progress; deploy awaits DIRECT exact-SHA authorization)

- Task id: `build83-first-real-workout-comprehensive-correction-20261003`
- Prompt: `agent-handoffs/inbox/prompts/20261003T003500Z-build83-first-real-workout-comprehensive-correction.md` (authority main e25fd200)
- Lane: Claude, Remote Control session 79959d1b (788283ca superseded; same worktree)
- Supersedes the observer snapshots `20261003T024558Z-build83-in-flight-status-snapshot.md` and `20261003T030213Z-build83-founder-authorization-relay-status.md`. Checkpoint 1 was never published because the gated publisher was refused at the time; its content is folded in here.
- Status: **in progress.** Nothing has been deployed, uploaded or mutated in production.

## Authority
| Item | Value |
|---|---|
| Production Server | `d0ff65965233fa44e108387f01b649a2bdb476df`, deployment `64533990`. Last read-only reverification was at task start; it is re-verified again before any deploy |
| Native base | Build 82 `e2cbcd0cf40dca64a4c8490bf0ebd4077b2eb69c` |
| Native candidate | `claude/build83-first-real-workout-corrections-20261003` @ **`152c813e`**. Local commits; push and archive follow the final reviews |
| Server candidate (reviewed) | `claude/build83-server-finish-observability-20261003` @ **`f91d76c0b5d21d3d2d90c73b7f815d77effee01d`**, local and not deployed |
| Server candidate (D1/D2) | `claude/build83-server-cardio-d1d2-20261003`, building on f91d76c0. In progress, so **it will have a new SHA** |

## Authorization state (important)
- A relayed message, quoting a Founder authorization for the Server deploy and Cardio D1/D2/D3, reached this lane from another Claude session.
- Under this lane's permission rules a relay is **not** usable as authorization for a production deploy or a production repair. The auto-mode classifier also refused the earlier deploy attempt.
- **The Founder must post the authorization directly in this session** (Remote Control / `claude attach`).
- Once D1/D2 are added, the deploy SHA will no longer be f91d76c0. The authorization must name the **exact SHA** reported after D1/D2 pass fresh review.
- The D1/D2 product decisions themselves are being implemented as a local candidate, for review only.

## Audit-first results (proven; unchanged since checkpoint 1)
**14. Stair Stepper (44) and Cooldown (80)**
- Both were uploaded at 22:54:44Z and stored as `source_only` / `unsupported_workout_type`.
- The Server canonicalizes only strength (50/20) and walking/running/cycling (52/37/13), by explicit design.
- Log, Training Day and Activity read only canonical workouts, so both were hidden. Nothing was lost or delayed.
- These became Founder product decisions D1/D2/D3.

**15. ~945 kcal / ~109 min: LEGITIMATE.**
- One device sent 62 monotonic Activity Summary revisions, each replacing the last.
- The canonical day equals the latest single revision. Workout energy is never added.
- No numerical change.

**16. Add Set: no defect.** The deterministic test was added. Closed as unable to reproduce / likely user action.

Evidence came from one read-only production probe, using the approved runner restored byte-exact from `4025f175` and context `physiqueos-final-cutover-config`. The transaction was REPEATABLE READ READ ONLY with `transaction_read_only=on` verified, ran 11 owner-scoped SELECTs, and ended with ROLLBACK.

## Native candidate 152c813e
Implemented: every confirmed correction in the assignment, plus the fixes from a fresh independent review.

**Fresh review of c2b171fe: REQUEST CHANGES (1 blocker, 3 majors). All addressed in 152c813e.**
- **Blocker.** The phone Finish now takes the commit lock *before* it stamps the finish, so the background coordinator can never take the interactive commit over. Supporting evidence then reconciles exactly once.
- **Phone freeze.** A confirmed finish is frozen on the phone: no set or structural edits, no Cancel, no Save & Leave; Retry is the only action. A finish is stamped only after local commit validation passes.
- **Health reports.** Reports are guarded by their finish operation, not the session revision. They are settled before projections are applied and never downgraded, and the Watch auto-saves at most once per session. No report or save loops remain.
- **Never discard a saved workout.** Only an explicit Cancel discards a Watch HealthKit workout. An orphaned workout gets End & Save / Discard on the Watch. Committed sessions are listed ahead of discards, and a session that is merely not current is not tombstoned.
- **Minors:** recency eviction, bounded send retries, deferred finish taps, recovery of any stored workout, no Finish with zero completed sets, Daily Totals seeding and clearing, observer cancellation, lossy ledger decoding.
- **Fresh re-review of 152c813e:** running now.

**Tests (exact, on 152c813e unless noted)**
| Suite | Result |
|---|---|
| Full iOS unit suite | **1,963 tests, 1 skipped, 1 failure.** The failure is the known baseline `PeptideSupportEditorViewModelTests.testSandboxChangeDoseKeepsHistoryAndPauseResumeWorkAgainstTheFixture`, which also fails on Build 82 |
| Watch unit tests | **20/20** |
| Watch UI tests | **7/7.** A physical `swipeRight()` opens Pause/Resume, Finish Workout and Cancel Workout; `swipeLeft()` does not; vertical paging reaches Metrics → Daily Totals; final-set Finish shows the confirmation on the primary surface; Not Yet returns; controls-page Finish uses the same confirmation; paused keeps Resume and Cancel; Done returns to idle |
| Phone Training UI acceptance | 16 tests. In suite order 10 passed and 6 failed at the documented journey-ordering step ("Training Logger was not available from Log"); **all 6 pass on a freshly erased simulator.** This is a pre-existing ordering dependency, not a regression |

- Generator: deterministic (Build 83 pinned ID block, Watch UI test target). Release verifier: `1.0 (83)` OK.
- Watch renders: checked on Ultra 49 mm, SE 40 mm, Series 12 42 mm and 46 mm. The execution page never scrolls; content sits below the clock; the capsule action is on the lower edge; progress is green; metrics are ordered Time / Active / Total / HR; Daily Totals; swipe-right controls.

## Server
**f91d76c0 (reviewed):**
- `native.command.received` log line;
- `training-session.commit.v1` body bound 4 KiB → 64 KiB (workouts of about 30+ sets were rejected with 413);
- clearly-safe commit hot spots and sub-stage timings.

Fresh review: **APPROVE WITH NITS.** Nit 1 is fixed. Full unit suite: 304 pre-existing failures, identical at base.

**D1/D2 (in progress):**
- Stair Stepper (44) becomes canonical Cardio and strategically eligible.
- Cooldown (80) becomes canonical for Log/Activity but strategically ineligible, with an explicit canonical-vs-strategic separation.
- A dry-run-only, exactly-two-observation D3 repair tool is being prepared.
- It needs its own fresh review, and it produces a new SHA.

## Not done yet
- D1/D2 Server candidate and its review.
- Fresh re-review closure on Native 152c813e.
- Native compatibility check for any new Server workout types (Build 83 may need a small Native presentation change).
- Push of both branches; Build 83 signed archive; guarded TestFlight upload; VALID.
- Server deploy and the D3 repair: these need **direct** Founder authorization naming the exact SHA.
- Durable backlog update.

## Next safe step
1. Finish D1/D2 and its fresh review.
2. Report the exact Server SHA to the Founder in this session for direct authorization.
3. Close the Native re-review; archive Build 83; upload when authorized; wait for VALID.
4. Guarded deploy and the two-observation D3 repair (dry run first) only after direct authorization.

## Local-only state
- Candidate branches as local commits.
- Watch renders, test logs and probe JSON in job scratch. The probe JSON holds workout timing/energy values and is never published.
- Disk was about 17 GiB at last check. Cleanup so far: one stale Codex DerivedData, the shared Xcode module caches, superseded result bundles, and erased simulators (all regenerable).

Safety: no secrets, credentials, production exports or Founder evidence.

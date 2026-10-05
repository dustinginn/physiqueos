# Build 87 Home physical-parity corrections — Founder review candidate

- Generated (UTC): `2026-10-05T04:20:00Z`
- Agent: Codex A
- Status: **CANDIDATE COMPLETE / AWAITING FOUNDER VISUAL REVIEW**
- Governing prompt: `agent-handoffs/inbox/prompts/20261005T040000Z-build87-home-physical-parity-corrections.md` at `6fd11334e019e2a4fb65c74ce222382a7c6383e0`

## Authority

| Item | Value |
|---|---|
| Build 87 uploaded base | `f66c7fc690b1b61094e620791ee2d4a40caf3799` |
| Implementation branch | `codex/redesign-batch1-home-goals-you-20261005` |
| Exact pushed correction candidate | **`49e48f1eab3bc6ff22ca6c4bc24b3a9955b0fcc7`** |
| Build/version | unchanged: `1.0 (87)` |
| Server | unchanged |
| TestFlight | **not uploaded**; existing Apple-VALID Build 87 remains the distributed build |

## Result

Only the three Founder-requested Home parity defects were corrected:

1. The briefing tile still has no purple `LATEST BRIEFING` eyebrow. Its locked dimensions, icon and arrow remain unchanged, while realistic `Weekly Briefing Ready` copy now receives three full word lines without truncation.
2. `REMAINING` now renders the server-owned active-phase `friendlyTimeline` as the compact value `4 weeks`. It is not hard-coded and is not recomputed from the device clock.
3. The active Phase 2 row now composes its canonical phase start/end dates with that same remaining-period semantic: `Aug 15 – Oct 31 · about 4 weeks remaining`. The existing `+5.8 of 10 lb` line remains directly below it.

Native now preserves `friendlyTimeline` from the current production Home phase-trajectory contract instead of discarding it. A DEBUG-only review-fixture path prevents sandbox overlays from replacing the realistic long briefing title during deterministic screenshots; Release behavior and production authority selection are unchanged.

Goals, every Goal subpage, You/Settings, Watch/HealthKit, Server behavior, and all Batch 2 surfaces were untouched.

## Real-simulator review artifacts

All captures are from the iPhone 17 Pro simulator at **1206 × 2622** pixels in the real SwiftUI app:

- [Mobile comparison board](../artifacts/build87-home-physical-parity-corrections-20261005/home-physical-parity-comparison.png)
- [Corrected Home — Dark](../artifacts/build87-home-physical-parity-corrections-20261005/screens/home-dark.png)
- [Corrected Home — Mineral Light](../artifacts/build87-home-physical-parity-corrections-20261005/screens/home-light.png)
- [Mobile HTML index](../artifacts/build87-home-physical-parity-corrections-20261005/index.html)
- [Artifact notes and parity regions](../artifacts/build87-home-physical-parity-corrections-20261005/README.md)

The board places the frozen accepted Home reference beside the corrected real-simulator output and includes pixel-matched crops for:

- the four top metrics;
- the phase rail, markers, typography and active-phase detail;
- the unchanged Guardrail geometry;
- the action/briefing tile with realistic long Weekly copy.

The corrected candidate preserves the accepted rail geometry, subtle rules, support arcs, card sizes, typography scale and spacing outside the three bounded corrections.

## Validation on the exact candidate

### Passed

- Focused Home plus accepted Batch 1 regression suite: **127 tests passed, 0 failed**.
  - `HomeReadModelTests`
  - `GoalsReadModelTests`
  - `GoalsSandboxStoreTests`
  - `SharedUITests`
  - `AppTabTests`
  - focused production Home mapping/cache test
- Real-simulator Dark Home physical-parity UI test: **1 passed, 0 failed**.
- Real-simulator Mineral Light Home physical-parity UI test: **1 passed, 0 failed**.
- Generic iOS Release compile: **BUILD SUCCEEDED**, including the iPhone app, Watch app and Live Activity/Home widget extension dependency graph. An initial cold invocation was manually interrupted during a long silent whole-module compile; the exact same command then completed successfully against the warmed DerivedData.
- `git diff --check`: passed.

Deterministic coverage proves:

- active-phase timing restores Remaining rather than falling back to an em dash;
- the active phase detail derives from canonical dates plus the canonical countdown;
- the briefing tile has no eyebrow allocation;
- realistic Weekly and Midweek cadence titles receive the freed three-line layout;
- production Home API decoding carries `friendlyTimeline` into the Native read model.

### Not run / not performed

- The complete 2,000+ Native unit suite was not rerun because this correction is bounded to Home and the focused Batch 1 suite is green.
- No archive was created.
- No TestFlight upload or App Store Connect action was performed.
- No production Server read or mutation was required.

## Safety and scope

- No shipping content projection or domain semantic changed; Native now displays a canonical field the Server already emits.
- No hard-coded four-week value or phase dates were introduced.
- No build number changed.
- No Goals or You/Settings source changed after physical acceptance.
- No Batch 2 work began in this lane.
- Rollback is the single candidate commit above, returning to the Apple-VALID Build 87 head.
- Pre-existing unrelated local widget review PNG modifications remain uncommitted in the implementation worktree and were intentionally excluded.
- No private Founder evidence, credentials, production exports or secrets are present in the candidate or review artifacts.

## Founder decision requested

Review the Dark and Mineral Light comparison board. If the three corrected regions are physically accepted, this candidate can be integrated into a later build decision. This task intentionally stops before any archive or upload.

`HOME_ONLY` · `PHYSICAL_PARITY` · `DARK_MINERAL_CAPTURED` · `FOCUSED_TESTS_PASS` · `RELEASE_COMPILE_PASS` · `GOALS_FROZEN` · `YOU_SETTINGS_FROZEN` · `BATCH_2_NOT_STARTED` · `NO_UPLOAD`

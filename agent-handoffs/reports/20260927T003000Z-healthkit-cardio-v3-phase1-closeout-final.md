# HealthKit Cardio → V3 strategic graduation: ACTIVATED. Phase 1 HealthKit closeout (final)

Generated: 2026-09-27T00:30:00Z

Task: `claude-healthkit-cardio-v3-deploy-fix-activate-20260926`, executing `agent-handoffs/inbox/prompts/20260926T235000Z-claude-healthkit-cardio-v3-deploy-fix-activate.md`, Step 5 (final closeout).

## Result

**`cardio_training` is now live in the production HealthKit graduation policy's `evidenceEligibility.domains`, alongside `activity` and `nutrition`. Canonical HealthKit Cardio workouts (never Strength) can now reach V3 Confidence/Narrative evidence prospectively, exactly as scoped and reviewed.** All five authorized steps are complete. No historical artifact was regenerated, no data outside the policy record itself was touched, no Founder device operated, Sep 24 Strength case untouched.

## 1. Inert candidate deploy

- SHA: `cc8bd0b706e155223b112d44a95d93680d0a0054`
- Deployment: App Platform deployment `b5efd6f1-7787-4e58-b9f2-09d3300bfe99`, reached ACTIVE 9/9
- Post-deploy verified: `source_commit_hash` on both `web`/`worker` = `cc8bd0b7`; `/health/live` and `/health/ready` both 200; no migration drift; live policy and all real data counts unchanged (deploy touched code only).

## 2. Photo Event semantic fix + wrapper-shape fix deploy

- SHAs: `74652b025d1aaf236d0b42fb5fc609d23f2b934f` (wrapper-shape fix + PhotoEventNarrativeService resistance-filter fix) and `49211870c552b104aaf7840939f55d9dc9ecc1df` (wrapper-level provenance completion, found by fresh-context review)
- Deployment: App Platform deployment `3134643d-9284-4cd5-82a3-b91cff346a9f`, reached ACTIVE 9/9
- Post-deploy verified identically: `source_commit_hash` = `49211870` on both services, health green, no migration drift, live policy and data counts unchanged.
- Both fixes were fresh-context reviewed (two separate review passes) and are covered by new/updated deterministic tests, RED/GREEN mutation-verified, with a full regression sweep (up to 145/145 across 10 files) and a before/after comparison against the previously-deployed baseline confirming no other regressions.

## 3. Live graduation policy: before → after

| | Before | After |
|---|---|---|
| `projection.enabled` | `true` | `true` (untouched) |
| `projection.domains` | `["activity","nutrition"]` | `["activity","nutrition"]` (untouched) |
| `evidenceEligibility.enabled` | `true` | `true` |
| `evidenceEligibility.domains` | `["activity","nutrition"]` | `["activity","cardio_training","nutrition"]` |
| `evidenceEligibility.startLocalDate` | `2026-09-22` | `2026-09-22` (unchanged — prospective, not extended backward) |
| `evidenceEligibility.endLocalDate` | `null` | `null` (unchanged) |
| policy version | 2 | 3 |

Applied via the established guarded `healthKitGraduationPolicy` operation (dry-run verified twice — once ahead of authorization, once immediately before apply, both showing identical facts digests with zero drift — then applied under explicit Founder chat authorization). The tool's own self-reported invariants after apply: `policyIsExactlyTheAuthorizedRecord: true`, `noHistoricalBriefingRegeneration: true`, `auditRowPresent: true`, and every other real-data collection (`observations`, `canonicalDays`, `canonicalWorkouts`, `links`, `claims`, `evidence`) reported `unchanged: true`. Independently reverified via a separate zero-write read (not the same tool): live `evidenceEligibilityDomains` confirmed `["activity","cardio_training","nutrition"]`, all real data counts (572 evidence objects, 79 activity days, 246 training objects, 7 Cardio + 3 Strength workouts) identical to pre-activation.

## 4. V3 Confidence/Narrative integration status

Canonical HealthKit Cardio workouts within the eligible scope now flow through `overlayGraduatedHealthKitCardioWorkouts` → `HealthKitGraduationReader.overlayCardioWorkouts` → `providerBriefingCadenceComposition.js`'s evidence runtime, exactly the same point Activity/Nutrition graduation already uses, on every future briefing-cadence tick. Confirmed via a live integration test against the actual deployed code: a graduated Cardio workout now carries the full canonical-evidence-object wrapper (`evidence_type: "training"`, `quality`, `lastObservedAt`, `provenance`, etc.) so it is genuinely visible to consumers that read at the wrapper level (not just `payload`) — this was the self-discovered defect fixed in Step 2. Confirmed the Confidence model itself (`CanonicalConfidenceAssessmentModel.js`) has no `"training"`-type summation, and `PhotoEventNarrativeService.deriveExecutionSupport` now correctly requires resistance-specific signals (Logger exercises or a strength/resistance/lifting/weights label) before making a "Resistance training was consistent" claim — a Cardio-only week cannot trigger it.

**No briefing was manufactured and no historical artifact rewritten to "prove" this** — natural future V3 briefing generation (the next scheduled Weekly/Midweek/Monthly/Photo Event cadence tick) is the live acceptance point, per the task's own instruction.

## 5. Historical immutability

- No `healthKitObservations`, `healthKitCanonicalDays`, `healthKitCanonicalWorkouts`, `canonicalEvidenceObjects`, workout links, or claims were touched by either deploy or by the policy activation — confirmed identical counts and, for the activation, the guarded tool's own digest-based invariant checks, both times.
- `historicalBriefingRegeneration` is `false` in the applied policy record; the guarded tool reports `historicalBriefingsRegenerated: 0`.
- Historical generic Cardio (`canonicalType: "walking"`, no Indoor/Outdoor signal retained) is not and will not be relabeled: the presentation label is derived only from the stored `canonicalType` at ingestion time, never inferred, and the workout classifier runs exactly once at ingestion with no retroactive reassessment sweep for Cardio.

## 6. Duplicate/double-count controls

- **No Activity/workout double counting**: the graduated Cardio evidence object is a structurally separate `evidence_type: "training"` object from the `activity_day` object Activity/Nutrition graduation produces; nothing sums Cardio's `active_calories` into a strategic energy total. Verified unchanged on real data across both deploys and the activation.
- **Duplicate suppression against Founder-logged evidence remains intact**: verified against real production data both before and after activation — all 7 real canonical Cardio workouts in the Sep 1–26 window are correctly suppressed (2 via the stored ingestion-time decision, 5 via live per-read reassessment against currently-present same-day Training evidence), so today's activation produces **zero net-new graduated evidence objects** on existing data. This is expected and correct (the Founder has already manually logged these walks); it will change for genuinely new, non-duplicate Cardio going forward.

## 7. Strength separation

Strength workouts are excluded from this graduation path at two independent layers (the family filter in `overlayGraduatedHealthKitCardioWorkouts`, and the presentation projector's own independent family check), confirmed by test and against real data (0 of the 3 real Strength workouts in the window ever graduate, even under a hypothetical fully-open scope). Strength's own reconciliation workflow (Logger-session confirm/deny) is completely untouched by this task.

## 8. What remains open (explicitly, per the task's requirement not to overstate completeness)

- **Strength Sep 24 / Build 62 confirmation failure remains OPEN.** Not touched by this task. The materially deeper diagnosis the prior ChatGPT orchestration handoff requires (re-establishing evidence Native → transport/auth → Server command receipt → handler → readback/verification) has **not yet started** — it is next now that this Cardio/V3 task is fully closed out.
- **Logged Today Cardio Native presentation defect remains open**, carried forward into the next batched Native candidate (item C of the standing A–H list from the prior report).
- **Reconciliation-review notification natural-event acceptance remains pending** — the notifier shipped in Build 61/62 has not yet been exercised by a real new review under real device conditions; nothing in this task changes that status.
- The official guarded `healthKitGraduationPolicy` ops tool's own dry-run simulation does not model the Cardio workout overlay at all (self-reports `trainingAndWorkoutChanges: none`) — a pre-existing scope limitation, not introduced here. Real Cardio-effect verification for this task was done via a separate, purpose-built zero-write simulation tool. Worth a future enhancement to that ops tool, not a blocker.
- Minor, non-blocking observability gap carried forward: `overlayCardioWorkouts` failures don't set the `evidenceOverlayFailure` flag the Briefing Settlement gate watches (by design, since Cardio doesn't participate in that gate) — a future log line or counter would help visibility.

## Is Cardio now fully graduated for Phase 1?

**Yes, for the scope this task defined: canonical HealthKit Cardio WORKOUTS are now strategically eligible for V3 evidence, prospectively, subject to the same duplicate-suppression and structural-integrity rules already governing Training Day presentation, with Strength staying fully separate.** This closes the Phase 1 Cardio strategic-graduation objective. It does not include: Cardio's own Native "Logged Today" presentation parity (separate, open, tracked), or any change to Strength's reconciliation workflow (separate, open, tracked, and explicitly out of scope for this task by its own instruction).

## HealthKit Sleep

**Not begun**, per this task's explicit instruction.

## Safety

No production data mutated beyond: two authorized, verified code deployments (`cc8bd0b7`, `49211870`) and one authorized, verified policy-record update (graduation policy version 2 → 3, plus its own audit row). No historical artifact regenerated. No Founder device operated. Sep 24 Strength case untouched, not retried. All actions were either read-only (dry runs, zero-write simulations, verification reads) or explicitly, individually authorized by the Founder in this chat session immediately before execution.

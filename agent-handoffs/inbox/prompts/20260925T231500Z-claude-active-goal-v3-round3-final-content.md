Task id: claude-active-goal-v3-round3-final-content-20260925

Continue in the existing persistent PhysiqueOS Active Goal V3 Claude conversation. Reasoning: high.

Founder has reviewed round 2 and requests one final narrow content refinement before approval. This is NOT another broad architecture investigation.

Starting candidates:
Server 2a23eee762472081815d9122b97c0f0a9f1b8969
Native fb4df07df0ba95050c6a70c2aceda791d99791c5
Production remains 09f04dc54eb26bfccdd2aeb34b156d8fc7d3f80e.
Nothing from Goal V3 is deployed.

Read:
agent-handoffs/goal-v3/latest.json
agent-handoffs/reports/20260926T035810Z-goal-v3-round2-candidates-acceptance.md
agent-handoffs/reports/20260926T035810Z-goal-v3-round2-founder-content-preview.md

FOUNDER ROUND-3 DECISION

The Active Goal page does NOT need a Confidence detail sheet or tap-through interaction.

Remove the Goal Confidence detail interaction entirely from the new current-state Goal experience:
- 79% · Moderate is display-only, not tappable.
- Keep the concise V3 Goal confidence thesis immediately beneath it.
- Keep lightweight provenance such as “As of the Sep 23 Midweek Briefing,” generated from publisher metadata.
- Do not expose What supports confidence / What limits confidence / could-raise / could-lower / assumptions as a secondary Goal mini-report.
- Preserve all underlying Confidence V3 evidence and fields in the engine/Server contract as appropriate; this is a presentation decision, not data deletion.
- Do not migrate those detailed confidence facts onto the primary page.
- Do not expose stale time-relative statements such as “49 days left” elsewhere just because the sheet is removed.

KEEP ROUND-2 ARCHITECTURE

Preserve:
1. Hero / confidence thesis
2. Journey / current phase
3. Current Progress / Body Composition
4. Guardrail
5. Training Progress
6. Major Milestones / Turning Points
7. Latest Coaching / Coach’s Take LAST

Preserve the round-2 primary-page deduplication rule and current concise copy unless a change is strictly necessary to remove the Confidence interaction.

COACH’S TAKE / BRIEFING ENGINE

Keep the canonical Sep23 Coach’s Take verbatim. Its meal-log language was historically accurate for that briefing window and historical artifacts remain immutable.

Preserve the prospective shared V3 HealthKit-aware intake-completeness engine correction already in Server 2a23eee7:
- future briefings use coverage-aware intake ambiguity;
- minority meal-derived days do not mischaracterize/temper the whole window;
- majority names the share;
- all meal-derived preserves established wording;
- missing/partial/conflicting remains meaningful uncertainty.

Do not rewrite Sep23.
Do not synthesize Goal-local coaching.
The next naturally published briefing should automatically become the Goal’s latest Coach’s Take and naturally reflect the corrected engine.

NATIVE INTERACTION

For currentState Goal pages:
- remove chevron/disclosure affordance from Confidence;
- remove tap target/sheet presentation;
- ensure VoiceOver does not announce Confidence as a button/link;
- preserve static accessibility label/value/provenance.
- Legacy/completed Goal behavior must not be unintentionally changed. If a shared component is used elsewhere, scope the interaction removal specifically to the active currentState Goal contract unless product semantics prove otherwise.

SERVER

Do not remove useful V3 confidence detail fields merely because Native no longer displays the sheet. Avoid unnecessary contract churn.
Server changes should only be needed if tests/content architecture require them; otherwise retain 2a23eee7 exactly.

TESTS

Add/update tests proving:
- currentState active Goal confidence is noninteractive;
- no disclosure indicator;
- no confidence sheet is reachable/presented;
- primary Goal page still shows score/band/thesis/provenance;
- detailed Confidence evidence is not duplicated onto the page;
- Coach’s Take remains last;
- primary-page dedupe remains;
- round-2 Body Composition/Guardrail/Training/Turning Point content unchanged;
- historical/completed Goal unaffected;
- Native remains descendant of c15f0881;
- prospective Cardio path untouched.

Run focused tests and full Native unit suite if disk/safety permits. Fresh-context review the exact final Native candidate. If Server remains byte-identical to 2a23eee7, do not rerun expensive Server validation unnecessarily; cite round-2 validation and prove no Server diff. If Server changes, rerun required Server tests/webpack/review.

FINAL PRODUCTION-SHAPED PREVIEW

Generate and publish the COMPLETE round-3 Build61 Active Goal page in actual screen order using the candidate Server payload/current production data read-only, mirroring exact Native rendering.

There must be NO Confidence detail-sheet section in the preview.

Include the primary-page dedupe map again.

This is the final Founder content gate. Do not deploy.

GITHUB

Publish:
- round-3 candidate/final-content acceptance report;
- round-3 Founder content preview
to agent-handoffs/reports/ on main.
Update only agent-handoffs/goal-v3/latest.json.
Do not touch other lane pointers.

STOP for Founder content acceptance and release authorization.

NOT AUTHORIZED

No Server deployment.
No Build61 prep/archive/upload.
No TestFlight.
No production mutation.
No historical artifact regeneration.
No DEXA mutation.
No HealthKit policy/reconciliation/ingestion/classifier change.
No Founder-device operation.

Flags:
ROUND3_FINAL_CONTENT_PASS
CONFIDENCE_DISPLAY_ONLY
CONFIDENCE_DETAIL_REMOVED
CONFIDENCE_PROVENANCE_VISIBLE
PRIMARY_PAGE_DEDUP_PASS
COACHS_TAKE_LAST
LATEST_COACHS_TAKE_VERBATIM
FUTURE_BRIEFING_ENGINE_FIX_PRESERVED
HISTORICAL_BRIEFINGS_UNCHANGED
ROUND2_CURRENT_STATE_CONTENT_PRESERVED
COMPLETED_GOAL_UNCHANGED
PERFORMANCE_NATIVE_C15F0881_PRESERVED
HEALTHKIT_PROSPECTIVE_CARDIO_PATH_UNCHANGED
NATIVE_TESTS_PASS
SERVER_UNCHANGED_OR_VALIDATED
FRESH_CONTEXT_REVIEWED
SERVER_DEPLOYED
TESTFLIGHT_UPLOADED
PRODUCTION_MUTATED
GH_REPORT_PUBLISHED

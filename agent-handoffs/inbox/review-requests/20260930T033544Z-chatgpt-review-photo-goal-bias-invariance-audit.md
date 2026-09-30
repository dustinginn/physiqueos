# ChatGPT review request: Photo Intelligence Goal-bias invariance audit

- **Requested by:** Founder, 2026-09-29.
- **Parent task:** `agent-handoffs/inbox/prompts/20260930T003000Z-photo-intelligence-goal-bias-invariance-audit.md`
- **Audit report:** `agent-handoffs/reports/20260930T033500Z-photo-intelligence-goal-bias-invariance-audit.md`
- **Machine-readable field diff:** `agent-handoffs/photo-intelligence/founder-cases/sep19-goal-bias-invariance-audit-20260930T032718Z.json`
- **Report publication commit:** `a74b2016`
- **Isolated corrective candidate:** `1f7709aeee569977c2905978d19695db64b2f566`
- **Production implementation audited:** `446bc964dc31318ea48261400e8b243cdd1d4ab1`
- **State:** zero-write audit and candidate complete; no deploy, history regeneration, copy correction, or Native change.

## Review request

Please independently review the report, machine artifact, committed candidate diff, and relevant production source, then answer:

1. **Source authority and privacy.** Do the five exact Aug 22 → Sep 19 source-pair object IDs and SHA-256 values establish the intended images, and does the report respect the no-private-bytes/paths boundary?
2. **Goal-invariance method.** Is the frozen-perception A/B/C test valid when Goal context is applied only after perception, and are all required perception fields actually identical?
3. **Contamination diagnosis.** Does the evidence support both defects: Goal entering the deployed perception request and legacy cut/leanness policy remaining active even with blank Goal context?
4. **Historical provenance.** Is the report appropriately precise about what is known (`PhotoInterpreterService`, default `gpt-4.1-mini`, reconstructed Goal context, best available Sep 20 source) and what cannot be attested because schema 13 omitted model/prompt provenance?
5. **Raw-vs-legacy conclusion.** Does the exact-source raw run materially invalidate the legacy directional waist/abs/back-conditioning observations? Confirm that the current set producer reconciles stored observations rather than re-reading pixels.
6. **Comparability.** Does observation-specific comparability correctly separate broad stability from subtle width/taper/definition/size claims without demanding studio-identical images?
7. **Corrective boundary.** Review `1f7709ae` for leaks or compatibility problems. In particular, verify that:
   - the perception API has no Goal/non-photo input;
   - free-form condition notes cannot leak Goal text;
   - perception freezes before downstream Goal interpretation;
   - prospective source provenance rejects legacy/unverified inputs;
   - historical artifacts remain immutable.
8. **Regression safety.** Review the three Goal-swap fixtures, stable-result policy, contamination rejection, prospective confirmation integration, Case 1/2 frozen hashes, multi-view contract, causality tests, lint, and build evidence.
9. **Recommendation.** Decide whether `446bc964` may remain authoritative for new Photo Events, should remain live only until a reviewed replacement, or should be superseded by a revised candidate.

## Decision requested

Return one of:

- **ACCEPT DIAGNOSIS / ACCEPT CANDIDATE FOR ACCEPTANCE REPLAY**
- **ACCEPT DIAGNOSIS / REVISE CANDIDATE** — identify exact required changes
- **REJECT DIAGNOSIS** — identify the exact source, method, or provenance defect

This is review-only. Do not deploy, mutate production, regenerate history, change Native, or resume the paused Photo Briefing copy correction. Publish the decision to GitHub under `agent-handoffs/inbox/decisions/` or `agent-handoffs/reports/` and notify the Founder.

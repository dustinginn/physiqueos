# Midweek UI — translation from locked Weekly visual family

Date: 2026-10-04 UTC  
Status: **DARK TRANSLATION READY FOR FOUNDER REVIEW — MIDWEEK NOT LOCKED**

## Authorities

- Assignment authority: `5a8d13f67f85cb3c5a93a43bb497f03207c07ca7`
- Native Build 85: `b8ee8690b194cb90086b62816b9a2c8c400dc026`
- Production Server: `3c0f4aefddbb9a6886f6ad012443978303d47024`
- Locked Weekly reference: B Immersive Story hero + C Dense Analytical body at `agent-handoffs/artifacts/weekly-ui-b-hero-c-body-hybrid-20261004/`
- Approved Recovery architecture: `agent-handoffs/reports/20261001T215335Z-recovery-briefing-v1-design-architecture.md`; prototype authority `1bfa92ef874c3c96f05b23a9d3cbdfb956384156`

## Current Midweek authority audit

The render is based on the actual bound Build 85 `midweek_presentation_contract_v1` path, not Weekly and not legacy Midweek V2.

Current hierarchy:

1. shared Home / Briefing History navigation;
2. integrated lead with one contract-bound Confidence surface, Result headline, Meaning and Goal & Phase;
3. Server-ordered modules: Energy, Weight, Body Composition, Training;
4. bounded Still Unresolved when present;
5. Coach's Take finale populated by distinct contract claims;
6. revision disclosure only when provenance exists.

The full source audit—including mapper ownership, Narrative V3 placement, loading/not-ready/failure states and conditional behavior—is at `agent-handoffs/artifacts/midweek-ui-locked-weekly-translation-20261004/CURRENT-MIDWEEK-AUDIT.md`.

## Graph inventory

Current Native Midweek contains one graph: `WeeklyEnergyCard.chart`, a grouped bar chart of Intake and Estimated expenditure. In the current production-shaped fixture the Server includes it because two paired days meet the threshold. The translation preserves both dates, both series, all four values and the accessibility summary.

No Training time series exists. The compact Training coverage rail is bound directly to the canonical 2 improving / 3 steady counts and does not invent observations.

## Artifacts

Root: `agent-handoffs/artifacts/midweek-ui-locked-weekly-translation-20261004/`

- Full Midweek: `screens/midweek-dark-full.png`
- Hero/top viewport: `screens/midweek-dark-above-fold.png` and `screens/midweek-dark-hero.png`
- Energy data viewport: `screens/midweek-dark-energy.png`
- Body Composition/current baseline: `screens/midweek-dark-body-composition.png`
- Training: `screens/midweek-dark-training.png`
- Future Recovery fixture: `screens/midweek-dark-recovery-future.png`
- Coach's Take/finale: `screens/midweek-dark-coach-finale.png`
- Locked Weekly / Midweek family board: `screens/locked-weekly-midweek-family-board.png`
- Disposable render source: `midweek-dark.html`
- Current contract fixture: `MIDWEEK-NATIVE-FIXTURE.json`
- Future Recovery fixture: `RECOVERY-MIDWEEK-FUTURE-FIXTURE.json`
- Semantic manifest: `SEMANTIC-MANIFEST.json`
- Quantitative map: `QUANTITATIVE-MAPPINGS.md`
- Machine parity proof: `validation.json`
- Human parity proof: `PARITY-PROOF.md`

## Parity result

Passed:

- 61/61 current rendered semantic fields exact;
- zero missing, mismatched, extra or conflicting fields;
- exact Midweek-specific M-ID production order;
- exact navigation destinations;
- one exact Confidence surface: 79%, high, held/no meaningful change, canonical reason and label; ring geometry exactly 79%;
- exact Narrative V3 placement: Result in lead headline, Meaning in lead body, Confidence in lead Confidence, Action and Watch in the finale;
- one exact Energy graph with two dates, two canonical series and four exact bars;
- 23 quantitative marks mapped to canonical source keys with no invented values;
- Body Composition present; Priority Muscle Groups, Training Watch, Biggest Takeaway, revision and production Recovery correctly absent for this fixture;
- all legacy/ineligible fallback strings absent.

## Family consistency

The Midweek lead carries the locked immersive teal/navy field, truthful large Confidence trajectory, editorial Result and integrated Goal/Phase treatment. The body carries the locked dense analytical grammar—open navy canvas, thin rules, aligned metrics, compact structured rows and a strong Coach's Take close.

It remains recognizably Midweek rather than a shortened Weekly: it is 2,733 pt tall versus the longer Weekly reference, uses its own two-day Energy evidence, current-baseline Body Composition, Midweek Training facts, bounded uncertainty and Action/Watch close.

## Recovery rationale

Current production Recovery remains excluded (`included=false`, `no_eligible_evidence`). The approved Recovery Briefing V1 architecture explicitly assigns Midweek a future surface after Training and before Coach's Take. Therefore this exploration includes exactly one separately validated **FUTURE CONTRACT · FIXTURE ONLY** Recovery surface in that location. It uses the approved prototype values, states `Confidence coupling: none`, and does not activate or strategically couple Recovery.

## Accessibility and implementation feasibility

- 402 pt iPhone target, 3× full-resolution render, 51 pt top safe-area treatment.
- Narrative and long-form copy at least 15 pt; left aligned.
- Navigation targets 44 pt.
- Energy chart accessibility summary retained.
- Canonical DOM/VoiceOver order matches current Midweek order.
- Labels and geometry accompany color state.
- The direction is feasible with the existing lead, Energy chart, Training, uncertainty and finale components, but no shipping implementation is authorized or started.

## Shipping isolation

No shipping Native source or behavior changed. No Server behavior or production projection changed. No Recovery policy or activation changed. No build number changed. No build or TestFlight upload was produced.

## Lock state

- Home: locked.
- Log: Compact Command Center dark + mineral light locked.
- Weekly: B Immersive Story hero + C Dense Analytical body locked.
- Midweek: dark translation ready for review; not locked.

# Batch 1 parity matrix

| Family / state | Dark | Mineral Light | Locked hierarchy | Canonical behavior | Notes |
|---|---:|---:|---:|---:|---|
| Home loaded | Captured | Captured | Pass | Preserved | Final approved Home corrections applied, including continuous phase timeline and no Phase 2 progress track. |
| Home confidence | Present | Present | Pass | Preserved | Server-owned percentage and detail destination unchanged. |
| Home Goal / phase / guardrail | Present | Present | Pass | Preserved | Goal and phase navigation unchanged; guardrail is a persistent field, not a phase. |
| Home action / briefing | Present | Present | Founder override | Preserved | Existing destinations and briefing persistence rules unchanged. Redundant purple briefing eyebrow removed by explicit Founder direction; title/date/icon/arrow remain. |
| Home priorities | Present | Present | Pass | Preserved | Inline completion and detail navigation remain separate affordances. |
| Goals root | Captured | Captured | Pass | Preserved | Current journey, history, and unavailable Add Goal state retained. |
| Active Goal | Captured | Captured | Pass | Preserved | Progress, confidence, guardrail, phases, and history semantics retained. |
| Completed Goal | Captured | Captured | Pass | Preserved | Static first/final photo behavior remains unchanged when canonical media exists. |
| Active phase detail | Captured | Captured | Pass | Preserved | Current phase progress and evidence semantics retained. |
| Completed phase detail | Captured | Captured | Pass | Preserved | Completed state and chronology retained. |
| You root | Captured | Captured | Pass | Preserved | Goals, Operating Plan, Settings, and Founder connection are live routes. |
| Settings | Captured | Captured | Pass | Preserved | Appearance is live. Profile, Data Sources, and Sign Out remain deferred and are not dead links. |
| Appearance | Captured | Captured | Pass | Preserved | System / Dark / Light; Light is Mineral Light. Selection and persistence remain owned by the Build 86 appearance store. |
| Loading / error / empty | Code-audited | Code-audited | Preserved | Preserved | Existing state branches remain; this batch changes loaded-state presentation only. |
| Dynamic Type / VoiceOver | Code-audited | Code-audited | Feasible | Preserved | Semantic text remains SwiftUI text; interactive targets remain at least 44 pt; status is not color-only. |

## Deferred by contract

- Profile write contract
- Data Sources projection
- Sign Out coordinator
- All redesign families outside Home, Goals, and You / Settings

## Authority

- Native integration base: Build 86 `cec8af20a6121bb66ecca3ba9f667d91774a891c`
- Home: Founder-selected corrected Home reference, including the final annotated correction supplied in this task
- Goals: `agent-handoffs/artifacts/goals-ui-style-translation-20261004/`
- You / Settings: `agent-handoffs/artifacts/you-settings-profile-ui-design-20261004/`

# Phase-aware active goal preview

`/goals/build-lean-mass` is the production, mobile-first active Build Lean Mass goal page. It presents the canonical goal destination, authored phases, shared guardrail, DEXA baseline, evidence roles, and high-level strategy as `Goal → Phases → Protocols`. The goal owns the destination, phases structure the journey, and protocols support the active phase.

The production page reads existing Founder repositories and reuses the Home phase-trajectory resolver. It does not persist data, change lifecycle state, or generate briefings. Its actions lead to the existing Goal Edit, Operating Plan, and Protocols routes. `/goals/build-lean-mass/preview` remains an isolated, read-only development comparison route backed by the same composer and screen; production navigation does not target it.

Overall goal confidence is owned by `OverallGoalConfidenceReadService`. Home and the active-goal preview consume the same value, band, explanation factors, goal revision, phase fingerprint, evidence fingerprint, version, and date-aligned evaluation snapshot. Preview routes may not recompute confidence locally. Phase readiness remains a separate evidence question and is never substituted for overall confidence. Production-shaped parity tests enforce this ownership boundary.

## Training Progress

Training Progress is a derived, phase-aligned longitudinal review. Its first period runs from the phase start through the day before the planned phase review; for Establish Maintenance that is July 20–August 16, with review on August 17. The goal adapter reuses `TrainingPerformanceIntelligenceService` for canonical movement identity, volume-load change, PR detection, and plateau/regression classification. Checkpoints remain derived and are not persisted.

The production shell is one centered, one-column `393px`-first layout with graceful `360px` behavior, horizontal-overflow protection, safe-area support, and bottom-navigation clearance.

A comparison requires repeated stable canonical movement observations, at least seven days of temporal separation, defensible load/rep data or a conservative PR, sufficient priority-movement coverage, and no disqualifying low-confidence ambiguity. Lower Body, Core, and Arms are summarized only when supported. Before the boundary the UI is waiting or forming; at the boundary it becomes ready when at least two priority movements are defensibly comparable, otherwise it remains limited.

This section describes durable goal-and-phase meaning. Briefings retain short-term coaching, while Training Reporting retains the complete cross-training analysis. Derived checkpoints use deterministic goal, phase, and review-date identity. Only a ready review becomes an Evidence Turning Point. Persistence is intentionally deferred to a future production-promotion decision.

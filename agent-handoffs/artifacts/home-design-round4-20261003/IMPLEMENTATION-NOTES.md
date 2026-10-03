# Round 4 implementation feasibility and reusable primitives

These notes describe a possible later implementation only. No shipping code or tokens were changed.

## Track 1 — Structured Card Hybrid

- Complexity: **Medium**.
- Reusable primitives: edge-to-edge `TrajectoryBanner`, `PrimaryHomeAction`, `BriefingAction`, compact `GoalSummary`, semantic `PhaseRow`, independent `GuardrailRow`, actionable `PriorityCard`, appearance-resolved Home/tab surfaces.
- Surface rules: 16 pt page inset, 9 pt vertical stack, 11 pt phase rhythm, 13–14 pt radii, 54–64 pt actions. The banner deliberately breaks the content inset; Goal stays open; only priorities use a containing card.
- Theme feasibility: strongest direct light/dark parity. The dark version is not a floating-card reinterpretation; it maps the same geometry to ink/navy/teal tokens.
- Risk: current Native theme tokens are fixed dark values and the app forces dark appearance. Shipping the light form still requires adaptive semantic tokens and app-wide QA.
- Log translation readiness: **Strong enough to test next.** The banner, actions, section headers, semantic rows and priority controls can map cleanly to Log. Risk is allowing card density to grow as Log states multiply.

## Track 2 — Editorial Timeline

- Complexity: **High**.
- Reusable primitives: editorial `MetricMasthead`, paired action region, open section header, `TwoPhaseSpine`, cross-phase `ConstraintRail`, open priority rows, adaptive navigation/surface tokens.
- Surface rules: 22 pt editorial inset, 12–20 pt section rhythm, 7 pt action radius. Only interactive actions and the priority collection are bounded; information hierarchy is primarily typography and rules.
- Guardrail: a bracket/parallel rail spans both phase rows. There are exactly two journey nodes. Native accessibility should expose the rail after the phase group with “applies throughout” context.
- Theme feasibility: light and dark use the same composition but deliberately different ink/action/evidence values, not automatic inversion.
- Log translation readiness: **Promising enough to test next.** Open rows and strong date/value typography suit history. Risk is keeping dense evidence states readable without recreating cards everywhere.

## Track 3 — Immersive Trajectory

- Complexity: **Very High**.
- Reusable primitives: `ConfidenceRing79`, decorative `TrajectoryArc79`, immersive `TrajectoryField`, spatial two-phase map, embedded persistent `GuardrailBand`, transition action dock, actionable priorities, appearance-resolved field/meter tokens.
- Surface rules: 20 pt field inset, 18–20 pt internal rhythm, 16 pt action-dock radius, 78 pt paired actions. The trajectory field owns the top information architecture; the lower canvas contains action and execution state.
- Geometry: the foreground and background meters must derive from the same normalized `0.79` progress input. The 21% track gap remains visible in both themes.
- Guardrail: the cyan band is outside the two-node phase path. It is spatially embedded in the Goal field but semantically parallel to both phases.
- Theme feasibility: dark is the primary expression. The mineral light version remains strong because it preserves atmosphere, spatial geometry and a non-white canvas; it should still be validated on OLED/LCD devices and under Increase Contrast.
- Log translation readiness: **Conditional.** The field/meter language may enrich Log summaries, but immersive geometry could compete with data entry and dense evidence history. Test only the reusable field/metric primitives, not an automatic page-wide translation.

## Existing Native foundation that could be reused later

The Build 84 Home models/projection remain authoritative. Existing reusable Native pieces identified in prior audit—typography helpers, theme namespace, card/surface components, Goal/phase presentation, tab navigation and symbols—can supply behavior and semantic structure. Any accepted track should add adaptive semantic roles rather than copy hard-coded colors out of this harness.

True light appearance remains app-wide work: the root currently forces dark mode, theme values are fixed, global purple tint is shared, and UIKit bridges/charts/Briefing/system controls/widgets/Live Activities/Watch require coordinated validation. Home-only light is Medium complexity; full system appearance remains High complexity.

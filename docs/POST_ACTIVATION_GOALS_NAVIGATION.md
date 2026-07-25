# Post-activation Goals navigation

## Stabilization boundary

After Build Lean Mass activated, `/goals` failed because `GoalsHubScreen` derived
detail links from a local three-ID table. The activated goal has a generated ID
and the stable goal type `build_lean_mass`; its type was not carried into the
Goals read model. The table therefore returned `null`, `withReturnContext`
forwarded it, and `GoalNavigationCard` passed it to `next/link`.

Navigation is now derived by the pure `GoalNavigationRouteResolver`. It returns
a structured result containing availability, resolver code, canonical href, and
the identity field used. Stable legacy goal IDs take precedence, followed by
stable goal type. A fixed title allowlist exists only for records that have no
stronger identity. Arbitrary titles never become routes and no href is persisted
to founder state.

Current canonical routes are:

- Build Lean Mass: `/goals/build-lean-mass`, resolved from `build_lean_mass`.
- Visible Abs at Rest: `/goals/visible-abs`.
- Maintain 8-9% Body Fat: `/goals/maintenance`.
- Preserve Lean Mass: `/goals/lean-mass`.

The Build Lean Mass route uses the existing `NarrativeGoalPreviewScreen` through
a narrow read-only presentation adapter. The adapter exposes committed goal
metadata without defining the later fully reconciled goal experience.

`GoalNavigationCard` renders a native link only when resolution succeeds. An
unsupported goal renders as an informational `article`, without `href`, router
navigation, link focus behavior, a fake `#`, or hidden content. The resolver
code and bounded goal identity metadata are logged server-side; founder state is
never logged.

Turbopack development verification returned HTTP 200 for `/goals`,
`/goals/build-lean-mass`, `/goals/visible-abs`, and `/`. The Goals HTML contains
canonical links for Build Lean Mass, Visible Abs, Maintenance, and legacy Lean
Mass preservation. The consumed transition entry does not reappear;
`/goals/transition` remains unavailable rather than reopening activation.

Interactive browser viewport verification was unavailable in this environment.
The existing centered `max-w-[393px]` Goals layout, card classes, focus styles,
and bottom navigation were not changed. Route HTML, focused rendering tests,
Turbopack smoke, lint, build, and production-store fingerprints provide the
fallback verification.

No goal lifecycle, transition draft, protocol ownership, commitment, reminder,
scheduler, evidence, briefing, revision, or commit metadata was modified. Broad
Goals content reconciliation and Home reconciliation remain separate patches.

PhysiqueOS Build 91 — Evidence visual-system redesign mockups

Continue in the existing Claude Native design conversation/work environment best suited to Evidence design.

Do not create child sessions or unnecessary worktrees.

TASK TYPE

DESIGN / REAL-SWIFTUI MOCKUPS ONLY.

Do NOT implement production Build 91 behavior yet.
Do NOT bump a build.
Do NOT upload TestFlight.
Do NOT change Server.
Do NOT mutate production.

Founder will perform another Build 90 physical workout review tomorrow and may add feedback. Keep this lane reviewable and isolated.

CURRENT RELEASE AUTHORITY

Build 90 Native:
32baf1d5f43120cd07088df1210e1dc84ed26a78

Validated integrated pre-bump source:
8fab4fcb6be2c2c9d9f0f87b1123a6e49337fdbd

GOAL

Redesign the Evidence visual color system across all Evidence destinations so it feels native to PhysiqueOS rather than like a separate green-themed subsystem.

Founder feedback:

1. Remove the Evidence-only neon/lime accent in Dark mode.
2. Remove the army/olive green accent in Mineral Light.
3. Current Evidence coloring is inconsistent: most pages use green while Training and Nutrition use unrelated colors.
4. Founder likes the idea that each Evidence domain has its own stable color OR that a small palette of about four existing PhysiqueOS accent families is intentionally reused across the nine Evidence destinations.
5. Use EXISTING PhysiqueOS color language. Do not invent a new Evidence-only palette.
6. Restore real icons on each Evidence Hub rectangle. Current letter tiles T/A/N/etc look like placeholders.
7. Training's dark blue-green/teal card wash is disliked and should go.
8. Nutrition's current card treatment is acceptable but somewhat dull; do not solve that by introducing another bespoke tinted-surface system.
9. Shared surfaces should be consistent across Evidence. Category identity should primarily come from accents, not whole-card background washes.
10. Semantic chart/data colors remain semantic and must not be flattened into category colors.

CORE SYSTEM RULE

Design around:
SHARED NEUTRAL EVIDENCE SURFACES
+
STABLE CATEGORY ACCENTS
+
SEMANTIC DATA COLORS WHERE DATA MEANING REQUIRES THEM.

Do not give every category a tinted card background.

CATEGORY ACCENT MAY APPEAR IN

- Evidence Hub icon/tile accent;
- page hero icon;
- eyebrow;
- selected controls where appropriate;
- links/chevrons;
- small badges;
- chart accent only where the chart has a single category-semantic series and no stronger data-semantic requirement;
- Timeline event identity.

Do not over-apply accent.

SEMANTIC DATA COLORS

Preserve meaningful distinctions such as:
- Nutrition macro colors;
- Energy intake vs estimated expenditure;
- Weight vs DEXA marker;
- Sleep stage semantics;
- other multi-series charts.

These colors do not need to match the page's category accent.

TIMELINE

Timeline is an aggregator.

Do NOT assign Timeline one dominant category color if that harms semantics.

Use the same category map for event dots/labels/icons so Timeline visibly ties the whole Evidence system together.

EVIDENCE HUB

Restore meaningful real icons for every destination.

Audit existing icon assets/SF Symbols/app icon language before choosing.

Do not invent arbitrary glyphs if an established PhysiqueOS icon already exists.

The Hub should visually teach the category-color system.

ALL DESTINATIONS

Audit the actual current Evidence navigation tree and include all current top-level Evidence destinations plus Timeline.

Expected domains include at least:
- Training
- Activity
- Nutrition
- Weight
- Progress Photos
- DEXA
- Energy
- Recovery/Sleep
- Timeline

If the current tree differs, report exact truth and design against current production.

MOCKUP DIRECTIONS

Produce 2–3 coherent visual-system options.

Each option must use only existing or clearly established PhysiqueOS accent families.

Do not create three trivial hue swaps. Each option should express a meaningful category-mapping philosophy, for example:
- distinct stable domain colors;
- controlled four-color reusable family;
- hybrid grouping based on evidence semantics.

For EACH option show enough screens to judge the SYSTEM, not isolated swatches.

Required representative boards:

1. Evidence Hub
- Mineral Light
- Dark
- real icons restored
- Recently Used + All Evidence

2. Training
- Mineral Light and Dark
- remove blue-green card wash
- show how purple or alternative assigned accent works with neutral surfaces

3. Nutrition
- Mineral Light and Dark
- normalize shared surfaces
- preserve macro semantic colors
- avoid dullness without bespoke surface wash

4. Weight
- Mineral Light and Dark
- preserve Weight/DEXA chart semantics

5. Energy
- Mineral Light and Dark
- preserve intake/expenditure series semantics

6. Recovery/Sleep
- Mineral Light and Dark
- preserve sleep chart semantics

7. Progress Photos
- at least one appearance per option, ideally both if inexpensive
- no Founder real media in published boards; use safe synthetic media

8. Timeline
- Mineral Light and Dark
- demonstrate category-colored event identity

9. Compact category-map board
- all nine destinations;
- icon;
- assigned accent in Mineral;
- assigned accent in Dark;
- rationale.

If Activity/DEXA need additional mini-crops to prove category mapping, include them.

SURFACES

Audit current Evidence surface tokens and compare:
- Training bespoke teal surfaces;
- Nutrition surfaces;
- neutral Weight/Recovery/DEXA surfaces;
- Hub surfaces.

Recommend ONE shared card/surface hierarchy for Evidence.

The shared hierarchy must work in both Mineral and Dark.

Do not flatten hierarchy: hero cards, metric tiles, report cards, list rows and charts may retain distinct elevation/border treatments, but these distinctions should be shared system rules rather than category-specific washes.

ACCESSIBILITY

Check:
- contrast;
- selected/unselected controls;
- Dark/Mineral parity;
- color is not the only identity cue;
- icons/labels remain sufficient;
- charts remain distinguishable.

REAL SWIFTUI

Prefer real SwiftUI mockups/captures using DEBUG-only design fixtures, as in prior accepted redesign rounds.

No production review seams.

No Founder production connection.

REPORTING

Publish review boards to a stable GitHub artifact directory.

Publish a main-visible report-only handoff with:
- exact candidate SHA;
- Option A/B/C philosophy;
- category map for each;
- shared surface rules;
- icon choices;
- semantic chart-color preservation;
- screenshots/board paths;
- recommendation, but do not choose for Founder;
- confirmation no production implementation/build bump/TestFlight/Server mutation.

Status:
Build 91 Evidence visual-system options ready for Founder review.

Notify:
PhysiqueOS Build 91 Evidence visual system — mockups ready for review.

STOP.

END TASK.
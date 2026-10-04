# Token and component mapping

## Appearance tokens

| Role | Dark | Mineral light | Use |
|---|---|---|---|
| Page base | deep navy | warm mineral | full Evidence background |
| Primary surface | blue-teal navy | pale mineral/teal | grouped analytical content |
| Elevated semantic field | restrained teal/purple tint | selective stronger pale tint | latest day, source, warning |
| Primary text | near-white | ink/navy | titles and values |
| Secondary text | cool blue-gray | slate | labels and context |
| Divider | low-alpha cool line | mineral-gray line | open lists and tables |
| Nutrition calories/carbs | amber | dark amber | existing macro semantics |
| Protein | rose | deep rose | existing macro semantics |
| Fat | blue | dark blue | existing macro semantics |
| Activity primary | teal | deep teal | active-energy emphasis |
| Warning/provisional | amber | ochre | partial HealthKit anomaly |

Color is always paired with a literal label/value. Dark and light change appearance tokens only; content, order, geometry, semantics, and navigation cues remain identical.

## Reusable components

- Evidence header: eyebrow, title, current description; unchanged hierarchy.
- Scope selector: wrapped pills plus exact date range; supports goal, phase, and all-history states.
- Latest-day hero: canonical summary first, compact metric grid second, one navigation cue only when the current card navigates.
- Open history list: no floating card per row; strong date, supporting context, tabular numeric trailing value.
- Read-only metric grid: two columns, stable label/value order, no Logger inputs or completion controls.
- Provenance field: source scoped to the current day/session; never formatted as a second total.
- State field: same layout family for loading/failure/not-found/empty, preserving exact production copy.
- Existing chart shells: current controls and marks retained; only line, fill, grid, label, and selection styling changes.
- Warning field: icon + exact text so provisional status is not conveyed by color alone.

## Deliberate non-components

No Activity report chart, Nutrition Data Sources route, correction editor, coaching panel, score, or workout classifier is introduced because Build 85 exposes none on these surfaces.

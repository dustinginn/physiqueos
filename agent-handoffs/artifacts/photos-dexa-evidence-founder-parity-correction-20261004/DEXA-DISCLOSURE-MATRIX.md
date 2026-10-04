# DEXA disclosure and graph matrix

## Root order

| Order | Section | Target proof |
|---:|---|---|
| 1 | Evidence Report / DEXA + Viewing Goal | D1 |
| 2 | Latest Scan | D1 |
| 3 | DEXA → Apple Health | D1 |
| 4 | Body Fat, Fat Mass, Lean Mass, Weight, RMR | D1 |
| 5 | Since Prior Scan | D1 |
| 6 | Core Trends | D1/D2 |
| 7 | Supplemental Metrics | D1/D3/D4 |
| 8 | Regional Tissue Lean Mass | D1/D5/D6 |
| 9 | Regional Tissue Fat Mass | D1/D7/D8 |
| 10 | Scan History | D1/D9/D10 |

## Independent disclosures

| Section | Collapsed content | Expanded content | Graphs in expanded state | Metrics / exact units | Production behavior | Target |
|---|---|---|---:|---|---|---|
| Core Trends | Always open | Always complete | 5 | Body Fat `%`; Fat Mass `lb`; Lean Mass `lb`; Total Mass `lb`; RMR `kcal/day` | Not a Show All drawer; every graph interactive | D2 |
| Supplemental Metrics | First 3 rows: VAT Mass, VAT Volume, Android Fat % | All 9 rows | 2 | VAT Mass `lb`; VAT Volume `in³`; Android/Gynoid Fat `%`; A/G Ratio unitless; Bone Mineral Content `lb`; Total BMD `g/cm²`; T-/Z-Score unitless | Own Show All/Close; expanded rows precede VAT Mass and A/G Ratio charts | D3/D4 |
| Regional Tissue Lean Mass | Arms, Legs, Trunk | Arms, Legs, Trunk, Android, Gynoid | 5 | Every row/chart `lb` | Own Show All/Close; expanded rows precede five corresponding charts | D5/D6 |
| Regional Tissue Fat Mass | Arms, Legs, Trunk | Arms, Legs, Trunk, Android, Gynoid | 5 | Every row/chart `lb` | Own Show All/Close; expanded rows precede five corresponding charts | D7/D8 |
| Scan History | First 3 newest rows | All scoped rows newest-first | 0 | Body Fat `%`; Fat/Lean `lb`; RMR `kcal/day` | Own Show All/Close; read-only row; PDF action only when media ID exists | D9/D10 |

Total production DEXA graphs preserved: **17**.  
Independent Show All/Close disclosures audited: **4**.  
Uncovered graphs, metrics, units or disclosure states: **0**.

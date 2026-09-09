# Training Library Reconciliation Audit

- Audit date: 2026-09-08 (America/Los_Angeles)
- Production owner: `user_founder_001`
- Production source parent: `24bdbd77ae873a548b636e7d79e23d7e078e93be`
- Production deployment: `a23af875-ecd8-46f2-be27-d1b995f85506`
- Production origin: `https://physiqueos.dustinginn.com`

## Executive result

The production Training identity graph contains 58 canonical exercises: 48 built-ins, eight Founder-created identities, and two controlled provider materializations. Forty-seven identities have active history spanning 196 Training sessions, 262 exercise occurrences, 1,028 sets, and 118 performance events. The audit found no duplicate canonical IDs, duplicate normalized canonical names, alias collisions, orphaned history, orphaned performance events, label drift, invalid relationship members, or category conflicts.

Two safe read/projection defects were proven and corrected without rewriting canonical data:

1. Library browse was derived only from historical reports, hiding 11 active canonical exercises with no history. It now merges a compact, already-hydrated canonical registry projection with historical metrics. History remains authoritative for set counts and detail reports.
2. The production intake worker interpreted a claimed artifact before hydrating `canonicalExerciseLibrary`. A fresh worker could therefore classify an exact Founder-created identity as provisional. It now performs one owner-scoped, bounded provider read before interpretation.

One historical modeling question is deliberately unchanged: six 2026-08-20/24/25 occurrences store `Super Set` as an execution variant, predating the structured relationship model. Rewriting those records could change historical comparison and performance-event semantics. See **Founder decision**.

## Source-of-truth hierarchy

| Concern | Authoritative source | Fallbacks / restrictions |
| --- | --- | --- |
| Canonical identity | Built-in registry plus owner-scoped PostgreSQL `canonicalExerciseLibrary` | Runtime registration is a read projection, never a new authority. |
| Founder-created identity | `canonicalExerciseLibrary`, `source=evidence_review_user_confirmed` | Exact ID/name/alias resolution only; no fuzzy auto-creation. |
| Historical occurrence | Active canonical Training evidence payload | Stored canonical ID wins; otherwise unique normalized name/alias resolution. |
| Supersession | Canonical evidence status and `supersededBy` | Superseded records do not contribute to active history. |
| Display name | Canonical identity presentation | Historical raw label is retained as evidence metadata, not a competing identity. |
| Category | Supplied category, explicit canonical override, canonical region, canonical primary muscle, bounded special/mapping fallbacks | Canonical metadata cannot be displaced by weaker label heuristics. |
| Sets and history | Active canonical Training occurrences | Registry-only entries contribute zero sets until performed. |
| Performance events | Owner-scoped canonical Training performance events | Event exercise and source-session relationships must resolve to the same canonical identity. |
| Logger / Map existing | Hydrated canonical registry | Performed-first ordering is presentation only; Browse all includes every canonical identity. |
| Library detail routing | Hydrated canonical registry before route-shape resolution | Prevents first-read fallback to a category-shaped route. |

## Inventory summary

| Measure | Production baseline | Reconciled behavior |
| --- | ---: | --- |
| Built-in identities | 48 | 48 |
| Founder-created identities | 8 | 8 |
| Controlled provider materializations | 2 | 2 |
| Total canonical identities | 58 | 58 |
| Identities with active history | 47 | 47 |
| Active canonical identities without history | 11 | 11, now visible in Library |
| Active Training sessions | 196 | unchanged |
| Exercise occurrences | 262 | unchanged |
| Sets | 1,028 | unchanged |
| Performance events | 118 | unchanged |
| Stored canonical-ID gaps | 17 occurrences / 9 deterministic fallback groups | unchanged; all resolve uniquely |
| Duplicate IDs / normalized names / alias targets | 0 / 0 / 0 | unchanged |
| Orphaned history / events | 0 / 0 | unchanged |

Per-identity session totals below are not additive unique sessions because one session can contain multiple identities. `Library yes→yes` means it was visible before and remains visible; `no→yes` identifies the corrected no-history projection. All identities are available in Logger Browse all, Map existing, and direct detail after bounded hydration.

## Complete production identity ledger

| Identity | Provenance / state | Primary / secondary / family / equipment | Aliases and historical labels | Active history | Variants / events | Library category | Surface visibility | Integrity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `iso_lateral_high_row`<br>Iso-Lateral High Rows | built-in; active | P: Lats, Upper Back, Rear Delts<br>S: —<br>High Row; machine | iso lateral high row; iso-lateral high row; isolateral high row; iso lateral high rows; iso-lateral high rows; isolateral high rows; high row machine; machine high row; plate loaded high row; iso lateral row; iso lateral rows<br>Historical: Iso-Lateral High Row | 2026-07-05 → 2026-08-30<br>9 sessions / 9 occurrences / 36 sets | —<br>6 events | back<br>canonical region; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `pull_up`<br>Pull-Ups | built-in; active | P: Lats, Upper Back, Biceps<br>S: —<br>Vertical Pull; bodyweight | pull-up; pull-ups; pull up; pull ups; pullup; pullups<br>Historical: Pull-Up | 2026-07-05 → 2026-08-30<br>9 sessions / 9 occurrences / 36 sets | —<br>1 event | back<br>canonical region; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `reverse_fly_machine`<br>Reverse Fly Machine | Founder-created; active | P: Back<br>S: —<br>—; Machine | — | 2026-08-02 → 2026-08-02<br>1 session / 1 occurrence / 4 sets | —<br>0 events | back<br>canonical primary muscle; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `seated_cable_row`<br>Seated Cable Rows | built-in; active | P: Mid Back, Lats, Biceps<br>S: —<br>Horizontal Pull; cable | seated cable row; seated cable rows; seater cable row; seater cable rows; cable row; cable rows; seated row; seated rows; cable machine seated row; seated mid cable row; cable machine seated mid cable row<br>Historical: Seated Cable Row | 2026-07-05 → 2026-08-16<br>5 sessions / 5 occurrences / 19 sets | —<br>1 event | back<br>canonical region; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `wide_grip_seated_cable_row`<br>Wide Grip Seated Cable Rows | Founder-created; active | P: Back<br>S: —<br>—; — | — | 2026-08-09 → 2026-08-30<br>3 sessions / 3 occurrences / 12 sets | —<br>3 events | back<br>canonical primary muscle; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `bicep_curl_machine`<br>Bicep Curl Machine | Founder-created; active | P: Biceps<br>S: —<br>Elbow Flexion; Machine | Machine Bicep Curl; Biceps Curl Machine | 2026-07-29 → 2026-09-02<br>11 sessions / 11 occurrences / 44 sets | —<br>7 events | biceps<br>canonical primary muscle; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `ez_bar_curl`<br>EZ Bar Curls | built-in; active | P: Biceps<br>S: —<br>Elbow Flexion; EZ bar | ez bar curl; ez bar curls; ez bar carl; ez bar carls; easy bar curl; easy bar curls; curl bar curl; curl bar curls<br>Historical: EZ Bar Curl | 2026-07-04 → 2026-07-25<br>7 sessions / 7 occurrences / 28 sets | —<br>2 events | biceps<br>canonical primary muscle; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `forearm_curl`<br>Forearm Curls | built-in; active | P: Biceps, Forearms<br>S: —<br>Elbow / Wrist Flexion; — | forearm curl; forearm curls; wrist curl; wrist curls | 2026-07-08 → 2026-08-05<br>7 sessions / 7 occurrences / 28 sets | —<br>3 events | biceps<br>canonical primary muscle; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 4; dup/orphan none |
| `spider_curl`<br>Spider Curls | built-in; active | P: Biceps<br>S: —<br>Elbow Flexion; dumbbell | spider curl; spider curls; dumbbell spider curl; dumbbell spider curls<br>Historical: Spider Curl | 2026-07-04 → 2026-09-02<br>18 sessions / 18 occurrences / 72 sets | Static Hold<br>3 events | biceps<br>canonical primary muscle; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `bench_press`<br>Bench Press | built-in; active | P: Chest, Triceps, Front Delts<br>S: —<br>Horizontal Press; barbell | bench press; barbell bench press; flat bench press; chest press; bench | 2026-07-09 → 2026-09-04<br>8 sessions / 8 occurrences / 32 sets | —<br>6 events | chest<br>canonical region; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `chest_fly_machine`<br>Chest Fly Machine | built-in; active | P: Chest<br>S: —<br>Chest Fly; machine | chest fly machine; machine chest fly; machine fly; chest fly; chest flies; pec fly machine; pec deck; pec deck fly | 2026-07-09 → 2026-09-04<br>9 sessions / 9 occurrences / 41 sets | —<br>3 events | chest<br>canonical region; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `chest_press_machine`<br>Chest Press Machine | built-in; active | P: Chest<br>S: Shoulders, Triceps<br>Horizontal Press; machine | chest press machine; machine chest press | 2026-07-16<br>1 session / 1 occurrence / 3 sets | —<br>0 events | chest<br>canonical region; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 1; dup/orphan none |
| `incline_bench_press`<br>Incline Bench Press | built-in; active | P: Upper Chest, Triceps, Front Delts<br>S: —<br>Incline Press; barbell | incline bench press; incline bench; barbell incline bench press; barbell incline bench; incline barbell bench press; incline barbell press | 2026-07-16 → 2026-09-04<br>2 sessions / 2 occurrences / 8 sets | —<br>1 event | chest<br>canonical region; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `incline_dumbbell_press`<br>Incline Dumbbell Press | built-in; active | P: Upper Chest, Triceps, Front Delts<br>S: —<br>Incline Press; dumbbell | incline dumbbell press; dumbbell incline press; incline dumbbell presses; incline db press; incline db presses | 2026-07-09 → 2026-08-28<br>7 sessions / 7 occurrences / 27 sets | —<br>4 events | chest<br>canonical region; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `cable_crunch`<br>Cable Crunches | built-in; active | P: Abs<br>S: —<br>Spinal Flexion; cable | cable crunch; cable crunches; kneeling cable crunch; kneeling cable crunches<br>Historical: Cable Crunch | 2026-07-09 → 2026-09-01<br>8 sessions / 8 occurrences / 32 sets | —<br>3 events | core<br>canonical region; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `hanging_leg_raise`<br>Hanging Leg Raises | built-in; active | P: Abs, Hip Flexors<br>S: —<br>Trunk / Hip Flexion; bodyweight | hanging leg raise; hanging leg raises; hanging knee raise; hanging knee raises; leg raises hanging; hanging raises<br>Historical: Hanging Leg Raise | 2026-07-05 → 2026-08-30<br>12 sessions / 12 occurrences / 48 sets | —<br>2 events | core<br>canonical region; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `plank`<br>Planks | built-in; active | P: Abs, Obliques, Deep Core<br>S: —<br>Isometric Core; bodyweight | plank; planks; front plank; front planks<br>Historical: Plank | 2026-07-09<br>1 session / 1 occurrence / 4 sets | —<br>0 events | core<br>canonical region; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `glute_squat`<br>Glute Squats | built-in; active | P: Glutes, Quads<br>S: —<br>Squat; — | glute squat; glute squats<br>Historical: Glute Squat | 2026-07-17 → 2026-07-21<br>2 sessions / 2 occurrences / 8 sets | —<br>0 events | glutes<br>explicit canonical override; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `hip_thrusts`<br>Hip Thrusts | built-in; active | P: Glutes<br>S: Hamstrings<br>Hip Thrust; — | hip thrust; hip thrusts | 2026-07-07 → 2026-08-31<br>6 sessions / 6 occurrences / 20 sets | —<br>4 events | glutes<br>canonical primary muscle; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 1; dup/orphan none |
| `hyperextension_machine`<br>Hyperextension Machine | built-in; active | P: Lower Back, Glutes, Hamstrings<br>S: —<br>Hip Hinge; machine | hyperextension machine; hypertension machine | 2026-07-17 → 2026-08-31<br>5 sessions / 5 occurrences / 19 sets | —<br>3 events | glutes<br>explicit canonical override; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `pendulum_kick_back_machine`<br>Pendulum Kick Back Machine | Founder-created; active | P: Glutes<br>S: —<br>—; Machine | — | 2026-08-20 → 2026-08-31<br>2 sessions / 2 occurrences / 7 sets | —<br>1 event | glutes<br>canonical primary muscle; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `romanian_deadlift`<br>Romanian Deadlifts | built-in; active | P: Hamstrings, Glutes, Lower Back<br>S: —<br>Hip Hinge; — | romanian deadlift; romanian deadlifts; rdl; rdls; dumbbell rdl; dumbbell rdls; barbell rdl; barbell rdls<br>Historical: Romanian Deadlift | 2026-07-17 → 2026-08-20<br>3 sessions / 3 occurrences / 11 sets | —<br>0 events | glutes<br>explicit canonical override; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `seated_hip_adductions`<br>Seated Hip Adductions | built-in; active | P: Glutes, Adductors<br>S: —<br>Hip Adduction; hip adduction machine | seated hip adduction; seated hip adductions; hip adduction; hip adductions; hip adduction machine; seated adduction; seated adductions | 2026-07-07 → 2026-08-31<br>5 sessions / 5 occurrences / 18 sets | Super Set<br>1 event | glutes<br>explicit canonical override; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 1; dup/orphan none |
| `smith_machine_hip_thrust`<br>Smith Machine Hip Thrusts | Founder-created; active | P: Glutes<br>S: —<br>—; Machine | — | 2026-07-30<br>1 session / 1 occurrence / 5 sets | —<br>0 events | glutes<br>canonical primary muscle; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `sumo_squat_machine`<br>Sumo Squat Machine | provider-materialized; active | P: Glutes, Quads<br>S: —<br>Squat; machine | — | 2026-07-07 → 2026-09-03<br>3 sessions / 3 occurrences / 11 sets | —<br>2 events | glutes<br>explicit canonical override; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 1; dup/orphan none |
| `leg_press_high_narrow`<br>Leg Press High And Narrow Feet | provider-materialized; active | P: Hamstrings, Glutes, Quads<br>S: —<br>Squat / Press; leg press machine | Leg Press, High And Narrow Feet<br>Historical: Leg Press, high and narrow feet | 2026-07-07 → 2026-09-03<br>6 sessions / 6 occurrences / 23 sets | —<br>7 events | hamstrings<br>explicit canonical override; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 1; dup/orphan none |
| `lying_leg_curl`<br>Lying Leg Curls | built-in; active | P: Hamstrings<br>S: —<br>Knee Flexion; machine | lying leg curl; lying leg curls; lying hamstring curl; lying hamstring curls; prone leg curl; prone leg curls<br>Historical: Lying Leg Curl | 2026-07-17 → 2026-09-03<br>5 sessions / 5 occurrences / 19 sets | —<br>2 events | hamstrings<br>explicit canonical override; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `seated_leg_curl`<br>Seated Leg Curl | built-in; active | P: Hamstrings<br>S: —<br>Knee Flexion; machine | seated leg curl; seated leg curls; seated hamstring curl; seated hamstring curls | 2026-08-27<br>1 session / 1 occurrence / 3 sets | —<br>0 events | hamstrings<br>explicit canonical override; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `bulgarian_split_squat`<br>Bulgarian Split Squat | built-in; active | P: Quads, Glutes<br>S: —<br>Split Squat; — | bulgarian split squat; bulgarian split squats; bulgarian squat; bulgarian squats; split squat; split squats | no history | —<br>0 events | quads<br>canonical primary muscle; high | Library no→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `bulgarian_split_squat_smith_machine`<br>Bulgarian Split Squat (Smith Machine) | built-in; active | P: Quads, Glutes<br>S: —<br>Split Squat; Smith machine | bulgarian split squat (smith machine); bulgarian split squat smith machine; smith machine bulgarian split squat; smith machine bulgarian split squats; smith bulgarian split squat | 2026-07-10 → 2026-08-17<br>4 sessions / 4 occurrences / 14 sets | —<br>2 events | quads<br>canonical primary muscle; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `dumbbell_reverse_lunge`<br>Dumbbell Reverse Lunge | built-in; active | P: Quads, Glutes, Hamstrings<br>S: —<br>Reverse Lunge; dumbbell | dumbbell reverse lunge; dumbbell reverse lunges; reverse dumbbell lunge; reverse dumbbell lunges; reverse lunge with dumbbells; reverse lunges with dumbbells; deficit dumbbell reverse lunge; deficit dumbbell reverse lunges | no history | —<br>0 events | quads<br>canonical primary muscle; high | Library no→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `hack_squat`<br>Hack Squats | built-in; active | P: Quads, Glutes<br>S: —<br>Squat; hack squat machine | hack squat; hack squats; machine hack squat; machine hack squats; hack squat machine | 2026-07-23 → 2026-08-27<br>6 sessions / 6 occurrences / 25 sets | —<br>4 events | quads<br>explicit canonical override; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `leg_extension`<br>Leg Extensions | built-in; active | P: Quads<br>S: —<br>Knee Extension; leg extension machine | leg extension; leg extensions; machine leg extension; machine leg extensions; leg extension machine<br>Historical: Leg Extension | 2026-07-10 → 2026-08-27<br>8 sessions / 8 occurrences / 28 sets | Super Set<br>1 event | quads<br>explicit canonical override; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `leg_press`<br>Leg Press | built-in; active | P: Quads, Glutes<br>S: —<br>Squat / Press; machine | leg press; leg presses; machine leg press | no history | —<br>0 events | quads<br>canonical primary muscle; high | Library no→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `leg_press_feet_high`<br>Leg Press (Feet High) | built-in; active | P: Quads, Glutes<br>S: —<br>Squat / Press; machine | leg press (feet high); leg press feet high; high feet leg press; high foot leg press | no history | —<br>0 events | quads<br>canonical primary muscle; high | Library no→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `leg_press_feet_low`<br>Leg Press (Feet Low) | built-in; active | P: Quads, Glutes<br>S: —<br>Squat / Press; machine | leg press (feet low); leg press feet low; low feet leg press; low foot leg press | no history | —<br>0 events | quads<br>canonical primary muscle; high | Library no→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `leg_press_feet_middle`<br>Leg Press (Feet Middle) | built-in; active | P: Quads, Glutes<br>S: —<br>Squat / Press; machine | leg press (feet middle); leg press feet middle; leg press middle feet; middle foot leg press | 2026-07-10 → 2026-08-17<br>4 sessions / 4 occurrences / 16 sets | —<br>3 events | quads<br>canonical primary muscle; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `leg_press_sumo_stance`<br>Leg Press (Sumo Stance) | built-in; active | P: Quads, Glutes<br>S: —<br>Squat / Press; machine | leg press, sumo; sumo leg press; leg press sumo; leg press (sumo); leg press (sumo stance) | 2026-07-17 → 2026-08-10<br>3 sessions / 3 occurrences / 12 sets | —<br>1 event | quads<br>canonical primary muscle; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `pendulum_squat`<br>Pendulum Squat | built-in; active | P: Quads, Glutes<br>S: —<br>Squat; machine | pendulum squat; pendulum squats | no history | —<br>0 events | quads<br>canonical primary muscle; high | Library no→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `pendulum_squat_machine`<br>Pendulum Squat Machine | built-in; active | P: Quads, Glutes<br>S: —<br>Squat; machine | pendulum squat machine; pendulum squat machines; pendulum machine squat; pendulum machine squats | 2026-07-10 → 2026-09-03<br>6 sessions / 6 occurrences / 22 sets | Static Hold<br>3 events | quads<br>canonical primary muscle; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `seated_hip_abductions`<br>Seated Hip Abductions | built-in; active | P: Quads, Hip Abductors<br>S: —<br>Hip Abduction; hip abduction machine | seated hip abduction; seated hip abductions; hip abduction; hip abductions; hip abduction machine; seated abduction; seated abductions | 2026-07-23 → 2026-08-20<br>4 sessions / 4 occurrences / 14 sets | Super Set<br>4 events | quads<br>explicit canonical override; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `single_leg_leg_press`<br>Single-Leg Leg Press | built-in; active | P: Quads, Glutes<br>S: —<br>Single-Leg Press; leg press machine | single leg leg press; single-leg leg press; single-leg press; single leg press; unilateral leg press | 2026-07-23 → 2026-08-20<br>4 sessions / 4 occurrences / 15 sets | —<br>2 events | quads<br>explicit canonical override; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `sissy_squat`<br>Sissy Squats | built-in; active | P: Quads<br>S: —<br>Knee-Dominant Squat; — | sissy squat; sissy squats; bodyweight sissy squat; bodyweight sissy squats; weighted sissy squat; weighted sissy squats | 2026-07-23 → 2026-08-25<br>4 sessions / 4 occurrences / 17 sets | Super Set<br>1 event | quads<br>explicit canonical override; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `smith_machine_reverse_lunge`<br>Smith Machine Reverse Lunge | built-in; active | P: Quads, Glutes, Hamstrings<br>S: —<br>Reverse Lunge; Smith machine | smith machine reverse lunge; smith machine reverse lunges; smith reverse lunge; smith reverse lunges; reverse lunge on the smith machine; reverse lunges on the smith machine; deficit smith machine reverse lunge; deficit smith machine reverse lunges | no history | —<br>0 events | quads<br>canonical primary muscle; high | Library no→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `squat`<br>Squat | built-in; active | P: Quads, Glutes<br>S: —<br>Squat; barbell | squat; squats; barbell squat; barbell squats | no history | —<br>0 events | quads<br>canonical primary muscle; high | Library no→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `step_ups`<br>Step Ups | Founder-created; active | P: Quads<br>S: —<br>—; — | — | 2026-08-13<br>1 session / 1 occurrence / 3 sets | —<br>0 events | quads<br>canonical primary muscle; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `walking_lunge`<br>Walking Lunge | built-in; active | P: Quads, Glutes, Hamstrings<br>S: —<br>Lunge; — | walking lunge; walking lunges; walking dumbbell lunge; walking dumbbell lunges | 2026-08-13 → 2026-08-27<br>2 sessions / 2 occurrences / 6 sets | —<br>0 events | quads<br>canonical primary muscle; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `barbell_front_raises`<br>Barbell Front Raises | built-in; active | P: Front Delts<br>S: —<br>Front Raise; barbell | barbell front raise; barbell front raises | 2026-07-06<br>1 session / 1 occurrence / 4 sets | —<br>0 events | shoulders<br>canonical region; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 1; dup/orphan none |
| `cable_machine_front_raise`<br>Cable Machine Front Raises | built-in; active | P: Front Delts<br>S: —<br>Front Raise; cable | cable machine front raise; cable machine front raises<br>Historical: Cable Machine Front Raise | 2026-07-13 → 2026-09-08<br>8 sessions / 8 occurrences / 32 sets | —<br>5 events | shoulders<br>canonical region; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `dumbbell_front_raise`<br>Dumbbell Front Raise | built-in; active | P: Front Delts<br>S: —<br>Front Raise; dumbbell | dumbbell front raise; dumbbell front raises; db front raise; db front raises | no history | —<br>0 events | shoulders<br>canonical region; high | Library no→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `dumbbell_shoulder_press`<br>Dumbbell Shoulder Press | Founder-created; active | P: Shoulders<br>S: —<br>—; — | — | 2026-08-18<br>1 session / 1 occurrence / 4 sets | —<br>0 events | shoulders<br>canonical primary muscle; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `front_raise`<br>Front Raise | built-in; active | P: Front Delts<br>S: —<br>Front Raise; — | front raise; front raises | no history | —<br>0 events | shoulders<br>canonical region; high | Library no→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `lateral_raise`<br>Lateral Raise | built-in; active | P: Side Delts<br>S: —<br>Lateral Raise; — | lateral raise; lateral raises; side lateral raise; side lateral raises; dumbbell lateral raise; dumbbell lateral raises; cable lateral raise; cable lateral raises | no history | —<br>0 events | shoulders<br>canonical region; high | Library no→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `lateral_raise_machine`<br>Lateral Raises Machine | built-in; active | P: Side Delts<br>S: —<br>Lateral Raise; machine | lateral raise machine; lateral raises machine; machine lateral raise; machine lateral raises | 2026-07-06 → 2026-09-08<br>9 sessions / 9 occurrences / 36 sets | —<br>4 events | shoulders<br>canonical region; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 2; dup/orphan none |
| `shoulder_press_machine`<br>Shoulder Press Machine | built-in; active | P: Front Delts, Side Delts, Triceps<br>S: —<br>Vertical Press; machine | shoulder press machine; machine shoulder press; shoulder machine press; machine press; shoulder press | 2026-07-06 → 2026-09-08<br>8 sessions / 8 occurrences / 32 sets | —<br>12 events | shoulders<br>canonical region; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `cable_pushdown`<br>Cable Rope Pushdowns | built-in; active | P: Triceps<br>S: —<br>Elbow Extension; cable | cable pushdown; cable pushdowns; cable rope pushdown; cable rope pushdowns; triceps pushdown; tricep pushdown; rope pushdown; rope pushdowns | 2026-07-08 → 2026-09-02<br>15 sessions / 15 occurrences / 62 sets | —<br>6 events | triceps<br>canonical primary muscle; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 5; dup/orphan none |
| `skull_crushers`<br>Skull Crushers | Founder-created; active | P: Triceps<br>S: —<br>—; — | — | 2026-08-01 → 2026-08-22<br>6 sessions / 6 occurrences / 24 sets | —<br>2 events | triceps<br>canonical primary muscle; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |
| `straight_bar_cable_pushdown`<br>Straight Bar Cable Pushdowns | built-in; active | P: Triceps<br>S: —<br>Elbow Extension; cable | straight bar cable pushdown; straight bar cable pushdowns; straight bar pushdown; straight bar pushdowns; cable straight bar pushdown; cable straight bar pushdowns<br>Historical: Straight Bar Cable Pushdown | 2026-07-08 → 2026-09-02<br>11 sessions / 11 occurrences / 44 sets | —<br>3 events | triceps<br>canonical primary muscle; high | Library yes→yes; Logger yes; Map yes; detail yes | stored-ID gaps 0; dup/orphan none |

## Important identity and category findings

- `bicep_curl_machine` remains the sole Bicep Curl Machine identity. It is Founder-created, Biceps, and resolves by ID, canonical name, and its two explicit aliases on the first bounded read.
- `seated_leg_curl` and `lying_leg_curl` are distinct canonical machine identities. Both are high-confidence Hamstrings mappings.
- All 58 identities resolve to exactly one Library category. Counts are Chest 5, Back 5, Shoulders 8, Biceps 4, Triceps 3, Core 3, Quads 19, Hamstrings 3, and Glutes 8. Calves and the dormant canonical Adductors category currently contain no identities.
- Region-before-primary-muscle precedence is intentional when the region is canonical. Reversing it would incorrectly move Incline Bench Press, Incline Dumbbell Press, Pull-Ups, Seated Cable Rows, Shoulder Press Machine, and Romanian Deadlifts. Lower-body exceptions remain centralized explicit mappings.
- Equipment variants remain distinct: machine/free-weight raises, leg-press stances, Pendulum Squat versus Pendulum Squat Machine, Smith versus generic Bulgarian split squat/reverse lunge, Hip Thrusts versus Smith Machine Hip Thrusts, and machine versus dumbbell shoulder press.
- `seated_abductions` is a deterministic legacy route/ID remap to `seated_hip_adductions`; historical canonical data was not rewritten.

## Historical fallback groups

Seventeen active occurrences lack a stored canonical exercise ID but resolve uniquely through exact normalized canonical names or aliases. No fuzzy or order-dependent match is required.

| Historical label | Canonical identity | Occurrences |
| --- | --- | ---: |
| Lateral Raises Machine | `lateral_raise_machine` | 2 |
| Barbell Front Raises | `barbell_front_raises` | 1 |
| Seated Hip Adductions | `seated_hip_adductions` | 1 |
| Hip Thrusts | `hip_thrusts` | 1 |
| Leg Press, High And Narrow Feet | `leg_press_high_narrow` | 1 |
| Sumo Squat Machine | `sumo_squat_machine` | 1 |
| Forearm Curls | `forearm_curl` | 4 |
| Cable Rope Pushdowns | `cable_pushdown` | 5 |
| Chest Press Machine | `chest_press_machine` | 1 |

## Day, Library, event, variant, and relationship parity

- Every one of the 47 identities visible in active Training Day history resolves to the same Library identity and detail route.
- All 118 performance events resolve to a canonical exercise and an active source session; event/session exercise mismatches, label mismatches, duplicate event IDs, and duplicate achievement semantics are all zero.
- Event types are 68 `session_volume_pr` and 50 `reps_at_load_pr` across 36 exercises.
- Eleven occurrences carry a display/execution variant: five `Static Hold` occurrences and six legacy `Super Set` occurrences.
- Two sessions use the current structured superset relationship model. Both groups and every member reference are valid. One performance event retains an execution variant; none incorrectly claims structured relationship context.

## Collision and orphan audit

| Check | Result |
| --- | --- |
| Duplicate canonical IDs | 0 |
| Duplicate normalized canonical names | 0 |
| Alias resolving to multiple canonical IDs | 0 |
| Unknown stored canonical IDs | 0 |
| Active historical occurrence without a unique resolution | 0 |
| Performance event without canonical identity | 0 |
| Performance event without active source session | 0 |
| Relationship group with missing member | 0 |
| Identity label drift on stored canonical IDs | 0 |

## Surface behavior and performance

Authenticated production baselines were captured against direct custom-domain ingress; these are browser navigation wall times and exclude the old ngrok path.

| Surface | Baseline | Status |
| --- | ---: | --- |
| Training landing | 872 ms | PASS |
| Active Build Lean Mass | 852 ms | PASS |
| Completed Visible Abs | 625 ms | PASS |
| All Training | 653 ms | PASS |
| Resistance reporting | 1,100 ms | PASS |
| Training history | 526 ms | PASS |
| Training Day (Sep 8) | 292 ms | PASS |
| Library landing | 400 ms | PASS |
| Category pages | 221–431 ms | PASS |
| Built-in exercise detail | 164–340 ms | PASS |
| Founder-created Bicep Curl Machine detail | 493 ms | PASS |
| Training Logger | 568 ms | PASS |

Provider query boundaries remain bounded: Library uses one registry query plus three Training-store reads; detail uses one registry query plus four scoped reads; Day uses one registry query plus user/date reads; Logger uses one registry query plus one batched core query. The new worker path adds one owner-scoped registry query only after a job is actually claimed. None of these paths loads the compatibility runtime.

## Corrections

### Library canonical projection

The Training navigation read service now adds a compact projection containing only canonical ID, label, region, movement family, and primary-muscle metadata. The screen merges that projection with historical report rows by canonical ID. Historical rows overlay registry-only rows and remain the only source of sets, counts, PRs, dates, and detail history. This exposes the 11 no-history identities without duplicating performed identities or broadening the Training evidence query.

### Fresh-worker identity hydration

Canonical registry registration and taxonomy validation now share one application service. The production worker uses the Phase 4 canonical record store to list only owner-scoped `canonicalExerciseLibrary` records immediately after a successful claim and before interpretation. Replays already completed or claimed elsewhere do not query or interpret. Native sandbox worker composition is separate and unchanged.

## Founder decision

| Finding | Evidence | Safe options | Recommendation |
| --- | --- | --- | --- |
| Six old occurrences encode `Super Set` as an execution variant rather than a structured relationship. | Leg Extensions/Sissy Squats on Aug 24–25 and seated hip adduction/abduction on Aug 20 predate the relationship-group model. | A: preserve as legacy display/comparison metadata. B: authorize a separate historical migration after reconstructing partner ordering and recalculating affected comparison/event semantics. | **A — preserve.** Do not rewrite canonical history inside this reconciliation. |

## Correctness and isolation guardrails

- No canonical evidence, exercise library record, set, event, Goal attribution, effective date, supersession link, or relationship was mutated during the audit or implementation.
- Production reads remain owner-scoped to `user_founder_001`.
- Native sandbox auth, database authority, worker, outbox, API work, and manual Weight flow are not imported into or modified by these production read changes.
- No schema migration, index, paid cache, service tier, capacity, CDN, or other infrastructure was added. Incremental cost: **$0**.

## Validation record

| Gate | Result |
| --- | --- |
| Focused registry/composition/navigation/worker/screen/taxonomy | 113 passed |
| Provider-worker artifact collection and boot | 9 passed |
| Phase 6 Training | 151 passed |
| Native sandbox | 239 passed |
| Phase 4 | 75 passed |
| Phase 5 | 25 passed |
| Production build | PASS |
| ESLint | PASS; two pre-existing `<img>` warnings, zero errors |
| `git diff --check` | PASS |
| Focused secret scan | PASS; no matches |

Phase 3, broad Phase 6, and migration-safety retain baseline failures reproduced on the exact untouched parent `24bdbd77`: tests requiring the intentionally absent private Founder runtime fixture, retired `FounderRepositories.runInReadScope`/route assertions, and stale local deployment-script expectations. No unrelated test was weakened to mask them. All tests directly affected by this change pass.

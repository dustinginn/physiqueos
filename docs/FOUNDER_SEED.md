# Founder Seed Pack

## Purpose

The Founder Seed Pack defines the canonical historical import format for Founder Alpha.

This document does not contain the founder's private historical data.

It defines the schema, source metadata, priority rules, conflict resolution rules, and migration strategy that will be used to transform historical records into domain-shaped seed data.

The goal is to preserve existing history in a format that can later move from local seed files to local persistence, cloud persistence, and integrations without changing UI components.

---

# Canonical Principles

1. Every record includes source metadata.

2. Historical data is imported into domain models, not UI fixtures.

3. Repositories remain the application data boundary.

4. Raw imported data should be preserved when practical.

5. Derived values should be marked as derived or estimated.

6. DEXA calibrates body composition.

7. Manual corrections override automated records when they describe the same observation.

8. Protocols provide context; they do not directly change calculations.

---

# Source Metadata

Every imported record should include a `source` object.

```js
{
  source: {
    type: "manual",
    name: "PhysiqueOS",
    externalId: null,
    importedAt: "2026-06-28T00:00:00.000Z",
    confidence: "high",
    notes: ""
  }
}
```

Every record may also include `fieldProvenance`.

```js
{
  fieldProvenance: {
    imported: ["measuredAt", "weight.value"],
    computed: ["trend", "confidence"]
  }
}
```

Imported fields are evidence. Computed fields are PhysiqueOS outputs derived from evidence.

Founder import should populate imported fields first. Computed fields should be generated later by services or engines unless they are being imported from a trusted historical calculation and clearly marked.

## Evidence and Goal Relationships

Evidence records may include `relatedGoalIds`.

```js
{
  relatedGoalIds: ["goal_visible_abs_at_rest"]
}
```

Evidence can support multiple goals, and each goal can query many supporting evidence records. Home should show compact goal status, while future Goal Detail screens should explain goal progress using related evidence from weight, DEXA, progress photos, daily check-ins, protocols, and analyses.

## Operating Profile

Founder Alpha seed data includes the founder's operating profile:

- `operatingPlan`
- `operatingRhythm`
- `adaptiveTrustProfile`

The Operating Plan is the approved strategy. It includes nutrition, training, protocols, supplements, evidence protocols, reminder preferences, and future acquisition preferences.

The Operating Rhythm describes when life normally happens. It includes wake time, workout windows, fasting windows, evidence timing, and protocol timing.

Adaptive Trust describes how PhysiqueOS reduces friction as the user proves consistency. It defines when to ask for confirmations, when to use exception reporting, and which reminders PhysiqueOS owns versus connected systems.

These records are not raw evidence. They are operating context used by Analysis, Today's Priorities, Coach, Confidence, and future notification systems.

`relatedGoalIds` models relevance only. It does not score progress, estimate visual changes, or overwrite observed evidence.

## Source Types

Supported source types:

- `manual`
- `seed`
- `apple-health`
- `dexa`
- `imported`
- `estimated`
- `photo`
- `smart-scale`
- `api`
- `computed`
- `manual_estimate`
- `apple_watch_manual_estimate`

## Source Confidence

Recommended confidence values:

- `high`
- `medium`
- `low`

Confidence describes record reliability, not user performance.

---

# Import Schema

The canonical import may be represented as one JSON object.

```js
{
  version: "founder-seed-v1",
  importedAt: "2026-06-28T00:00:00.000Z",
  user,
  goals,
  weightHistory,
  dexaHistory,
  photoHistory,
  protocolHistory,
  nutritionContext,
  reminders,
  milestones,
  dailyCheckIns,
  analyses
}
```

---

# User

```js
{
  id: "user_founder_001",
  firstName: "Dustin",
  lastName: "",
  email: "",
  timezone: "America/Los_Angeles",
  dateOfBirth: null,
  sex: "male",
  height: {
    value: 72,
    unit: "in"
  },
  avatarUrl: "",
  source: {
    type: "manual",
    name: "Founder Alpha",
    externalId: null,
    importedAt: "2026-06-28T00:00:00.000Z",
    confidence: "high",
    notes: ""
  }
}
```

Maps to:

```text
src/data/seed/user.js
```

---

# Goals

Goals define outcomes. They should not be confused with protocols, which define strategy or execution context.

```js
{
  id: "goal_body_fat_10",
  userId: "user_founder_001",
  title: "10% Body Fat",
  type: "body_composition",
  primary: true,
  status: "active",
  startDate: "2026-06-01",
  targetDate: "2026-07-18",
  startValue: 18,
  currentValue: 12.4,
  targetValue: 10,
  unit: "%",
  metricKey: "bodyFatPercentage",
  confidence: 94,
  source: {
    type: "manual",
    name: "Founder Alpha",
    externalId: null,
    importedAt: "2026-06-28T00:00:00.000Z",
    confidence: "high",
    notes: "Primary Founder Alpha goal."
  }
}
```

Maps to:

```text
src/data/seed/goals.js
```

---

# Weight History

Each weight record represents one weight observation.

```js
{
  id: "weight_2026_06_28",
  userId: "user_founder_001",
  measuredAt: "2026-06-28T07:15:00.000Z",
  date: "2026-06-28",
  relatedGoalIds: ["goal_maintain_8_9_body_fat", "goal_visible_abs_at_rest"],
  weight: {
    value: 171.5,
    unit: "lb"
  },
  context: {
    timing: "morning",
    nutritionState: "fasted",
    intakeState: "before_food_water",
    scale: "normal_home_scale",
    conditions: [],
    confidence: "high",
    notes: null,
    isDefault: true
  },
  reliability: "high",
  notes: "",
  source: {
    type: "manual",
    name: "PhysiqueOS",
    externalId: null,
    importedAt: "2026-06-28T07:16:00.000Z",
    confidence: "high",
    notes: ""
  }
}
```

Maps to:

```text
src/data/seed/weights.js
```

## Weight Import Notes

For daily body-weight trend calculations, the canonical daily weight should be selected after conflict resolution.

Raw duplicate weights may be preserved in a future raw import archive, but seed repositories should expose the selected canonical record unless a feature explicitly needs raw samples.

Manual weights should carry weigh-in context. If context is not explicitly provided, entries inherit the user's default weigh-in context. For Founder Alpha, Dustin's default is morning, fasted, before food/water, normal home scale, high confidence. If conditions differ, preserve the raw observed weight and store the unusual context rather than adjusting or overwriting the value.

---

# DEXA History

DEXA records are authoritative calibration evidence for body composition.

```js
{
  id: "dexa_2026_06_20",
  userId: "user_founder_001",
  measuredAt: "2026-06-20T10:00:00.000Z",
  date: "2026-06-20",
  provider: "BodySpec",
  relatedGoalIds: [
    "goal_maintain_8_9_body_fat",
    "goal_preserve_lean_mass",
    "goal_visible_abs_at_rest"
  ],
  totalMass: {
    value: 170.3,
    unit: "lb"
  },
  bodyFatPercentage: 12.4,
  fatMass: {
    value: 21.3,
    unit: "lb"
  },
  leanMass: {
    value: 149,
    unit: "lb"
  },
  boneMass: {
    value: null,
    unit: "lb"
  },
  boneMineralContent: {
    value: null,
    unit: "lb"
  },
  restingMetabolicRate: {
    value: null,
    unit: "kcal/day"
  },
  visceralFat: null,
  visceralAdiposeTissue: {
    mass: {
      value: null,
      unit: "lb"
    },
    volume: {
      value: null,
      unit: "in3"
    }
  },
  androidFatPercentage: null,
  gynoidFatPercentage: null,
  androidGynoidRatio: null,
  regionalAssessment: {
    arms: null,
    legs: null,
    trunk: null,
    android: null,
    gynoid: null,
    total: null
  },
  muscleBalance: {
    rightArm: null,
    leftArm: null,
    rightLeg: null,
    leftLeg: null
  },
  boneDensity: {
    totalBMD: null,
    tScore: null,
    zScore: null
  },
  sourceFileId: null,
  source: {
    type: "dexa",
    name: "BodySpec",
    externalId: null,
    importedAt: "2026-06-28T00:00:00.000Z",
    confidence: "high",
    notes: "Authoritative body composition calibration."
  }
}
```

Maps to:

```text
src/data/founderSeed/dexaScans.js
```

---

# Progress Photos

Progress photos are structured visual evidence. They do not replace DEXA and should not produce body-fat estimates until a future explicit analysis pipeline exists. They provide visual validation for qualitative goals such as Visible Abs.

```js
{
  id: "photo_2026_06_28_front_relaxed",
  userId: "user_founder_001",
  date: "2026-06-28",
  capturedAt: "2026-06-28T07:20:00.000Z",
  uploadedAt: "2026-06-28T08:00:00.000Z",
  imagePath: "private/founder/photos/2026-06-28-front-relaxed.jpg",
  relatedGoalIds: ["goal_visible_abs_at_rest"],
  view: "front",
  pose: "relaxed",
  conditions: {
    morning: true,
    fasted: true,
    sameLighting: true,
    sameMirror: true,
    postWorkout: false,
    pump: false,
    notes: null
  },
  linkedWeightEntryId: "weight_2026_06_28",
  nearestDexaScanId: "dexa_2026_06_20",
  source: {
    type: "photo",
    name: "Founder",
    externalId: null,
    importedAt: "2026-06-28T08:00:00.000Z",
    confidence: "medium",
    notes: "Private founder progress photo."
  },
  fieldProvenance: {
    imported: [
      "date",
      "capturedAt",
      "uploadedAt",
      "imagePath",
      "view",
      "pose",
      "conditions",
      "linkedWeightEntryId",
      "nearestDexaScanId"
    ],
    computed: []
  }
}
```

Maps to:

```text
src/data/founderSeed/progressPhotos.js
```

Private image files belong in:

```text
private/founder/photos/
```

Import should attempt to read EXIF capture date when available. If capture date, view, pose, or conditions cannot be read automatically, store `null` or `unknown` and prepare the record for later user confirmation.

Supported pose values include `relaxed`, `flexed`, `double_biceps`, and `unknown`.

---

# Nutrition Context

Manual nutrition context gives the Intelligence Engine interpretation context. It does not override observed weight, DEXA, progress photos, or daily check-ins.

```js
{
  id: "nutrition_context_founder_alpha",
  userId: "user_founder_001",
  estimatedDailyCaloricIntake: {
    min: 1900,
    max: 2200,
    unit: "kcal",
    source: {
      type: "manual_estimate",
      name: "Founder",
      confidence: "medium"
    }
  },
  estimatedDailyActiveCalorieBurn: {
    value: 1000,
    unit: "kcal",
    marginOfErrorPercent: 30,
    notes: "Apple Watch active calorie estimate; Founder Alpha should account for up to 30% possible wearable error.",
    source: {
      type: "apple_watch_manual_estimate",
      name: "Founder",
      confidence: "medium"
    }
  },
  source: {
    type: "manual_estimate",
    name: "Founder",
    confidence: "medium"
  }
}
```

Maps to:

```text
src/data/founderSeed/nutritionContext.js
```

---

# Protocol History

Protocols describe context that may influence weight, appetite, adherence, recovery, body composition, and trajectory changes.

Protocols do not directly change calculations. They provide evidence and context for interpretation.

Examples:

- Retatrutide
- Tesamorelin
- Creatine
- Electrolytes
- Refeeds
- Maintenance phases
- Reverse dieting
- Supplements
- Medications
- Training blocks

```js
{
  id: "protocol_retatrutide",
  userId: "user_founder_001",
  name: "Retatrutide",
  category: "peptide",
  relatedGoalIds: ["goal_maintain_8_9_body_fat", "goal_visible_abs_at_rest"],
  startDate: "2026-05-21",
  endDate: null,
  status: "active",
  dose: {
    value: 2,
    unit: "mg"
  },
  doseUnit: "mg",
  doseHistory: [
    {
      label: "week_1",
      dose: 0.5,
      doseUnit: "mg",
      status: "completed",
      startDate: "2026-05-21",
      endDate: null
    }
  ],
  frequency: {
    interval: 1,
    unit: "week",
    daysOfWeek: []
  },
  schedule: {
    type: "weekly",
    frequency: "weekly",
    dayOfWeek: "thursday",
    daysOfWeek: ["thursday"],
    timeOfDay: "night",
    timingContext: "fasted_before_bed",
    nextScheduledAt: null
  },
  notes: "Track appetite, adherence, recovery, and weight trend changes while active.",
  source: {
    type: "manual",
    name: "Founder Alpha",
    externalId: null,
    importedAt: "2026-06-28T00:00:00.000Z",
    confidence: "high",
    notes: ""
  }
}
```

Maps to:

```text
src/data/seed/protocols.js
```

---

# Reminders

Reminders are app-visible scheduling records for future notification systems. Founder Alpha stores them, but does not send push notifications.

```js
{
  id: "reminder_weekly_progress_photos",
  userId: "user_founder_001",
  title: "Weekly Progress Photos",
  type: "evidence_reminder",
  linkedEntityType: "progress_photo",
  linkedEntityId: null,
  linkedEvidenceType: "progress_photo",
  relatedGoalIds: ["goal_visible_abs_at_rest"],
  schedule: {
    type: "weekly",
    cadence: "weekly",
    interval: 1,
    unit: "week",
    preferredDay: "thursday",
    daysOfWeek: ["thursday"],
    timeOfDay: "morning",
    timezone: null
  },
  defaultContext: {
    morning: true,
    fasted: true,
    sameLighting: true,
    sameMirror: true,
    postWorkout: false,
    pump: false
  },
  expectedViews: ["front-relaxed", "back-relaxed", "back-double-biceps"],
  active: true,
  nextDueAt: null,
  completedAt: null,
  notes: "",
  source: {
    type: "manual",
    name: "PhysiqueOS",
    externalId: null,
    importedAt: null,
    confidence: "medium",
    notes: ""
  }
}
```

Maps to:

```text
src/data/founderSeed/reminders.js
```

---

# Milestones

Milestones represent meaningful points along a goal trajectory.

```js
{
  id: "milestone_under_13_body_fat",
  userId: "user_founder_001",
  goalId: "goal_body_fat_10",
  title: "Under 13% Body Fat",
  metricKey: "bodyFatPercentage",
  targetValue: 13,
  unit: "%",
  targetDate: "2026-06-30",
  achievedAt: "2026-06-20T10:00:00.000Z",
  status: "achieved",
  source: {
    type: "dexa",
    name: "BodySpec",
    externalId: null,
    importedAt: "2026-06-28T00:00:00.000Z",
    confidence: "high",
    notes: "Achieved based on DEXA measurement."
  }
}
```

Maps to:

```text
src/data/seed/milestones.js
```

---

# Daily Check-Ins

Daily check-ins capture manual adherence, recovery, protocol completion, and subjective context.

```js
{
  id: "checkin_2026_06_28",
  userId: "user_founder_001",
  date: "2026-06-28",
  weightEntryId: "weight_2026_06_28",
  relatedGoalIds: ["goal_maintain_8_9_body_fat", "goal_visible_abs_at_rest"],
  completedFocusItems: ["morning-weight"],
  nutrition: {
    proteinTargetHit: false,
    calorieTargetHit: null,
    estimatedCalories: 2200,
    estimatedCaloriesIn: 2200,
    estimatedCaloriesBurned: 2800,
    proteinTarget: 180,
    proteinAchieved: 170,
    relatedGoalIds: ["goal_preserve_lean_mass"],
    notes: ""
  },
  activity: {
    activityRingClosed: false,
    workoutCompleted: null,
    steps: null
  },
  recovery: {
    sleepHours: null,
    sleepTargetHit: false
  },
  protocols: {
    completedProtocolIds: [],
    changeNote: ""
  },
  mood: null,
  notes: "",
  source: {
    type: "manual",
    name: "PhysiqueOS",
    externalId: null,
    importedAt: "2026-06-28T08:00:00.000Z",
    confidence: "medium",
    notes: ""
  }
}
```

Maps to:

```text
src/data/seed/dailyCheckIns.js
```

---

# Analyses

Analysis records are generated interpretation, not raw evidence.

They explain what changed, why it matters, how confidence changed, how Home changed, and what the recommendation is.

Analysis records are immutable once created.

```js
{
  id: "analysis_2026_06_28_weight",
  createdAt: "2026-06-28T07:16:00.000Z",
  title: "Weight Recorded",
  summary: "Weight recorded.",
  evidenceIds: ["weight_2026_06_28"],
  evidenceTypes: ["weight"],
  findings: [
    {
      title: "Evidence received",
      detail: "Weight evidence was recorded."
    }
  ],
  impacts: [
    {
      area: "home",
      detail: "Home data can now refresh from the latest evidence."
    }
  ],
  recommendation: {
    title: "Review trend before changing course",
    rationale: "Continue reviewing trend data before making changes.",
    action: null
  },
  confidenceBefore: null,
  confidenceAfter: null,
  homeChanges: [
    {
      section: "home",
      change: "eligible_for_refresh"
    }
  ],
  tone: "info",
  source: {
    type: "computed",
    name: "PhysiqueOS",
    externalId: null,
    importedAt: null,
    confidence: "medium",
    notes: ""
  },
  fieldProvenance: {
    imported: ["evidenceIds", "evidenceTypes"],
    computed: [
      "title",
      "summary",
      "findings",
      "impacts",
      "recommendation",
      "confidenceBefore",
      "confidenceAfter",
      "homeChanges",
      "tone"
    ]
  }
}
```

Maps to:

```text
src/data/founderSeed/analyses.js
```

---

# Source Hierarchy

Source priority should be domain-specific.

## Weight

1. `manual`
2. `smart-scale`
3. `apple-health`
4. `imported`
5. `estimated`
6. `seed`

Manual weight overrides Apple Health weight for the same day.

## Body Composition

1. `dexa`
2. `manual`
3. `smart-scale`
4. `estimated`
5. `imported`
6. `seed`

DEXA is the authoritative calibration source for body composition.

## Protocols

1. `manual`
2. `imported`
3. `api`
4. `estimated`
5. `seed`

Protocols provide contextual evidence but do not directly change calculations.

## Reminders

1. `manual`
2. `api`
3. `imported`
4. `seed`

Reminders schedule future user-visible tasks. They do not imply evidence was completed until the linked action or completion record exists.

Evidence reminders define expected recurring evidence such as morning weigh-ins and weekly progress photos. Protocol reminders define expected protocol actions such as Retatrutide and Tesamorelin dosing. They are app-visible records only until a notification system exists.

## Daily Check-Ins

1. `manual`
2. `apple-health`
3. `api`
4. `imported`
5. `estimated`
6. `seed`

Manual check-ins are preferred because they capture intent and context that automated sources may miss.

## Photos

Photos provide visual validation rather than calculated measurements.

Photo-derived estimates should be stored as `estimated`, not as authoritative measurements.

Original progress photos are `photo` source evidence. EXIF capture dates should be used when available, but view, pose, and conditions should remain `unknown` or `null` unless verified by metadata or user confirmation.

## Analysis

Analysis source is usually `computed`.

Analysis should reference evidence IDs rather than duplicating raw evidence.

Analysis should not overwrite evidence records.

---

# Conflict Resolution Rules

## Same-Day Weight Conflicts

If multiple weights exist for the same date:

1. Prefer the highest-priority source.
2. If sources are equal, prefer the earliest morning measurement.
3. If measurement timing is unknown, prefer the latest imported correction.
4. Preserve discarded records in a raw import archive when possible.

## DEXA Conflicts

If multiple DEXA records exist for the same date:

1. Prefer the record with an attached source file.
2. Prefer the named provider over an unknown provider.
3. Prefer the latest manually verified record.
4. Never average multiple DEXA scans unless the user explicitly marks them as duplicates.

## Goal Conflicts

If historical imports contain multiple active primary goals:

1. Keep only one active primary goal.
2. Archive older goals unless they represent secondary goals.
3. Preserve original goal dates.

## Protocol Conflicts

If overlapping protocols appear similar:

1. Do not merge automatically.
2. Flag for manual review.
3. Preserve protocol dates because timing is important context for trajectory interpretation.

## Daily Check-In Conflicts

If multiple check-ins exist for the same date:

1. Prefer the manually edited check-in.
2. Merge non-conflicting fields.
3. Preserve notes from both records when possible.
4. If fields conflict, keep the value from the higher-priority source and flag the merge.

---

# Transformation Into Seed Repositories

Historical import should transform data in stages.

```text
Raw historical files
  -> Parse
  -> Normalize to canonical Founder Seed Pack
  -> Resolve source conflicts
  -> Create domain records
  -> Write src/data/seed/*
  -> Seed repositories expose records
  -> HomeBriefingService composes view models
```

## Transform Targets

```text
Founder Seed User
  -> src/data/seed/user.js

Founder Seed Goals
  -> src/data/seed/goals.js

Founder Seed Weight History
  -> src/data/seed/weights.js

Founder Seed DEXA History
  -> src/data/seed/dexaScans.js

Founder Seed Progress Photos
  -> src/data/founderSeed/progressPhotos.js

Founder Seed Protocol History
  -> src/data/seed/protocols.js

Founder Seed Nutrition Context
  -> src/data/founderSeed/nutritionContext.js

Founder Seed Reminders
  -> src/data/founderSeed/reminders.js

Founder Seed Milestones
  -> src/data/seed/milestones.js

Founder Seed Daily Check-Ins
  -> src/data/seed/dailyCheckIns.js

Founder Seed Analyses
  -> src/data/founderSeed/analyses.js
```

---

# Migration Strategy

## Phase 1: Collect Raw History

Gather exports and records without modifying application seed files.

Expected sources:

- manual founder notes
- weight history
- DEXA reports
- progress photos
- Apple Health export
- protocol history
- supplement history
- training block notes
- check-in notes

## Phase 2: Normalize Into Canonical JSON

Convert raw history into the schemas in this document.

Do not calculate derived values yet beyond basic unit normalization.

## Phase 3: Resolve Conflicts

Apply source hierarchy and conflict rules.

Produce:

- canonical accepted records
- rejected duplicate records
- manual review list

## Phase 4: Generate Seed Files

Transform accepted records into the existing domain seed files.

## Phase 5: Repository Verification

Verify that seed repositories can read:

- current user
- active goal
- latest weight
- latest DEXA
- active protocols
- current daily check-in

## Phase 6: HomeBriefingService

Only after repositories are verified, compose Home data from repositories.

---

# Recommendations Before First Historical Import

1. Confirm units for every source before import.

2. Decide the canonical timezone for daily records.

3. Export or collect raw source files into a private location outside the repo.

4. Decide whether private founder data should ever be committed.

5. Create a manual review list for ambiguous protocol dates and duplicate weights.

6. Define a stable ID convention before generating seed files.

7. Keep raw Apple Health export data out of UI-facing code.

8. Keep DEXA PDFs or images separate from normalized DEXA records.

9. Add repository verification checks before wiring data to Home.

10. Do not implement Apple Health integration until historical seed import and repository access are stable.

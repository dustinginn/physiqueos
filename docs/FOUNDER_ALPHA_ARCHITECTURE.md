# Founder Alpha Architecture

## Purpose

Founder Alpha turns PhysiqueOS from a fixture-driven visual prototype into a real personal health application backed by a clean data layer.

The goal is not to implement every future integration immediately.

The goal is to establish domain models, repository interfaces, seed data, and data flow boundaries so the current Home UI can keep working while future data sources are added without rewriting presentation components.

---

# Principles

1. The UI consumes view models, not raw fixtures.

2. Repositories are the boundary between application code and storage or integrations.

3. Seed data is treated as a local data source, not as UI-owned demo state.

4. Calculations live in engines and selectors, not React components.

5. Future integrations add adapters behind repositories.

6. The Intelligence Engine remains platform-independent.

---

# Initial Domain Model

These models describe Founder Alpha scope. They should start as plain JavaScript objects with documented shapes. TypeScript can be introduced later if it provides enough long-term value.

## Imported vs Computed Fields

Founder Alpha distinguishes imported evidence from computed values.

Imported fields come from manual entry, seed data, Apple Health, DEXA, historical imports, or other source records.

Computed fields are produced by PhysiqueOS services or engines from imported evidence.

Every domain record may include:

```js
{
  source: {
    type: "manual",
    name: "PhysiqueOS",
    externalId: null,
    importedAt: null,
    confidence: "high",
    notes: ""
  },
  fieldProvenance: {
    imported: ["measuredAt", "weight.value"],
    computed: []
  }
}
```

Rules:

1. Imported evidence should not be overwritten by computed values.

2. Computed values should be reproducible from imported evidence whenever practical.

3. If a value is estimated, its source should be `estimated` or the field should be listed under `computed`.

4. UI components should not decide whether a field is imported or computed.

## Evidence and Goals

Every evidence record may support one or more goals through `relatedGoalIds`.

Every goal may be supported by many evidence records. This relationship lets the Intelligence Engine gather the evidence relevant to a goal without making UI components understand source-specific records.

Home shows compact goal status. Future Goal Detail screens should explain progress by querying supporting evidence across repositories, including weight entries, DEXA scans, progress photos, daily check-ins, protocols, and analyses.

This relationship does not score goals yet. It only models evidence relevance.

## Operating Plan

The Operating Plan is the user's approved strategy for pursuing the primary goal. It is not a measurement and it is not raw evidence.

The plan contains:

- nutrition targets and preferred nutrition sources
- training expectations
- active protocols and supplements
- recurring evidence protocols
- reminder preferences
- future evidence acquisition preferences

Future Coach recommendations may propose changes to the Operating Plan, but the user approves changes before they become active.

For Founder Alpha, the primary goal remains Visible Abs at Rest. Supporting objectives such as Preserve Lean Mass, Enter and Sustain 8-9% Body Fat, Nutrition, and Recovery support that primary goal, but they do not all need completion percentages. Supporting objectives can use status, trend, forecast, confidence, or other purpose-specific presentations.

## Operating Rhythm

Operating Rhythm is separate from the Operating Plan.

The plan describes what should happen. Rhythm describes when life normally happens.

Rhythm can include:

- typical wake time
- weekday and weekend workout windows
- typical bedtime
- fasting window
- normal evidence timing
- protocol timing

Founder Alpha stores the founder's rhythm manually. Future versions should learn rhythm automatically from evidence and connected systems.

## Adaptive Trust

Adaptive Trust describes how much friction PhysiqueOS should require from the user.

As adherence and evidence consistency improve, the system should move from daily confirmations to occasional confirmations to exception reporting.

Example:

1. Initially, confirm Tesamorelin nightly.
2. Later, ask whether anything deviated yesterday.
3. Only request details when the user says yes or when evidence quality drops.

Adaptive Trust should reduce effort without reducing traceability. It should never silently invent evidence.

## Notification Ownership

Notifications and Today's Priorities are different concepts.

Notifications help the user execute the Operating Plan, sometimes without opening the app. Today's Priorities are the few actions currently most valuable for goal progress, evidence quality, or decision quality.

PhysiqueOS should not duplicate reminders owned by connected systems such as Apple Watch, Oura, or Cronometer.

PhysiqueOS should own reminders that require cross-system context:

- protocols
- dose changes
- progress photos
- DEXA
- Coach recommendations
- evidence quality

## Today's Priorities and Priority Detail

Today's Priorities is the operating system's opinion about the few actions that matter most today. It is not a habit tracker and it should not force a fixed number of cards.

Priority rendering adapts to workload:

- one priority may show title, subtitle, and useful metadata
- two priorities show title and short subtitle
- three or more priorities become compact title-only actions

Every priority links to Priority Detail. Priority Detail is the operational view for a task and can include:

- what to do
- when to do it
- how to prepare
- why it matters
- related primary goal
- related supporting objectives
- protocol week and dosage
- upcoming dose changes
- completion action

Home keeps the information budget low; Priority Detail provides the context the user should not have to hunt for.

## Daily Briefing

Daily Briefing is the primary intelligence experience inside PhysiqueOS.

It is not a dashboard, a report, or a summary of metrics. Dashboards exist to explore data. Daily Briefing exists to answer:

> Given everything we know this morning, what do I need to understand and what should I do?

The user should finish reading the briefing feeling informed, confident, and ready to execute the day.

Every meaningful evidence event can create an immutable Analysis record and refresh the current Daily Briefing. Analysis records explain the evidence event. Daily Briefing composes the latest Founder evidence, goal intelligence, confidence, current protocols, nutrition context, priorities, and operating plan into a richer daily interpretation.

PhysiqueOS should behave like a high-performing coach who reviews every available piece of evidence before speaking. That evidence may include:

- historical trends
- today's measurements
- recent progress photos
- DEXA history
- protocol adherence
- nutrition
- recovery
- training
- wearable data
- confidence scores
- active goals
- operating plan
- unfinished priorities

The briefing should synthesize evidence into guidance rather than repeat raw data.

Daily Briefing answers six questions in order:

1. What happened?
2. What does it mean?
3. How are you progressing?
4. What should you do today?
5. What should you expect next?
6. Coach's Insight

### 1. What happened?

Present objective facts only. Do not interpret.

Examples:

- Weight: 167.3 lb
- No change from yesterday
- Lowest weight maintained
- Sleep: 7h 52m
- Calories: 2,015
- Completed Tesamorelin
- Missed Foam Roll

Everything in this section should be directly measurable.

### 2. What does it mean?

Interpret today's evidence using historical context.

Examples:

- Holding a new low after a significant drop is consistent with normal stabilization rather than stalled fat loss.
- Weight increased, but the seven-day trend continues downward.
- Recovery improved despite stable body weight.

This section explains why today's measurements matter.

### 3. How are you progressing?

Evaluate progress toward goals. Never evaluate metrics in isolation.

Examples:

- Primary Goal: Visible Abs at Rest, 92%, High Confidence
- Secondary Goal: Maintain 8-9% Body Fat, On Track
- Lean Mass: Stable, recent DEXA supports preservation

The emphasis is progress toward outcomes rather than individual numbers.

### 4. What should you do today?

Generate today's operating plan dynamically from active protocols, scheduled training, recovery requirements, nutrition targets, unfinished priorities, evidence collection needs, and current confidence.

Examples:

- Complete Tesamorelin.
- Upper-body training.
- Stay within calorie target.
- Take weekly progress photos.
- Prioritize sleep tonight due to declining recovery.

This section should never become a static checklist.

### 5. What should you expect next?

Prepare the user for what is likely to happen. Reducing uncertainty increases confidence and adherence.

Examples:

- Expect little scale movement over the next one to three days.
- Visual improvements may outpace scale changes from this point forward.
- Recovery may begin declining if the current deficit continues.
- Temporary water retention after leg day would be expected tomorrow.

Expectation management is a coaching responsibility.

### 6. Coach's Insight

End every briefing with a concise synthesis that integrates evidence, context, confidence, and direction into a single coherent message.

The insight should never feel like a templated metric recap. It should feel like a coach who has reviewed the complete picture before speaking.

Good example:

> Your body is behaving exactly as expected after reaching a new low. Holding the same weight today is consistent with normal water stabilization rather than loss of momentum. Recent DEXA results, progress photos, and strong protocol adherence continue to support a high-confidence trajectory toward visible abs at rest. No changes to today's plan are recommended.

### Fact, Interpretation, Recommendation

Daily Briefing must separate facts from reasoning.

Every statement should belong to one of three categories:

- Facts describe reality.
- Interpretation explains reality.
- Recommendations determine today's actions.

This separation builds trust because users can distinguish objective evidence from PhysiqueOS reasoning.

Home remains intentionally lightweight. It should link to the latest Daily Briefing instead of duplicating the briefing's interpretation.

A Daily Briefing is successful if, after reading it, the user can answer three questions without opening any other screen:

1. What changed?
2. What does it mean?
3. What should I do today?

If additional screens are required to answer these questions, the briefing has failed its primary purpose.

## Conversational Capture and Onboarding

Evidence capture should eventually become conversational. The user describes what happened, PhysiqueOS extracts structured evidence, shows a confirmation screen, and saves only after confirmation.

Conversational onboarding follows the same principle. Instead of forms, the system asks natural questions, populates the Operating Plan, Operating Rhythm, and acquisition preferences, then asks the user to review the interpreted profile before confirming.

## User

Represents the person using PhysiqueOS.

```js
{
  id: "user_founder_001",
  firstName: "Dustin",
  lastName: "",
  email: "",
  timezone: "America/Los_Angeles",
  dateOfBirth: null,
  sex: null,
  height: {
    value: 72,
    unit: "in"
  },
  avatarUrl: "",
  source: {
    type: "manual",
    name: "PhysiqueOS",
    externalId: null,
    importedAt: null,
    confidence: "high",
    notes: ""
  },
  fieldProvenance: {
    imported: ["firstName", "height.value"],
    computed: []
  },
  createdAt: "2026-06-28T00:00:00.000Z",
  updatedAt: "2026-06-28T00:00:00.000Z"
}
```

## Goal

Represents a measurable objective. Founder Alpha should support one primary active goal, while allowing secondary goals.

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
    name: "PhysiqueOS",
    externalId: null,
    importedAt: null,
    confidence: "high",
    notes: ""
  },
  fieldProvenance: {
    imported: ["title", "targetValue", "targetDate"],
    computed: ["currentValue", "confidence"]
  },
  createdAt: "2026-06-28T00:00:00.000Z",
  updatedAt: "2026-06-28T00:00:00.000Z"
}
```

Recommended enums:

- `type`: `body_composition`, `performance`, `habit`, `health_marker`
- `status`: `active`, `paused`, `completed`, `archived`

## WeightEntry

Represents a weight observation from manual entry, Apple Health, smart scale, import, or future source.

```js
{
  id: "weight_2026_06_28",
  userId: "user_founder_001",
  measuredAt: "2026-06-28T07:15:00.000Z",
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
  source: {
    type: "manual",
    name: "PhysiqueOS",
    externalId: null
  },
  reliability: "high",
  notes: "",
  createdAt: "2026-06-28T07:16:00.000Z",
  updatedAt: "2026-06-28T07:16:00.000Z"
}
```

Recommended source types:

- `manual`
- `apple_health`
- `smart_scale`
- `csv_import`
- `api`

Manual entries inherit the user's `defaultWeighInContext` unless the user explicitly records different conditions. Founder Alpha defaults are morning, fasted, before food/water, normal home scale, and high confidence. Different-condition weigh-ins remain observed evidence and still preserve the raw weight, but analysis should treat them as lower-confidence or context-adjusted until future calculations model the context more deeply.

## DEXAScan

Represents a body composition measurement from a DEXA scan.

```js
{
  id: "dexa_2026_06_20",
  userId: "user_founder_001",
  measuredAt: "2026-06-20T10:00:00.000Z",
  relatedGoalIds: [
    "goal_maintain_8_9_body_fat",
    "goal_preserve_lean_mass",
    "goal_visible_abs_at_rest"
  ],
  provider: "BodySpec",
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
  visceralFat: null,
  sourceFileId: null,
  source: {
    type: "manual",
    name: "PhysiqueOS",
    externalId: null
  },
  createdAt: "2026-06-20T10:15:00.000Z",
  updatedAt: "2026-06-20T10:15:00.000Z"
}
```

## ProgressPhoto

Represents visual calibration evidence. Progress photos do not replace DEXA and should not generate body-fat estimates until a future explicit analysis pipeline exists. They provide visual validation for qualitative goals such as Visible Abs.

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
    externalId: null
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

Recommended values:

- `view`: `front`, `back`, `side`, `unknown`
- `pose`: `relaxed`, `flexed`, `double_biceps`, `unknown`

Photo import should attempt to read EXIF capture date when available. If view, pose, or conditions cannot be inferred safely, keep them `unknown` or `null` and queue the record for future user confirmation.

## Milestone

Represents a meaningful point along a goal trajectory.

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
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-20T10:00:00.000Z"
}
```

Recommended statuses:

- `upcoming`
- `at_risk`
- `achieved`
- `missed`

## Protocol

Represents a structured intervention, phase, or recurring action that provides context for interpreting weight, body composition, appetite, adherence, recovery, and trajectory changes.

Protocols can represent peptides, supplements, medications, training blocks, refeeds, maintenance phases, reverse dieting, electrolyte plans, or other structured strategies.

```js
{
  id: "protocol_retatrutide_founder",
  userId: "user_founder_001",
  name: "Retatrutide",
  category: "peptide",
  relatedGoalIds: ["goal_maintain_8_9_body_fat", "goal_visible_abs_at_rest"],
  status: "active",
  startDate: "2026-05-21",
  endDate: null,
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
  notes: "Track appetite, weight trend, recovery, and adherence changes.",
  source: {
    type: "manual",
    name: "PhysiqueOS",
    externalId: null
  },
  createdAt: "2026-06-03T00:00:00.000Z",
  updatedAt: "2026-06-28T00:00:00.000Z"
}
```

Recommended categories:

- `medication`
- `peptide`
- `supplement`
- `nutrition`
- `training`
- `recovery`
- `lifestyle`
- `other`

Recommended statuses:

- `planned`
- `active`
- `paused`
- `completed`

Protocols are contextual evidence. They should inform interpretation of weight, appetite, adherence, recovery, body composition, and trajectory changes, but they should not directly change body-composition calculations yet.

## NutritionContext

Represents manual Founder Alpha nutrition and energy context. It helps Analysis interpret observed evidence, but it does not calculate precise deficit or override measurements.

```js
{
  id: "nutrition_context_founder_alpha",
  userId: "user_founder_001",
  estimatedDailyCaloricIntake: {
    min: 1900,
    max: 2200,
    unit: "kcal"
  },
  estimatedDailyActiveCalorieBurn: {
    value: 1000,
    unit: "kcal",
    marginOfErrorPercent: 30,
    notes: "Apple Watch active calorie estimate; Founder Alpha should account for up to 30% possible wearable error."
  },
  source: {
    type: "manual_estimate",
    name: "Founder",
    confidence: "medium"
  }
}
```

## DailyCheckIn

Represents a daily summary of manually reported behaviors and protocol completion.

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
    changeNote: "No protocol change."
  },
  mood: null,
  notes: "",
  createdAt: "2026-06-28T08:00:00.000Z",
  updatedAt: "2026-06-28T08:00:00.000Z"
}
```

## Reminder

Represents an app-visible schedule record that future notification systems can use. Founder Alpha does not implement push notifications yet.

```js
{
  id: "reminder_morning_weigh_in",
  userId: "user_founder_001",
  title: "Log morning weight",
  type: "evidence_reminder",
  linkedEntityType: "daily_check_in",
  linkedEntityId: null,
  linkedEvidenceType: "weight",
  schedule: {
    type: "daily",
    interval: 1,
    unit: "day",
    daysOfWeek: [],
    cadence: "morning",
    timeOfDay: "morning",
    timezone: "America/Los_Angeles"
  },
  defaultContext: {
    morning: true,
    fasted: true,
    beforeFoodWater: true,
    normalHomeScale: true
  },
  active: true,
  nextDueAt: null,
  completedAt: null,
  notes: "",
  source: {
    type: "manual",
    name: "PhysiqueOS"
  }
}
```

Supported reminder types:

- `evidence_reminder`
- `protocol_reminder`
- `protocol`
- `progress_photo`
- `dexa`
- `morning_weigh_in`
- `other`

## Analysis

Represents generated interpretation after new evidence enters PhysiqueOS.

Evidence is observed input. Analysis is generated interpretation.

The Analysis answers:

> What changed, why does it matter, and what should I do next?

Analysis records are immutable once created. If later evidence changes the interpretation, PhysiqueOS should create a new Analysis rather than rewriting the prior one.

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

Home displays the current state. Latest Analysis explains what changed.

---

# Repository Architecture

Repositories expose domain operations to application services and screens. They hide whether data comes from seed files, local storage, Apple Health, uploaded DEXA files, or cloud storage.

## Repository Interfaces

Initial repository interfaces should be asynchronous even if seed data is local. This prevents UI code from changing later when cloud or device APIs are introduced.

```js
// UserRepository
getCurrentUser()
getUserById(userId)
updateUser(userId, patch)

// GoalRepository
listGoals(userId)
getActiveGoal(userId)
getGoalById(goalId)
saveGoal(goal)
updateGoal(goalId, patch)

// WeightRepository
listWeightEntries(userId, range)
getLatestWeightEntry(userId)
addWeightEntry(entry)
importWeightEntries(entries, source)

// DEXARepository
listDEXAScans(userId)
getLatestDEXAScan(userId)
addDEXAScan(scan)
attachDEXAFile(scanId, file)

// ProgressPhotoRepository
listPhotos(userId, range)
getPhotosByDate(userId, date)
getLatestPhotos(userId, limit)
createPhoto(photo)
importPhotos(photos, source)

// MilestoneRepository
listMilestones(userId, goalId)
saveMilestone(milestone)
updateMilestone(milestoneId, patch)

// ProtocolRepository
listProtocols(userId)
listActiveProtocols(userId)
getProtocolById(protocolId)
saveProtocol(protocol)
updateProtocol(protocolId, patch)

// NutritionContextRepository
getNutritionContext(userId)

// DailyCheckInRepository
getCheckInForDate(userId, date)
listCheckIns(userId, range)
saveCheckIn(checkIn)
updateCheckIn(checkInId, patch)

// ReminderRepository
listReminders(userId)
listActiveReminders(userId)
getReminderById(reminderId)
saveReminder(reminder)
completeReminder(reminderId, completedAt)

// AnalysisRepository
listAnalyses()
getLatestAnalysis()
getAnalysisById(analysisId)
createAnalysis(analysis)
```

## Repository Implementations

Founder Alpha should start with seed-backed repositories.

```text
Repository interface
  -> Seed repository implementation
  -> Future local persistence implementation
  -> Future cloud repository implementation
  -> Future integration-backed repository implementation
```

Example:

```text
GoalRepository
  seedGoalRepository
  localGoalRepository
  cloudGoalRepository
```

The UI should never import seed data directly.

---

# Application Services

Application services compose repository data into view models.

Recommended initial services:

```text
HomeBriefingService
GoalEvaluationService
GoalIntelligenceService
RecommendationService
EvidenceService
AnalysisService
```

## AnalysisService

Produces deterministic Analysis records from evidence input.

Founder Alpha does not use AI or LLM reasoning for Analysis generation yet.

Initial behavior should be simple and explainable:

```text
Evidence input
  -> deterministic AnalysisService
  -> immutable Analysis record
  -> AnalysisRepository
```

## HomeBriefingService

Produces the shape consumed by the Home screen.

```js
getHomeBriefing(userId)
```

Home is a decision surface composed from service-generated view models.

UI components should receive already-shaped view data. They should not import fixture files, query repositories, resolve evidence sources, or perform health calculations.

Returns:

```js
{
  header,
  trajectory,
  nextBestAction,
  goals,
  todaysFocus,
  momentum,
  bottomNavigation,
  latestAnalysis
}
```

The current fixture-driven Home sections should eventually consume this composed briefing rather than importing separate fixture files.

## GoalEvaluationService

Produces deterministic GoalEvaluation records from repository evidence.

Goal Evaluation is the canonical interpretation layer between raw evidence and progress percentages.

```text
Evidence
  -> GoalEvaluationService
  -> GoalIntelligenceService
  -> HomeBriefingService
  -> Home
```

Each GoalEvaluation should expose:

```js
{
  goalId,
  summary,
  progress,
  confidence,
  findings,
  recommendations,
  confidenceFactors,
  missingEvidence,
  projection,
  metadata
}
```

Founder Alpha evaluations are deterministic and do not use AI, LLM reasoning, or computer vision.

The evaluation layer should answer:

* what evidence supports this goal
* what evidence is missing
* what improved
* what has not improved
* what risks exist
* what increases confidence
* what decreases confidence
* what the user should do next

Future Goal Detail, Coach, Analysis, Timeline, and Recommendation screens should reuse GoalEvaluation output rather than duplicating interpretation logic.

## GoalIntelligenceService

Produces compact goal, trajectory, confidence, and projection view models from GoalEvaluation records.

Founder Alpha does not score goals with false precision. GoalIntelligence should not query repositories or interpret raw evidence directly. It consumes evaluated explanations and maps them into the compact Home representation.

GoalEvaluation uses observed evidence only:

* DEXA calibrates body-fat and lean-mass status.
* Manual weight trend provides recent direction.
* Progress photos provide visual calibration consistency for qualitative goals.
* Protocols and nutrition context explain current conditions but do not overwrite measurements.

The primary Visible Abs goal remains provisional until a future visual analysis workflow exists. Home should not expose implementation language such as "visual analysis pending"; it should communicate user-facing progress, confidence, and next actions.

## DailyFocusService

Produces the four compact Today’s Focus tiles from recurring expectations and same-day evidence.

Founder Alpha focus items are stable habit or reminder labels, not event summaries. The service can prioritize:

* morning weigh-in evidence
* protein and activity context
* weekly progress photo expectations
* protocol reminders
* sleep target

Morning entry should stay fast. Different conditions, protocol completion, and future context should be stored through repositories without making the default daily flow slower.

---

# Future Data Source Adapters

Future integrations should be added as adapters that produce domain records or Evidence Events.

## Apple Health

Initial supported records:

- weight
- steps
- active energy
- sleep duration
- workouts
- resting heart rate

Apple Health should feed repositories through an adapter:

```text
AppleHealthAdapter
  -> normalizeWeightSamples()
  -> normalizeActivitySamples()
  -> normalizeSleepSamples()
  -> repository.import(...)
```

## DEXA Uploads

DEXA uploads should not directly update UI state.

```text
Uploaded file
  -> DEXA parser
  -> normalized DEXAScan
  -> DEXARepository
  -> Evidence Engine
  -> HomeBriefingService
```

## Progress Photos

Progress photos are structured visual evidence for qualitative goal validation.

```text
Private image file
  -> EXIF/date read when available
  -> normalized ProgressPhoto record
  -> ProgressPhotoRepository
  -> future AnalysisService interpretation
```

Computer vision, body-fat estimation, and Home display should remain separate future milestones. Import should preserve the image path and mark unknown fields for later user confirmation.

## Manual Daily Check-Ins

Manual check-ins should write to `DailyCheckInRepository`, not directly to Home UI state.

## Cloud Persistence

Cloud persistence should replace repository implementations, not application code.

The first cloud implementation should preserve the same repository interface used by seed repositories.

---

# Seed Data Strategy

Seed data should represent Founder Alpha's initial local dataset.

The placeholder Founder seed pack lives separately from demo seed data:

```text
src/data/founderSeed/
  user.js
  goals.js
  weights.js
  dexaScans.js
  protocols.js
  reminders.js
  nutritionContext.js
  milestones.js
  progressPhotos.js
  dailyCheckIns.js
  analyses.js
  index.js
```

These files intentionally start empty. They are the destination for verified historical import output.

Recommended structure:

```text
src/data/seed/
  users.js
  goals.js
  weightEntries.js
  dexaScans.js
  milestones.js
  protocols.js
  reminders.js
  nutritionContext.js
  progressPhotos.js
  dailyCheckIns.js
```

Rules:

1. Seed records use the same domain model shape as production records.

2. Seed records are not imported by UI components.

3. Seed repositories import seed records.

4. Existing UI fixture files can temporarily remain while migration is in progress.

5. Once Home consumes `HomeBriefingService`, old Home-specific fixtures should be removed.

---

# Proposed Folder Structure

```text
src/
  domain/
    models/
      user.js
      goal.js
      weightEntry.js
      dexaScan.js
      milestone.js
      protocol.js
      nutritionContext.js
      reminder.js
      dailyCheckIn.js
    repositories/
      userRepository.js
      goalRepository.js
      weightRepository.js
      dexaRepository.js
      milestoneRepository.js
      protocolRepository.js
      dailyCheckInRepository.js
    services/
      homeBriefingService.js
      goalProgressService.js
      evidenceService.js
      recommendationService.js
    adapters/
      appleHealth/
      dexa/
      imports/
  data/
    seed/
      users.js
      goals.js
      weightEntries.js
      dexaScans.js
      milestones.js
      protocols.js
      dailyCheckIns.js
      analyses.js
    repositories/
      seedUserRepository.js
      seedGoalRepository.js
      seedWeightRepository.js
      seedDEXARepository.js
      seedMilestoneRepository.js
      seedProtocolRepository.js
      seedNutritionContextRepository.js
      seedReminderRepository.js
      seedDailyCheckInRepository.js
      seedAnalysisRepository.js
  screens/
  components/
```

The existing `src/services` and `src/lib` folders can be migrated gradually. Do not move everything at once.

---

# Migration Plan From Current Fixtures

## Current State

Home currently uses presentation fixtures:

- `fixtures/homeHeader.js`
- `fixtures/homeGoals.js`
- `fixtures/todaysFocus.js`
- `fixtures/momentumStats.js`
- `fixtures/bottomNavigation.js`

These are useful for UI reconstruction, but they are view data rather than domain data.

## Target State

Home should consume:

```js
const briefing = await HomeBriefingService.getHomeBriefing(userId);
```

Then pass:

```js
briefing.header
briefing.trajectory
briefing.nextBestAction
briefing.goals
briefing.todaysFocus
briefing.momentum
```

to existing UI components.

## Phased Migration

### Phase 1: Add Domain Seed Data

Create seed files using production-like domain shapes.

Do not remove current UI fixtures yet.

### Phase 2: Add Seed Repositories

Implement repository interfaces backed by seed data.

### Phase 3: Add HomeBriefingService

Compose Home view data from repositories.

This service bridges domain records to the existing UI component props.

### Phase 4: Switch HomeScreen Data Imports

Replace direct imports from Home UI fixtures with `getHomeBriefing`.

### Phase 5: Remove Replaced Fixtures

Remove Home-specific fixtures once their data is fully generated from repositories.

Keep navigation config separate because it is app configuration, not health domain data.

---

# Recommended Implementation Order

1. Create domain model factories and validation helpers.

2. Create seed data in domain shape.

3. Create repository interface files.

4. Implement seed repositories.

5. Create `HomeBriefingService`.

6. Update Home to consume `HomeBriefingService` output.

7. Replace `homeHeader`, `homeGoals`, `todaysFocus`, and `momentumStats` with service-generated view models.

8. Add unit tests for repository reads and Home briefing composition.

9. Add local persistence behind the same repository interfaces.

10. Add import pipeline for historical weight and DEXA data.

11. Plan Apple Health adapter.

12. Implement Apple Health only after the domain and repository boundary is stable.

---

# Founder Alpha Completion Criteria

Founder Alpha architecture is ready when:

1. Home no longer imports health demo fixtures directly.

2. Domain seed data uses production-like model shapes.

3. Repositories are the only data access path for health records.

4. Home briefing data is composed by an application service.

5. Goal progress and trajectory are calculated from real entries and scans.

6. The repository layer can be swapped from seed data to local/cloud data without changing UI components.

7. Apple Health can be added as an adapter rather than a UI feature.

---

# Founder Alpha Morning Check-In Runtime

The Morning Check-In flow is the first daily-use Founder Alpha workflow.

It follows the application architecture:

```text
Morning Check-In
  -> manual WeightEntry evidence
  -> WeightRepository
  -> DailyCheckInRepository
  -> deterministic AnalysisService
  -> AnalysisRepository
  -> Analysis screen
  -> HomeBriefingService
  -> Home
```

For Founder Alpha, repositories may keep runtime writes in memory while still starting from Founder seed data.

Manual morning weight is authoritative for its date and replaces imported weight evidence for the same day.

Optional check-in fields such as notes, estimated calories, and protocol-change notes are stored as daily check-in context. They provide evidence for future interpretation but do not directly alter calculations yet.

The Analysis screen is a dedicated route, not a modal. It explains the evidence just saved, the confidence impact, and the recommended next action.

Home remains a decision surface. It refreshes from `HomeBriefingService` after check-in rather than reading repositories directly.

## Durable Local Persistence

Founder Alpha is a single-user local application.

Runtime evidence is persisted to:

```text
private/founder/runtime-store.json
```

The file is private and ignored by Git.

Repositories remain the persistence boundary. Application services and UI components continue to use repository methods and do not read or write the JSON file directly.

The first persisted collections are:

* `weightEntries`
* `dailyCheckIns`
* `analyses`
* `protocols`
* `reminders`
* `progressPhotos`

Future evidence types such as photos, protocols, nutrition, sleep, and imported health data can be added by extending the persisted collection list behind the same repository boundary.

---

# Interpretation Layer Foundation

Founder Alpha now includes a domain-level Interpretation Layer.

The first concrete output is `VisualEvidence`, produced from Progress Photo evidence.

Current Founder Alpha behavior is deterministic:

* `PhotoInterpreter` describes progress-photo evidence using filename metadata, capture context, related goals, same-day weight, and previous matching photos.
* `TextInterpreter`, `VoiceInterpreter`, and `PdfInterpreter` exist as stubs so future evidence capture can share the same architecture.
* Interpreters do not render UI.
* Interpreters do not write repositories.
* Interpreters do not score goals.

Future AI and computer vision should plug into interpreters, not screens.

Application services consume interpreted evidence and decide how it affects reporting, confidence, goals, recommendations, and briefings.

---

# Founder Alpha UI Governance

Founder Alpha currently relies on a small set of shared UI systems:

* `Card` for framed content
* `ReportDrawer` for expandable long content
* `ProgressLineChart` for interactive evidence charts
* `EvidenceReportContext` for Related Goals and Data Sources placement
* `FloatingBottomNavigation` for global mobile navigation
* progress photo gallery/modal patterns for visual evidence inspection

Future Founder Alpha screens should reuse these systems before creating new ones.

Evidence report pages should use this order:

1. Header
2. Related Goals
3. Summary
4. Interactive chart/reporting
5. Drawers for long tables/history
6. Data Sources / Integrations

Dark mode should be inherited from semantic tokens and shared components. A page-specific dark-mode override is a last resort and should indicate a missing primitive or token.

Known review candidate:

* The old dashboard/card path under `src/features/dashboard` and older `src/components/cards/*` files appears to be legacy relative to the App Router Founder Alpha experience. Do not extend it for new Founder Alpha work. Remove it only in a dedicated cleanup after confirming Storybook dependencies.

# PhysiqueOS Codebase Map

This document maps the current Founder Alpha code organization so future work can extend the app without guessing which paths are active, legacy, or experimental.

The goal is conservative clarity. Do not use this document as permission to delete code without checking current imports, Storybook references, and product intent.

---

# Active App Routes

Founder Alpha uses the Next.js App Router under `src/app`.

| Route | Purpose | Primary screen/service |
| --- | --- | --- |
| `/` | Home decision surface | `HomeScreen`, `HomeBriefingService` |
| `/briefing/daily` | Daily Briefing | `DailyBriefingScreen`, `DailyBriefingService` |
| `/briefings/monthly/preview/2026-07-01` | Isolated June 2026 Monthly Briefing architecture preview | `MonthlyBriefingScreen`, `MonthlyBriefingPreviewService` |
| `/check-in/morning` | Morning Check-In | `MorningCheckInScreen`, check-in actions |
| `/analysis/[analysisId]` | Saved Analysis detail | `AnalysisScreen`, `AnalysisRepository` |
| `/goals` | Goals Hub | `GoalsHubScreen` |
| `/goals/visible-abs` | Primary Narrative Goal journey | `NarrativeGoalPreviewScreen`, `NarrativeGoalPresentationLoader`, `NarrativeGoalPreviewService` |
| `/goals/maintenance` | Body-fat maintenance Narrative Goal journey | `NarrativeGoalPreviewScreen`, `NarrativeGoalPresentationLoader`, `SupportingNarrativeGoalPreviewService` |
| `/goals/lean-mass` | Lean-mass preservation Narrative Goal journey | `NarrativeGoalPreviewScreen`, `NarrativeGoalPresentationLoader`, `SupportingNarrativeGoalPreviewService` |
| `/log` | Universal evidence capture hub | `LogHubScreen`, log actions |
| `/evidence/photos` | Progress Photo upload | `ProgressPhotoUploadScreen`, photo actions |
| `/evidence/dexa` | DEXA PDF upload/confirm | `DEXAUploadScreen`, DEXA actions |
| `/priorities/[priorityId]` | Priority operational detail | `PriorityDetailScreen`, `PriorityDetailService` |
| `/progress` | Evidence Hub | `ProgressHubScreen`, `ProgressReportingService` |
| `/progress/weight` | Weight Evidence Report | `WeightReportScreen`, `ProgressReportingService` |
| `/progress/dexa` | DEXA Evidence Report | `DEXAReportScreen`, `ProgressReportingService` |
| `/progress/[stream]` | Generic Evidence Report streams | `ProgressPlaceholderScreen`, `ProgressReportingService` |
| `/timeline` | Unified evidence timeline | `EvidenceTimelineScreen`, `EvidenceTimelineService` |
| `/profile` | You control center | `YouScreen`, `YouProfileService` |
| `/profile/protocols` | Protocols hub | `ProtocolsHubScreen`, `ProtocolRepository` |
| `/profile/operating-plan` | Founder operating expectations | `OperatingPlanScreen` |
| `/profile/protocols/[protocolId]` | Protocol detail | `ProtocolDetailScreen`, `ProtocolRepository` |
| `/api/private-evidence/[...path]` | Private evidence file access | route handler |

## Bottom Navigation

The current bottom navigation is configured in `src/fixtures/bottomNavigation.js`:

1. Home -> `/`
2. Goals -> `/goals`
3. Log -> `/log`
4. Evidence -> `/progress`
5. You -> `/profile`

The global floating bottom navigation is mounted in `src/app/layout.js` through `FloatingBottomNavigation`.

`/timeline` and direct upload routes are intentionally reachable but are not primary bottom-nav destinations.

---

# Active Screens

Active Founder Alpha screens live in `src/screens`.

Primary daily-use screens:

* `HomeScreen`
* `DailyBriefingScreen`
* `MorningCheckInScreen`
* `LogHubScreen`
* `PriorityDetailScreen`

Narrative briefing screens:

* `WeeklyBriefingScreen`
* `DEXAEventBriefingScreen`
* `PhotoEventBriefingScreen`
* `MonthlyBriefingScreen` (preview-only architecture)

Goal screens:

* `GoalsHubScreen`
* `NarrativeGoalPreviewScreen` (shared production journey renderer for all three canonical Goal routes)

Goal presentation loaders/adapters:

* `NarrativeGoalPresentationLoader`
* `NarrativeGoalPreviewService`
* `SupportingNarrativeGoalPreviewService`
* `VisibleAbsGoalScreen` and `SupportingGoalScreen` now retain dossier-loading orchestration only; their superseded JSX compositions were removed.

Evidence screens:

* `ProgressHubScreen`
* `WeightReportScreen`
* `DEXAReportScreen`
* `ProgressPlaceholderScreen`
* `ProgressPhotoUploadScreen`
* `DEXAUploadScreen`
* `EvidenceTimelineScreen`

Profile/plan screens:

* `YouScreen`
* `ProtocolsHubScreen`
* `OperatingPlanScreen`
* `ProtocolDetailScreen`

Known screen placeholders or lower-priority routes:

* `CoachScreen`
* `GoalsScreen`
* `TimelineScreen`

Do not build new Founder Alpha work on placeholder screens unless the product explicitly reactivates them.

---

# Domain and Services

The canonical Narrative cadence and Home precedence definition lives in `docs/NARRATIVE_SCHEDULE.md`.

Domain models live in `src/domain/models`.

Application/domain services live in `src/domain/services`.

Key services:

* `HomeBriefingService`: composes Home view models.
* `DailyBriefingService`: composes Daily Briefing intelligence.
* `ProgressReportingService`: composes Evidence Hub and Evidence Report view models.
* `EvidenceTimelineService`: composes the unified evidence timeline.
* `GoalEvaluationService`: canonical interpretation layer between evidence and goal progress.
* `GoalIntelligenceService`: maps goal evaluations into compact progress/status view models.
* `GoalConfidenceService`: deterministic confidence support.
* `ActionEngineService`: priority/action support.
* `DailyFocusService`: daily priorities/focus support.
* `PriorityDetailService`: operational priority detail view model.
* `AnalysisService`: deterministic Analysis generation.
* `MonthlyBriefingPreviewService`: read-only composition of the fixed June 1–30 Monthly Narrative preview delivered July 1, 2026.

Repository implementations live in `src/data/repositories`.

Founder data currently flows through `FounderRepositories`, which are built from Founder seed data plus local runtime persistence.

## Interpreter Layer

Interpreter services live in `src/domain/interpreters`.

Current interpreters:

* `PhotoInterpreter`
* `TextInterpreter`
* `VoiceInterpreter`
* `PdfInterpreter`
* `VisualEvidence`

Interpreters extract, classify, normalize, and compare raw inputs. They should not make final recommendations, score goals, write repositories, or render UI.

Rule:

> AI interprets reality. PhysiqueOS decides what it means.

---

# Design System Primitives

Core primitives and shared UI systems:

* `Card`
* `IconBadge`
* `ActionButton`
* `SectionTitle`
* `ConfidenceRing`
* `ProgressLineChart`
* `ReportDrawer`
* `EvidenceReportContext`
* `ProgressPhotoGallery`
* `BottomNavigation`
* `FloatingBottomNavigation`
* `ThemeScript`
* `ThemeSwitch`

Use these before introducing new surface, drawer, modal, chart, or navigation implementations.

Design-system rules are documented in `docs/DESIGN_SYSTEM.md`.

---

# Evidence Report Standard

Future Evidence Report pages should follow this order:

1. Title and short context
2. Related Goals
3. Summary
4. Interactive reporting
5. Historical reporting
6. Underlying evidence
7. Data Sources / Integrations

Use:

* `EvidenceReportContext` for Related Goals and Data Sources.
* `ReportDrawer` for long tables, long histories, and grouped graph sections.
* `ProgressLineChart` for evidence charts.
* semantic design tokens for all surfaces.

---

# Styling and Theme Notes

Active screens should use semantic tokens through shared primitives.

Avoid adding:

* raw `bg-white` card surfaces
* raw `bg-slate-50`, `bg-gray-50`, `bg-neutral-50`, `bg-stone-50`, or `bg-zinc-50` surfaces
* arbitrary light hex backgrounds in page code
* page-specific drawer implementations
* page-specific chart interaction logic
* page-specific floating nav

The current global dark-mode fallback layer catches legacy light utility classes, but new code should not rely on that fallback. New reusable surfaces should be tokenized at the component level.

---

# Legacy / Human-Review Areas

These areas appear legacy, experimental, or Storybook-adjacent. They are not removed because they may still be imported by stories or older paths.

## `src/features/dashboard`

Contains an older dashboard `Home.js` that imports older card components. It is not part of the active App Router Founder Alpha flow.

Recommendation: remove in a dedicated cleanup only after confirming no Storybook or external references depend on it.

## Older `src/components/cards/*`

Some cards are active Founder Alpha components, while others are older prototype cards.

Likely active:

* `GoalsCard`
* `LatestAnalysisCard`
* `NextBestAction`
* `TodaysFocusCard`
* `TrajectoryCard`

Likely legacy or Storybook-only:

* `GoalCard`
* `HomeMissionCard`
* `MetricCard`
* `MorningBriefCard`
* `RecommendationCard`
* `TodayChecklistCard`

Recommendation: split active cards from legacy cards in a dedicated cleanup after Storybook review.

## Older navigation/layout files

`FloatingBottomNavigation` and `BottomNavigation` are active.

Review candidates:

* `src/components/navigation/BottomNav.js`
* `src/components/layout/AppShell.js`
* older layout files not used by `src/app/layout.js`

Do not delete until imports and Storybook references are checked.

## Storybook placeholders

Some Storybook files contain minimal placeholder stories. They exist to keep lint and Storybook metadata valid but should be fleshed out when those components become part of active Founder Alpha development.

---

# Recommended Target Structure

No major folder migration is recommended before Profile.

The eventual target structure:

```text
src/app/                 Route entry points and server actions
src/screens/             Route-level screen composition
src/components/          Reusable UI components
src/components/ui/       Primitives
src/components/progress/ Evidence report shared components
src/domain/models/       Domain object factories/shapes
src/domain/services/     Deterministic intelligence/application services
src/domain/interpreters/ Raw-input interpretation boundary
src/data/repositories/   Persistence/data boundaries
src/data/founderSeed/    Founder seed evidence
src/fixtures/            App config and temporary static view fixtures only
docs/                    Product, architecture, design, and contributor docs
```

Migration rule:

Move files only when the destination reduces confusion without breaking imports, stories, or active routes.

---

# Cleanup Policy

Prefer safety over cleanup.

Remove code only when:

1. it has no imports,
2. it is not referenced by Storybook,
3. it is not reachable from an active route,
4. it is not documenting a planned pattern,
5. the deletion can be validated with lint, build, and smoke checks.

If uncertain, document it as a human-review candidate.

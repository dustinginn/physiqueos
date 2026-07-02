# PhysiqueOS Design System

The PhysiqueOS Design System defines the visual language, interaction patterns, and reusable building blocks used throughout the application.

Every screen should feel like it belongs to the same product.

Consistency is more valuable than novelty.

---

# Design Principles

Every interface should feel:

* Calm
* Premium
* Data-first
* Modern
* Minimal
* Trustworthy
* Optimistic

The interface should reduce cognitive load.

Whitespace is intentional.

Every visual element should have a purpose.

---

# Design Philosophy

Users should immediately understand:

* Where they are
* What matters most
* What they should do next

The interface should communicate information in layers.

Important information first.

Details only when requested.

Never overwhelm the user.

---

# Layout

Mobile-first.

Reference width:

393px

Horizontal content padding:

16px

Maximum content width:

393px

Cards should align to the same content grid.

Avoid arbitrary positioning.

---

# Spacing

Base spacing unit:

4px

Allowed spacing:

4
8
12
16
20
24
32
40
48
64

Use spacing tokens.

Avoid arbitrary values whenever practical.

---

# Border Radius

Small

8

Medium

12

Large

16

XL

24

Default values:

Cards: 16

Buttons: 16

Input Fields: 12

Icon Containers: 12

---

# Elevation

Use subtle elevation.

Cards share one shadow style.

Floating actions may use a slightly stronger elevation.

Avoid dramatic shadows.

Depth should communicate hierarchy, not decoration.

---

# Color Palette

Primary

#4F46E5

Success

#3BC35B

Warning

#F59E0B

Danger

#EF4444

Background

#F7F8FA

Surface

#FFFFFF

Primary Text

#0B1020

Secondary Text

#64748B

Divider

#E5E7EB

Use semantic color names in code rather than raw hex values whenever possible.

---

# Typography

Font

Plus Jakarta Sans

Hierarchy:

Display

Heading

Title

Subtitle

Body

Caption

Label

Typography should communicate hierarchy before decoration.

Avoid inventing new text styles.

---

# Icons

Use Lucide React exclusively.

Default

20px

Small

16px

Large

24px

Icons should communicate meaning, not decorate the interface.

---

# Component Hierarchy

Every screen should be assembled from reusable components.

Preferred hierarchy:

Primitive

↓

Composite

↓

Section

↓

Screen

Example:

Button

↓

Card

↓

GoalProgressRow

↓

GoalsCard

↓

Home Screen

Avoid placing complex UI directly inside screens.

---

# Component Rules

Every component should have a single responsibility.

Every reusable component should have a Storybook story.

If a UI pattern appears more than once, consider extracting it into a reusable component.

Favor composition over duplication.

Business logic should remain separate from presentation whenever practical.

---

# Buttons

Primary

Secondary

Ghost

Icon

Primary buttons:

56px height

16px radius

Semibold

Large touch targets.

Clear visual hierarchy.

---

# Cards

Cards are the primary building block of PhysiqueOS.

Every card should:

* use consistent padding
* use consistent radius
* use consistent elevation
* present one primary idea

Avoid oversized cards with multiple unrelated responsibilities.

---

# Motion

Motion should communicate state changes, not decorate the interface.

Preferred durations:

150ms

200ms

250ms

Ease Out

Animations should feel responsive and subtle.

---

# Accessibility

Minimum touch target:

44px

Meet WCAG AA contrast requirements.

Never rely solely on color to communicate information.

Support Dynamic Type where practical.

---

# Design Tokens

All visual values should originate from design tokens whenever practical.

Avoid hardcoded spacing, colors, typography, or radius values inside components.

## Semantic Theme Tokens

Use semantic tokens instead of raw light or dark colors.

Core surface tokens:

* `--background` for app/page backgrounds
* `--surface` for base surfaces
* `--surface-elevated` for cards, drawers, floating navigation, and modals
* `--surface-muted` for nested rows, previews, table rows, and quiet grouped content
* `--surface-inset` for chart/table areas and evidence context panels
* `--surface-hover` for interactive hover/pressed states
* `--surface-accent`, `--surface-success`, and `--surface-warning` for soft semantic emphasis

Core text tokens:

* `--text-primary`
* `--text-secondary`
* `--text-muted`
* `--text-subtle`

Core structure tokens:

* `--divider`
* `--border-strong`
* `--shadow-card`
* `--modal-backdrop`
* `--input-bg`

Components should own theme behavior. Future screens should not need page-specific dark-mode overrides to avoid white cards.

Avoid adding new `bg-white`, `bg-slate-50`, `bg-gray-50`, arbitrary light hex backgrounds, or hardcoded dark backgrounds in screens. If a color is reusable, add or use a semantic token.

---

# Reusable Surface Components

Use `Card` for framed content.

Supported `Card` variants:

* `elevated`: default card surface
* `surface`: base surface
* `soft`: quiet secondary surface
* `inset`: chart/table/evidence surface
* `accent`: primary-goal or intelligence emphasis
* `success`: positive progress or completion emphasis
* `warning`: momentum, effort, or non-negative caution emphasis

Use nested muted surfaces sparingly. Do not place a full card inside another full card unless the inner element is a row, drawer preview, modal content group, or repeated item.

---

# Standard UI Patterns

## Drawers

Use `ReportDrawer` for long tables, long evidence lists, and grouped graph sections.

Drawer rules:

* collapsed state shows preview rows or preview content
* the entire collapsed drawer surface expands
* expanded state shows full content
* expanded state includes a bottom `Collapse` control
* drawers use theme-aware surfaces
* drawer content should not require scrolling back to the header to close

## Modals and Galleries

Modal/gallery rules:

* background page scroll is locked while open
* modal content scrolls independently
* close affordance remains visible
* next/previous controls remain accessible for galleries
* modal z-index must sit above floating bottom navigation
* all modal surfaces use semantic tokens

## Charts

Charts should:

* use theme-aware backgrounds, grid lines, and tooltip surfaces
* support desktop hover
* support mobile touch scrubbing
* show date and value clearly
* not require precise dot tapping

## Floating Navigation

Floating bottom navigation is global.

Rules:

* use the shared floating bottom navigation
* respect `safe-area-inset-bottom`
* keep enough page bottom padding so final content is not hidden
* keep modal z-index above navigation
* preserve clear active states in both themes

## Evidence Reports

Evidence Report pages should follow this default structure:

1. Title and short context
2. Related Goals
3. Summary
4. Interactive reporting
5. Historical reporting
6. Underlying evidence
7. Data Sources / Integrations

Do not duplicate full analysis on evidence pages. Evidence pages explain what happened and what evidence exists; Daily Briefing and Goal Detail explain what it means.

---

# Iconography Governance

Use Lucide React as the single icon language.

Avoid mixing emoji with Lucide icons for primary product UI. Emoji can be used only when deliberately part of motivational copy, not as core navigation or evidence-type iconography.

Evidence icon defaults:

* Weight: `Scale`
* DEXA / body composition: scan/body-composition related Lucide icon where available
* Progress Photos / Visual Evidence: `Camera` or image-related Lucide icon
* Nutrition: utensils/food-related Lucide icon
* Training: dumbbell/activity-related Lucide icon
* Recovery: recovery/heart/activity-related Lucide icon
* Protocols: calendar/medical/context icon depending on placement

Icons must remain readable in light and dark mode and should sit inside `IconBadge` or another tokenized surface when they need emphasis.

---

# Naming Governance

Preferred user-facing language:

* `Evidence Hub` for the destination
* `Evidence Report` for a specific evidence stream
* `Daily Briefing` for the primary intelligence briefing
* `Goals` for user-facing goal surfaces
* `Supporting Objectives` only when explaining internal goal architecture
* `Progress Photos` for user-facing uploads/history
* `Visual Evidence` for interpreted photo evidence inside intelligence architecture
* `Confidence` for model certainty, not success probability
* `Progress` for movement toward a goal

Do not rename stable user-facing labels unless the current label is clearly inconsistent with these terms.

---

# Visual Goal

PhysiqueOS should feel like a product that could sit comfortably beside Apple Fitness, Linear, and Stripe.

Premium.

Minimal.

Trustworthy.

Fast.

Data-first.

Calm.

# PhysiqueOS — AI Contributor Guide

## Purpose

You are contributing to PhysiqueOS.

PhysiqueOS is not a calorie tracker.

It is not a weight loss app.

It is an operating system for improving body composition and long-term health.

Your responsibility is not simply to write code.

Your responsibility is to improve the product while preserving its philosophy.

When documentation and existing code disagree, the documentation is the source of truth.

---

# Read Before Every Task

Before making changes, read:

1. docs/VISION.md
2. docs/PRINCIPLES.md
3. docs/PRODUCT.md
4. docs/ARCHITECTURE.md
5. docs/DESIGN_SYSTEM.md
6. docs/ROADMAP.md
7. docs/DECISIONS.md
8. CODEBASE_MAP.md

Never assume requirements that are not documented.

---

# Mission

Every contribution should improve one or more of the following:

* prediction quality
* recommendation quality
* user understanding
* maintainability
* consistency
* performance

If a change improves none of these, question whether it belongs.

---

# Working Style

Plan before coding.

Understand the surrounding architecture before modifying it.

Prefer incremental improvements over large rewrites.

Avoid changing unrelated code.

Leave the codebase cleaner than you found it.

---

# Development Philosophy

Build systems rather than one-off solutions.

Prefer reusable primitives.

Favor composition over duplication.

Optimize for clarity over cleverness.

The simplest correct solution is usually the best solution.

---

# Design Philosophy

The mockup is a visual reference.

The design system is the source of truth.

Do not hardcode visual values unless they are intentionally part of the design system.

Every screen should feel like it belongs to the same product.

---

# Component Rules

Build reusable components.

If a UI pattern appears more than once, extract it.

Keep components focused on a single responsibility.

Separate presentation from business logic whenever practical.

Prefer composition over inheritance.

Every reusable component should have a Storybook story.

---

# Code Style

Prefer functional React components.

Keep files reasonably small.

Prefer descriptive names.

Avoid unnecessary state.

Avoid deeply nested JSX.

Comment only when intent cannot be inferred from the code.

Avoid premature optimization.

---

# Project Structure

Business logic belongs outside UI components.

Calculations should live in reusable utilities.

Screens should compose components.

Components should compose primitives.

Avoid circular dependencies.

---

# Dependencies

Do not introduce new dependencies without clear long-term value.

Prefer platform capabilities before adding packages.

Explain why a new dependency is necessary.

---

# Visual Validation

Use:

public/mockup-home.png

as the visual reference.

Use Storybook for isolated component development.

Use Playwright screenshots to validate layout changes.

Use the screenshot comparison workflow whenever making significant UI updates.

Aim for close visual parity while preserving maintainability.

---

# Founder Daily Driver Development Rules

Founder Alpha is used continuously throughout development.

Assume the founder is actively testing the app on a physical device unless explicitly told otherwise.

## Development Server

When completing work:

* Always leave the development server running unless explicitly instructed to stop it.
* Never terminate the development server after validation or screenshot generation.
* If the server must be restarted, restart it automatically.
* Ensure the server is reachable from the local network by binding to `0.0.0.0`.
* At the end of every task, report the LAN URL, for example `http://192.168.1.69:3000`, so testing can continue immediately.

## Validation

Validation is not complete until the founder can continue using the app.

After making changes:

* Run the appropriate build, lint, and test checks.
* Verify the affected workflow.
* Confirm the app is still accessible from the LAN.
* Leave the application running.
* Never consider stopping the development server part of cleanup.

## Founder Workflow

Optimize for uninterrupted daily usage.

If a choice exists between cleaning up the development environment and allowing immediate founder testing, prioritize uninterrupted testing.

Assume every completed task will be followed by immediate hands-on use on the founder's phone.

---

# Founder Alpha Principles

As Founder Alpha evolves:

Do not optimize for collecting more data.

Optimize for maximizing confidence while minimizing user effort.

Assume specialist apps remain the preferred place for data entry.

PhysiqueOS should become the place where users understand what all of their evidence collectively means.

When designing new features, always ask:

1. Does this help users collect evidence?
2. Does this help users understand evidence?
3. Does this help users act on evidence?

If the answer to all three is "no," it likely does not belong in the core product.

PhysiqueOS should become the operating system for evidence-based health and performance.

This philosophy should influence future product decisions, onboarding, integrations, reporting, intelligence, and user experience without requiring immediate implementation changes.

## Physiological Model Rules

PhysiqueOS builds a personalized physiological model.

Do not treat evidence as valuable merely because it exists.

Evidence should help the product:

1. interpret the user's current state
2. predict what is likely to happen next
3. validate or challenge previous predictions
4. improve the model
5. make better future predictions

Use this product loop:

```text
Evidence -> Interpretation -> Prediction -> Validation -> Model Improvement -> Better Predictions
```

Confidence represents how well PhysiqueOS understands the individual in the current context.

Confidence is earned through prediction accuracy, evidence quality, evidence consistency, calibration events, adherence context, model stability, and uncertainty reduction.

Never increase confidence simply because time passed.

The Confidence Ring exists for the user and should answer:

"How confident should I feel that continuing this plan will produce the expected outcome?"

## Daily Briefing Rules

The Daily Briefing is the primary Intelligence Engine expression.

It is not a dashboard, report, checklist, or task manager.

It should answer:

"After reviewing everything that happened, what does PhysiqueOS now believe?"

Evidence belongs in the briefing only when it justifies an updated belief, validates or challenges a prediction, explains uncertainty, or improves user understanding.

Execution belongs in Home, Notifications, and Priority Cards.

When implementing or modifying Daily Briefing, follow `docs/DAILY_BRIEFING.md`.

---

# Before Making Changes

Before writing code, ask:

* What problem am I solving?
* Can an existing component solve it?
* Can this become reusable?
* Does this belong in the design system?
* Will this increase complexity?

If complexity increases without clear value, reconsider the solution.

---

# Before Completing a Task

Review your work.

Ask:

* Does this follow the documented architecture?
* Does it match the design system?
* Is it simpler than before?
* Can another screen reuse it?
* Does it improve the user experience?
* Did I modify unrelated code?
* Have I explained any architectural decisions?

Revise if necessary before considering the task complete.

---

# Communication

When presenting completed work:

1. Explain what changed.
2. Explain why it changed.
3. List every file that was modified.
4. Describe any tradeoffs.
5. Identify remaining work or known limitations.

Never claim something is complete if meaningful work remains.

---

# Goal

Every commit should leave PhysiqueOS more maintainable, more reusable, and closer to its long-term vision than before.

---

# Interpretation Layer Rules

When adding AI, computer vision, OCR, speech, or parsing behavior:

* Put interpretation logic under `src/domain/interpreters`.
* Keep interpreters free of UI dependencies.
* Return structured evidence objects rather than prose-only output.
* Preserve links back to source evidence IDs and files.
* Do not let interpreters score goals or make final recommendations.
* Do not let screens call AI or interpreters directly.

Use this product rule:

> AI interprets reality. PhysiqueOS decides what it means.

Application services may consume interpreted evidence. Goal evaluation, confidence, trajectory, recommendations, Home, and Daily Briefing remain deterministic product layers.

---

# Founder Alpha Design Governance

Before adding or changing UI, prefer the existing systems:

* `Card` for card surfaces
* `ReportDrawer` for long or expandable evidence content
* `ProgressLineChart` for evidence charts
* `EvidenceReportContext` for Related Goals and Data Sources
* `FloatingBottomNavigation` for app navigation
* `IconBadge` plus Lucide icons for icon emphasis

Avoid:

* new hardcoded light or dark card backgrounds
* page-specific drawer implementations
* page-specific chart interaction logic
* page-specific floating navigation
* emoji as core iconography
* screens calling repositories or interpreters directly when a service boundary exists

Evidence Report pages should follow:

```text
Title
Related Goals
Summary
Interactive reporting
Historical reporting
Underlying evidence
Data Sources / Integrations
```

Dark mode is a design-system responsibility. If a screen needs many local dark-mode patches, improve the primitive or token instead.

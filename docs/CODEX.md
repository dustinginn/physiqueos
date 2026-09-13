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

## Development Storage Hygiene (Dustin's Environment)

This policy applies to PhysiqueOS work performed in Dustin's macOS account. It does not authorize inspecting or cleaning another user's data, using `sudo`, or performing broad system cleanup.

### Workflow ownership

A workflow owns every disposable artifact it creates. Record the exact path, operate only on that path, and remove it when the workflow finishes unless it is intentionally retained for a stated reason.

* Name temporary roots `physiqueos-<task>-<unique-id>` under an appropriate temporary directory.
* Use `defer`, `finally`, `trap`, or the runtime's equivalent to attempt exact-path cleanup after success and controlled failure.
* Never use wildcards, age alone, or an unverified prefix as authority to delete.
* Never remove another process's temporary directory or any artifact whose provenance is uncertain.
* Do not add cron jobs, scheduled tasks, background cleaners, or autonomous deletion services.
* A future cleanup helper, if approved, must accept only explicitly registered PhysiqueOS-owned paths and default to dry-run.

### Storage checkpoints

Require at least **10 GiB of free disk space** before starting any of these operations:

* full Swift and UI validation;
* a fresh generic Release build after deleting DerivedData;
* a large migration or capture;
* a temporary repository clone;
* a large dependency install; or
* an Xcode release archive.

If free space is below 10 GiB, stop before starting the operation. Report the current free space, identify only already-owned disposable artifacts, remove only paths that have been verified safe and exact, then check again. Do not consume the final few GiB and wait for `ENOSPC`.

### Build, test, and agent output

* Reuse DerivedData during active development. Treat it as disposable, but clear it only after a release candidate is validated and uploaded when disk pressure warrants it, or for an explicitly required clean validation.
* Remove isolated test DerivedData and `.xcresult` bundles after results are summarized and required failure evidence or screenshots are retained. Do not keep a separate temporary build tree for every build number.
* Preserve a minimal regression fixture in source when needed; do not retain an entire temporary build tree as a fixture.
* Prefer concise test reporters and bounded, workflow-owned temporary logs. Keep useful errors available while a task is active, retain only the necessary failure excerpt or summary, and remove successful-run logs. Do not suppress errors to reduce output or repeatedly capture identical Xcode output.
* At the end of a substantial Codex or Claude task, ensure no workflow-owned multi-gigabyte task output remains. PhysiqueOS repository policy cannot modify Claude or Codex product internals.

### Local lifecycle guidance

* Keep `node_modules` for active worktrees when useful. When a worktree is approved for retirement, include its `node_modules`, `.next`, coverage, `dist`, build, and other regenerable output in the exact worktree's removal plan. Avoid duplicate dependency trees in temporary clones.
* Never automatically remove a Git worktree. First verify that its changes are committed and durably reachable, it contains no unique untracked files, and no active process uses it. Report eligible redundant worktrees as cleanup candidates; never remove the active Native or server worktree, an uncommitted worktree, or its branch merely because the worktree is removed.
* Maintain one primary current iPhone Simulator. Create additional devices only for an explicit compatibility test, report retired devices as cleanup candidates, and never automatically delete a booted or active simulator. Do not create iPad Simulators unless explicitly required.
* Treat older Xcode archives as reviewable cleanup candidates only after TestFlight accepts the build and a newer known-good build exists. Keep a small intentional retention set; never automatically delete archives that may be needed for symbolication or historical debugging.
* Keep active worktrees, dependencies, DerivedData, `.next`, Simulator data, and active build/test directories on local storage. Use iCloud only for worthwhile static historical material; verify upload completion before considering removal of a local download.

### End-of-task storage report

For substantial work, the final report must state:

* temporary directories created and removed;
* large logs or test artifacts retained and why;
* current free disk space;
* whether DerivedData was intentionally retained; and
* whether a redundant worktree was created and, if so, why it remains necessary.

The desired closeout state is preserved source changes, clean or explicitly documented Git state, removed workflow-owned disposable artifacts, no abandoned multi-gigabyte logs or unnecessary temporary clones, and healthy disk headroom.

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

## Mandatory Mobile-First Product Rule

PhysiqueOS is a mobile-first application. For every new screen, preview, route, card system, or major UI change:

1. Begin with the canonical PhysiqueOS mobile application shell and design for 393 px first.
2. Verify graceful behavior at 360 px.
3. Desktop must center and preserve the mobile shell unless a desktop-specific layout has been explicitly approved. Never make an unrestricted full-width desktop page the default presentation.
4. Reuse shared shell, navigation, spacing, safe-area, and responsive contracts.
5. Verify bottom-navigation clearance and horizontal-overflow protection.
6. Static responsive assertions are insufficient for visual approval. Report honestly when live 393/360 light/dark inspection is unavailable, and never claim mobile verification without actual inspection or an explicit limitation disclosure.
7. A feature is not visually complete until its mobile presentation has been reviewed.

Preview routes must use the same canonical mobile shell and shared presentation architecture as production unless the preview is explicitly a developer diagnostic tool.

When a task requires broader responsive validation, also inspect the requested tablet and desktop viewports. Every UI completion report must list the responsive viewports actually inspected and any related shared surfaces reviewed.

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

## Canonical Intelligence Workflow

The simulator is the single source of truth for PhysiqueOS intelligence.

Do not independently improve coaching quality inside production screens or services.

For AI features, follow:

1. Design
2. Simulator iteration
3. Founder approval
4. Freeze
5. Synchronization pass
6. Production QA
7. Ship

Production work should focus on fidelity:

* collect evidence correctly
* persist state correctly
* call canonical intelligence correctly
* render the resulting coaching clearly
* compare production output against approved simulator golden scenarios

If production output is worse than the simulator, assume synchronization drift before assuming the coaching needs to be retuned.

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

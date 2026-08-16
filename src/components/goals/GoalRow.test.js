import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import GoalRow from "./GoalRow";

const terminalCases = [
  { title: "Visible Abs", current: "Lower abs", target: "Visible at rest", presentation: { mode: "terminal_goal", status: "Awaiting visual confirmation", detail: "DEXA threshold reached" } },
  { title: "Maintenance", current: "7.7% current", target: "8–9% range", presentation: { mode: "terminal_goal", status: "Ready for next phase", detail: "Currently below target range" } },
  { title: "Lean Mass", current: "149.1 lb baseline", target: "Preserve", presentation: { mode: "terminal_goal", status: "Achieved", detail: "147.5 lb latest · −1.6 lb" } },
];

describe("GoalRow terminal layout", () => {
  it.each(terminalCases)("renders $title as one fully stacked tappable row", (props) => {
    const html = renderToStaticMarkup(React.createElement(GoalRow, { ...props, href: "/goals/test" }));
    expect(html).toContain('data-goal-layout="stacked"');
    expect(html).toContain('href="/goals/test"');
    expect(html).toContain("grid-cols-[38px_minmax(0,1fr)]");
    expect(html).not.toContain("grid-cols-[38px_minmax(0,1fr)_auto]");
    expect(html).not.toContain("min-w-[92px]");
    expect(html).not.toContain("truncate");
    expect(html.indexOf(props.current)).toBeLessThan(html.indexOf(props.presentation.status));
    expect(html.indexOf(props.presentation.status)).toBeLessThan(html.indexOf(props.presentation.detail));
  });

  it("keeps a short active supporting status compact", () => {
    const html = renderToStaticMarkup(React.createElement(GoalRow, { title: "Example", current: "Current", target: "Target", presentation: { mode: "supporting_objective", status: "Stable", detail: "Status" } }));
    expect(html).toContain('data-goal-layout="compact"');
    expect(html).toContain("grid-cols-[38px_minmax(0,1fr)_auto]");
    expect(html).toContain("min-w-[92px]");
  });
});

describe("GoalRow phase-trajectory colors", () => {
  const trajectory = {
    overallGoal: { targetDescription: "Build 10 lb of lean mass", overallTargetDate: "2026-10-31" },
    phases: [
      { phaseId: "p1", phaseName: "Establish Maintenance", status: "completed", order: 0, presentationTone: "gold", progress: { progressType: "unavailable", presentationLabel: "Completed" } },
      { phaseId: "p2", phaseName: "Lean Mass Build", status: "active", order: 1, presentationTone: "green", progress: { progressType: "outcome", clampedProgressPercentage: 8, presentationLabel: "0.8 of 10 lb gained" } },
    ],
  };

  it("keeps a completed phase gold, not desaturated, on Home", () => {
    const html = renderToStaticMarkup(React.createElement(GoalRow, {
      title: "Build Lean Mass", presentation: { mode: "phase_trajectory_goal", trajectory }, href: "/goals/build-lean-mass",
    }));
    // The completed Phase 1 badge/accent uses the shared gold token, not the neutral/gray one.
    expect(html).toMatch(/style="color:#C9971A">Phase 1/);
    expect(html).not.toMatch(/style="color:var\(--text-muted\)">Phase 1/);
  });

  it("keeps an active later phase green on Home", () => {
    const html = renderToStaticMarkup(React.createElement(GoalRow, {
      title: "Build Lean Mass", presentation: { mode: "phase_trajectory_goal", trajectory }, href: "/goals/build-lean-mass",
    }));
    expect(html).toContain("#3BC35B");
  });
});

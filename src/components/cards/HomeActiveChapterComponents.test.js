import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import GoalRow from "../goals/GoalRow";
import HomeHeroCard from "./HomeHeroCard";
import HomeBriefingCardStack from "./HomeBriefingCardStack";
import LatestAnalysisCard from "./LatestAnalysisCard";

describe("Home active chapter components", () => {
  it("renders the active phase trajectory with overall confidence", () => {
    const html = renderToStaticMarkup(React.createElement(HomeHeroCard, {
      confidence: 39,
      confidenceDetail: { qualitativeLevel: "Early confidence", supportingFactors: [], limitingFactors: [], clarifyingFactors: [], uncertaintyStatement: "Early evidence remains limited." },
      confidenceState: "Early confidence",
      goalIcon: "dumbbell",
      goalLabel: "Build Lean Mass",
      headline: "Establish Maintenance",
      mode: "phase_trajectory",
      primaryTimeline: "4 weeks remaining",
      plannedReviewDate: "2026-08-17",
      supportLine: "We're establishing the baseline.",
      supportingMetrics: [],
    }));

    expect(html).toContain("lucide-dumbbell");
    expect(html).toContain("View why goal confidence is 39 percent");
    expect(html).toContain("4 weeks remaining");
    expect(html).toContain("Planned review: August 17");
    expect(html).not.toMatch(/Maintenance Calibration|Calibration in progress|Projected Finish|Days Remaining|Unavailable/);
  });

  it("renders the active goal without pending values or fabricated progress", () => {
    const html = renderToStaticMarkup(React.createElement(GoalRow, {
      href: "/goals/build-lean-mass",
      icon: "dumbbell",
      primary: true,
      title: "Build Lean Mass",
      presentation: {
        mode: "calibration_goal",
        status: "Calibration in progress",
        detail: "Maintenance Calibration",
        guardrail: "Maintain approximately 8–9% body fat.",
      },
    }));

    expect(html).toContain("Primary Goal");
    expect(html).toContain("Calibration in progress");
    expect(html).toContain("Guardrail:");
    expect(html).not.toMatch(/Pending|Complete|progressbar|0%/i);
  });

  it("renders the destination, ordered phase bars, and goal-owned guardrail once", () => {
    const html = renderToStaticMarkup(React.createElement(GoalRow, {
      href: "/goals/build-lean-mass", icon: "dumbbell", primary: true, title: "Build Lean Mass",
      presentation: { mode: "phase_trajectory_goal", guardrail: "Maintain approximately 8–9% body fat.", trajectory: { overallGoal: { targetDescription: "Build 10 lb of lean mass", overallTargetDate: "2026-10-31", journeyStartDate: "2026-07-20" }, phases: [
        { phaseId: "p1", phaseName: "Establish Maintenance", order: 0, status: "active", startDate: "2026-07-20", calculatedPlannedReviewDate: "2026-08-17", timelineProgressState: "active", progress: { progressType: "planned_time", clampedProgressPercentage: 4, presentationLabel: "Week 1 of 4" } },
        { phaseId: "p2", phaseName: "Lean Mass Build", order: 1, status: "upcoming", timelineProgressState: "upcoming", progress: { progressType: "outcome", clampedProgressPercentage: 0, presentationLabel: "0 of 10 lb measured", status: "awaiting_follow_up" } },
      ] }, additionalGuardrails: ["Keep weight gain gradual."] },
    }));
    expect(html).toContain("Build 10 lb of lean mass by October 31, 2026");
    expect(html).toContain("Establish Maintenance");
    expect(html).toContain("Lean Mass Build");
    expect(html.match(/Maintain approximately 8–9% body fat\./g)).toHaveLength(1);
    expect(html.match(/role="progressbar"/g)).toHaveLength(2);
    expect(html).toContain("lucide-compass");
    expect(html).toContain("lucide-dumbbell");
    expect(html).toContain("0 of 10 lb measured");
    expect(html).not.toContain("additional protection");
    expect(html).toContain("var(--chart-1)");
    expect(html).not.toContain("var(--success)");
    expect(html).toContain('color-mix(in srgb, var(--chart-1) 16%, transparent)');
    expect(html).toContain('color-mix(in srgb, var(--chart-1) 26%, var(--divider))');
    expect(html).toContain('color-mix(in srgb, var(--chart-3) 4%, transparent)');
    expect(html).toContain('color-mix(in srgb, var(--chart-3) 16%, transparent)');
    expect(html).toContain('color-mix(in srgb, var(--chart-3) 26%, var(--divider))');
    expect(html).toContain('color:var(--chart-3)');
    expect(html).toContain('text-[var(--primary)]">Guardrail');
    expect(html).toContain('text-[var(--text-secondary)]">0 of 10 lb measured');
    expect(html).toContain('text-[var(--text-muted)]">Awaiting next DEXA');
    expect(html).not.toMatch(/Journey began|Maintenance Calibration|Calibration in progress/);
  });

  it("includes previous-chapter context in the briefing link accessible name", () => {
    const html = renderToStaticMarkup(React.createElement(LatestAnalysisCard, {
      sectionLabel: "Previous Chapter Briefing",
      title: "Still on track.",
      prompt: "From the Visible Abs chapter. Your next briefing will evaluate Build Lean Mass.",
      href: "/briefing/daily",
    }));
    expect(html).toContain("Previous Chapter Briefing");
    expect(html).toContain('aria-label="Still on track.: From the Visible Abs chapter. Your next briefing will evaluate Build Lean Mass."');
  });

  it("renders independently clickable Event and Weekly cards in event-first order", () => {
    const html = renderToStaticMarkup(React.createElement(HomeBriefingCardStack, {
      cards: [
        { id: "event", sectionLabel: "Event Briefing", title: "Progress Photo Analysis Ready", prompt: "Open the latest coaching conversation.", href: "/briefings/photo/session" },
        { id: "weekly", sectionLabel: "Weekly Briefing", title: "Weekly Briefing Ready", prompt: "Review the completed week.", href: "/briefings/review/weekly" },
      ],
    }));
    expect(html.indexOf("Event Briefing")).toBeLessThan(html.indexOf("Weekly Briefing"));
    expect(html).toContain('href="/briefings/photo/session"');
    expect(html).toContain('href="/briefings/review/weekly"');
  });
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import FocusTile from "./FocusTile";

describe("Execution priority tile behavior", () => {
  it("renders setup-required navigation without a dose completion control", () => {
    const markup = renderToStaticMarkup(
      React.createElement(FocusTile, {
        actionLabel: "Review Execution",
        alwaysShowMetadata: true,
        changeLabel: "No active phase",
        color: "warning",
        completable: false,
        href: "/profile/operating-plan/execution/peptides/protocol",
        icon: "syringe",
        label: "Retatrutide",
        metadata: "Dose schedule needs update",
        subtitle: "Tonight",
      })
    );

    expect(markup).toContain("Dose schedule needs update");
    expect(markup).toContain("No active phase");
    expect(markup).toContain("Review Execution");
    expect(markup).not.toContain("Mark Retatrutide complete");
    expect(markup).not.toContain("<form");
  });

  it("preserves normal reminder-backed completion behavior", () => {
    const markup = renderToStaticMarkup(
      React.createElement(FocusTile, {
        alwaysShowMetadata: true,
        completeAction: () => {},
        completable: true,
        completionContext: {
          occurrenceDate: "2026-07-30",
          dose: "0.75 mg",
          protocolId: "protocol",
        },
        completionId: "reminder",
        href: "/priorities/reminder",
        icon: "syringe",
        label: "Tesamorelin",
        metadata: "0.75 mg tonight",
        subtitle: "Tonight",
      })
    );

    expect(markup).toContain("0.75 mg tonight");
    expect(markup).toContain("Mark Tesamorelin complete");
    expect(markup).toContain('name="priorityId"');
    expect(markup).toContain('value="reminder"');
  });
});

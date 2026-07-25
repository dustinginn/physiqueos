import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Target } from "lucide-react";
import { GoalNavigationCard } from "./GoalsHubScreen";

const goal = {
  id: "goal-test",
  title: "Test Goal",
  statusLabel: "On Track",
  confidence: 42,
  icon: Target,
  color: "primary",
};

describe("GoalNavigationCard navigation safety", () => {
  it("renders supported navigation as an accessible native link", () => {
    const html = renderToStaticMarkup(React.createElement(GoalNavigationCard, {
      goal: {
        ...goal,
        navigation: { available: true, code: "GOAL_NAVIGATION_RESOLVED", href: "/goals/test" },
      },
    }));
    expect(html).toContain('href="/goals/test"');
    expect(html).toContain('aria-label="Open Test Goal"');
    expect(html).toContain("focus-visible:outline");
    expect(html).not.toContain("<article");
  });

  it("renders missing navigation as readable non-focusable content", () => {
    const html = renderToStaticMarkup(React.createElement(GoalNavigationCard, {
      goal: {
        ...goal,
        navigation: { available: false, code: "GOAL_NAVIGATION_UNSUPPORTED_TYPE", href: null },
      },
    }));
    expect(html).toContain("<article");
    expect(html).toContain('data-navigation-unavailable="true"');
    expect(html).toContain("Test Goal");
    expect(html).not.toContain("href=");
    expect(html).not.toContain("href=\"#\"");
    expect(html).not.toContain("tabindex");
  });
});

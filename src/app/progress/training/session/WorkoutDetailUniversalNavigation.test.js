import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createProgressReportingService } from "../../../../domain/services/ProgressReportingService";
import { FounderRepositories } from "../../../../data/repositories/founderRepositories";
import { getSessionContent } from "../../../../screens/TrainingKnowledgeScreen";

const storePath = path.resolve(process.cwd(), "private/founder/runtime-store.json");
const screen = fs.readFileSync("src/screens/TrainingKnowledgeScreen.jsx", "utf8");
const route = fs.readFileSync(
  "src/app/progress/training/session/[sessionId]/page.js",
  "utf8"
);
const actions = fs.readFileSync(
  "src/app/progress/training/session/[sessionId]/actions.js",
  "utf8"
);
const navigationRow = fs.readFileSync(
  "src/components/training/TrainingNavigationButtonRow.jsx",
  "utf8"
);
const mobileHeader = fs.readFileSync(
  "src/components/navigation/MobilePageHeader.jsx",
  "utf8"
);

describe("universal Workout Detail navigation", () => {
  it("renders one canonical Training navigation row from the shared session boundary", () => {
    expect(screen).toContain('mode === "session"');
    expect(screen).toContain(
      '<TrainingNavigationButtonRow'
    );
    expect(screen).toContain('items={[{ href: trainingHref, label: "Training" }]}');
    expect(screen).not.toContain("Back to Training");
    expect(screen).not.toContain("<ActionButton");
    expect(screen.match(/ariaLabel="Workout Detail navigation"/g)).toHaveLength(1);
    expect(route).not.toContain("pageNavigation");
    expect(route).not.toContain("Back to Training");
  });

  it("places the shared row after the header and directly before the summary", () => {
    const header = screen.indexOf("<MobilePageHeader");
    const control = screen.indexOf(
      'ariaLabel="Workout Detail navigation"'
    );
    const sections = screen.indexOf(
      '<div className="space-y-4">{content.sections}</div>'
    );
    const sessionDetails = screen.indexOf('title="Session Details"');
    const navigationSlot = mobileHeader.indexOf("{navigationSlot}");
    const breadcrumbs = mobileHeader.indexOf(
      "<BreadcrumbTrail items={breadcrumbs} />"
    );
    const description = mobileHeader.indexOf("{description && (");

    expect(control).toBeGreaterThan(header);
    expect(sections).toBeGreaterThan(control);
    expect(sessionDetails).toBeGreaterThan(sections);
    expect(navigationSlot).toBeGreaterThan(
      mobileHeader.indexOf('className="flex items-center justify-between gap-3"')
    );
    expect(breadcrumbs).toBeGreaterThan(navigationSlot);
    expect(description).toBeGreaterThan(breadcrumbs);
  });

  it("removes the legacy breadcrumb only from Workout Detail", () => {
    expect(screen).toContain(
      'breadcrumbs={mode === "session" ? [] : navigation?.breadcrumbs}'
    );
    expect(screen).not.toContain(
      'mode === "session" ? navigation?.breadcrumbs'
    );
    expect(mobileHeader).toContain("<BreadcrumbTrail items={breadcrumbs} />");
    expect(mobileHeader).not.toContain('aria-label="Workout Detail breadcrumb"');
  });

  it("has no workout-source or activity-type condition around navigation", () => {
    const control = screen.indexOf('ariaLabel="Workout Detail navigation"');
    const boundary = screen.slice(Math.max(0, control - 250), control + 250);
    expect(boundary).not.toMatch(
      /sourceEvidence|exercise|cardio|resistance|outdoor|manual|legacy|corrected/
    );
  });

  it("reuses the exact Training Library navigation-button component", () => {
    expect(screen.match(/<TrainingNavigationButtonRow/g)).toHaveLength(2);
    expect(screen).toContain("navigationSlot={");
    expect(screen).toContain('ariaLabel="Training Library hierarchy"');
    expect(navigationRow).toContain("min-h-11");
    expect(navigationRow).toContain("border-[var(--divider)]");
    expect(navigationRow).not.toContain("w-full");
  });

  it.each([
    ["resistance", { exercises: [{ id: "bench", name: "Bench", sets: [] }] }],
    ["cardio", { activityType: "cardio", durationMinutes: 30 }],
    ["outdoor walk", { activityType: "outdoor_walk", distance: 2.5 }],
    ["manual", { sourceEvidence: ["Manual entry"] }],
    ["screenshot", { sourceEvidence: ["Screenshot"] }],
    ["typed evidence", { sourceEvidence: ["Typed evidence"] }],
    ["corrected", { correctionStatus: "corrected" }],
    ["legacy sparse", {}],
    ["mixed source", { sourceEvidence: ["Screenshot", "Typed evidence"] }],
  ])("uses the shared session composition for %s records", (_label, shape) => {
    const content = getSessionContent({
      correctionAction: () => {},
      session: {
        date: "2026-07-23",
        detail: "Canonical workout",
        id: `fixture-${_label}`,
        label: "Workout",
        value: "Complete record",
        ...shape,
      },
    });

    expect(content.eyebrow).toBe("Workout Detail");
    expect(content.sections.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps the selector out and the complete canonical session contract intact", () => {
    expect(route).not.toContain("TrainingTimelineSelector");
    expect(route).toContain('getPlaceholderReport("training")');
    expect(screen).toContain('title="Session Details"');
    expect(screen).toContain('title="Add / Correct Workout Details"');
    expect(screen).toContain("session.sourceEvidence");
  });

  it("uses the one allowlisted resolver for direct and contextual entry", () => {
    expect(route).toContain("resolveTrainingReturnPath");
    expect(route).toContain("backHref={returnHref}");
    expect(route).toContain("returnTo: returnHref");
    expect(route).toContain("getTrainingRootHref(query?.context)");
    expect(route).not.toMatch(/https?:\/\//);
  });

  it("preserves return context through every correction outcome", () => {
    expect(actions).toContain("resolveTrainingReturnPath");
    expect(actions).toContain('sessionTarget("saved")');
    expect(actions).toContain('sessionTarget("missing-details")');
    expect(actions).toContain('sessionTarget("session-not-found")');
    expect(actions).toContain('sessionTarget("failed")');
  });

  it(
    "uses the same route and screen for every canonical session shape",
    async () => {
      const before = fs.readFileSync(storePath);
      const report = await createProgressReportingService({
        repositories: FounderRepositories,
      }).getPlaceholderReport("training");
      const sessions = (report.trainingDays ?? []).flatMap(
        (day) => day.sessions ?? []
      );
      const shapes = new Set(
        sessions.map((session) => {
          if (session.exercises?.length && session.sourceEvidence?.length > 1) {
            return "mixed-source resistance";
          }
          if (session.exercises?.length) return "resistance";
          if (/walk/i.test(session.label ?? "")) return "outdoor walk";
          if (/cardio|elliptical|stair|cycle|run/i.test(session.label ?? "")) {
            return "cardio";
          }
          return "sparse or legacy";
        })
      );

      expect(sessions.length).toBeGreaterThan(0);
      expect([...shapes].some((shape) => shape.includes("resistance"))).toBe(
        true
      );
      expect(shapes.has("outdoor walk")).toBe(true);
      expect(
        sessions.every((session) => session.href?.startsWith(
          "/progress/training/session/"
        ))
      ).toBe(true);
      expect(fs.readFileSync(storePath)).toEqual(before);
    },
    30000
  );
});

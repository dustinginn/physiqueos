import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { buildTrainingLibraryNavigation } from "../navigation/navigationRegistry";
import { withTrainingTimelineContext } from "../navigation/trainingTimelineNavigation";
import { getTrainingLibraryHeaderItems } from "./TrainingKnowledgeScreen";

const screenSource = fs.readFileSync(
  new URL("./TrainingKnowledgeScreen.jsx", import.meta.url),
  "utf8"
);

function getHeaderItems({
  context = "all",
  exerciseDetail = false,
  path,
  reportingOrigin = false,
}) {
  const navigation = buildTrainingLibraryNavigation(path);
  const adaptHref = (href) => withTrainingTimelineContext(href, context);

  return getTrainingLibraryHeaderItems({
    adaptHref,
    breadcrumbs: navigation.breadcrumbs.map((item) => ({
      ...item,
      href: adaptHref(item.href),
    })),
    currentRoute: navigation.route,
    exerciseDetail,
    reportingOrigin,
  });
}

describe("Training Library exercise-detail navigation", () => {
  it("omits only the current exercise from query-adapted detail navigation", () => {
    const items = getHeaderItems({
      exerciseDetail: true,
      path: ["back", "iso-lateral-high-rows"],
    });

    expect(items).toEqual([
      { href: "/progress/training?context=all", label: "Training" },
      {
        href: "/progress/training/library?context=all",
        label: "Training Library",
      },
      {
        href: "/progress/training/library/back?context=all",
        label: "Back",
      },
    ]);
  });

  it("keeps Reporting and goal-specific context while suppressing its self-link", () => {
    const items = getHeaderItems({
      context: "build-lean-mass",
      exerciseDetail: true,
      path: ["glutes", "hip-thrusts"],
      reportingOrigin: true,
    });

    expect(items.map((item) => item.label)).toEqual([
      "Training",
      "Training Library",
      "Reporting",
      "Glutes",
    ]);
    expect(items.every((item) => item.href.includes("context=build-lean-mass")))
      .toBe(true);
  });

  it("preserves the current category self-link", () => {
    const items = getHeaderItems({ path: ["back"] });

    expect(items.at(-1)).toEqual({
      href: "/progress/training/library/back?context=all",
      label: "Back",
    });
  });

  it("preserves current activity-detail behavior", () => {
    const items = getHeaderItems({ path: ["cardio", "walking"] });

    expect(items.at(-1)).toEqual({
      href: "/progress/training/library/cardio/walking?context=all",
      label: "Walking",
    });
  });

  it("uses an explicit exercise-detail signal and retains the header title", () => {
    expect(screenSource).toContain('navigationContext: "exercise-detail"');
    expect(screenSource).toContain(
      'exerciseDetail={content.navigationContext === "exercise-detail"}'
    );
    expect(screenSource).toContain("<h1");
    expect(screenSource).toContain("{title}");
  });
});

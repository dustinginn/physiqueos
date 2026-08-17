import { describe, expect, it } from "vitest";
import { buildMilestoneStory } from "./milestoneStoryPresentation";

describe("milestoneStoryPresentation", () => {
  it("tells the phase-transition story as what happened / why it matters / what changed, for an arbitrary phase pair", () => {
    const story = buildMilestoneStory("phase_transition", {
      date: "2027-03-04",
      priorPhaseName: "Reset Baseline",
      activePhaseName: "Recomposition Phase",
      measurementDate: "2027-03-04",
      metricLabel: "body fat percentage",
      metricValue: "11.9%",
      changeFromBaseline: "-1.5%",
    });
    expect(story.title).toBe("Reset Baseline completed · Recomposition Phase began");
    expect(story.body).toMatch(/Reset Baseline finished/);
    expect(story.body).toMatch(/measured 11\.9% of body fat percentage, -1\.5% from the goal baseline/);
    expect(story.body).toMatch(/enough to move forward with confidence/);
    expect(story.body).toMatch(/focus now shifts to Recomposition Phase/);
    expect(story.date).toBe("2027-03-04");
  });

  it("does not dump Strategy targets or review-cadence mechanics into the milestone story", () => {
    const story = buildMilestoneStory("phase_transition", {
      date: "2027-03-04", priorPhaseName: "Phase A", activePhaseName: "Phase B",
    });
    expect(story.body).not.toMatch(/kcal\/day|monthly|weekly evidence monitoring|strategic review|authoriz/i);
  });

  it("omits the measurement sentence entirely when no DEXA is available at the transition", () => {
    const story = buildMilestoneStory("phase_transition", {
      date: "2027-01-01", priorPhaseName: "Phase A", activePhaseName: "Phase B",
    });
    expect(story.body).toBe("Phase A finished. That was enough to move forward with confidence — the focus now shifts to Phase B.");
  });

  it("builds the dexa_baseline, goal_activated, planned_review, and goal_destination stories generically", () => {
    expect(buildMilestoneStory("dexa_baseline", { date: "2027-01-01" }).title).toBe("DEXA baseline established");
    expect(buildMilestoneStory("goal_activated", { date: "2027-01-01" }).title).toBe("Goal journey activated");
    expect(buildMilestoneStory("planned_review", { date: "2027-02-01", upcomingPhaseName: "Phase C" }).body)
      .toMatch(/readiness for Phase C/);
    expect(buildMilestoneStory("planned_review", { date: "2027-02-01", upcomingPhaseName: null }).body)
      .toMatch(/progress and the appropriate goal decision/);
    expect(buildMilestoneStory("goal_destination", { date: "2027-06-01", targetDescription: "Add 6 lb of lean mass" }).body)
      .toMatch(/toward Add 6 lb of lean mass/);
  });

  it("throws for an unrecognized milestone kind rather than silently fabricating a filler story", () => {
    expect(() => buildMilestoneStory("not_a_real_kind", {})).toThrow(/Unknown milestone kind/);
  });

  it("every story is a plain {title, body, date} — no raw canonical objects leak through", () => {
    const story = buildMilestoneStory("phase_transition", {
      date: "2027-03-04", priorPhaseName: "Phase A", activePhaseName: "Phase B",
      measurementDate: "2027-03-04", metricLabel: "lean mass", metricValue: "131.5 lb", changeFromBaseline: "+1.5 lb",
    });
    expect(Object.keys(story).sort()).toEqual(["body", "date", "title"]);
    expect(typeof story.title).toBe("string");
    expect(typeof story.body).toBe("string");
  });
});

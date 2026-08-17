// Turning Points are concise milestone stories, not serialized event logs. The domain decides
// whether an event is consequential enough to become a milestone (only real facts reach this
// module — nothing here fabricates a milestone that didn't happen); this module decides how to
// tell it. Every story answers three things: what happened, why it matters, and what changed
// because of it. Strategy specifics (targets, cadence, review mechanics) stay out — those
// belong to the Current Strategy presentation, not the milestone story.

export function buildMilestoneStory(kind, facts = {}) {
  const builder = MILESTONE_STORY_BUILDERS[kind];
  if (!builder) throw new Error(`Unknown milestone kind: ${kind}`);
  return builder(facts);
}

const MILESTONE_STORY_BUILDERS = Object.freeze({
  dexa_baseline: ({ date }) => ({
    title: "DEXA baseline established",
    body: "This measurement became the starting point every future scan is compared against.",
    date,
  }),

  goal_activated: ({ date }) => ({
    title: "Goal journey activated",
    body: "The journey began, with its first phase underway.",
    date,
  }),

  phase_transition: ({ date, priorPhaseName, activePhaseName, measurementDate, metricLabel, metricValue, changeFromBaseline }) => {
    const measurementClause = metricValue
      ? ` The ${formatShortDate(measurementDate)} DEXA measured ${metricValue}${metricLabel ? ` of ${metricLabel}` : ""}${changeFromBaseline ? `, ${changeFromBaseline} from the goal baseline` : ""}.`
      : "";
    return {
      title: `${priorPhaseName} completed · ${activePhaseName} began`,
      body: `${priorPhaseName} finished.${measurementClause} That was enough to move forward with confidence — the focus now shifts to ${activePhaseName}.`,
      date,
    };
  },

  planned_review: ({ date, upcomingPhaseName }) => ({
    title: "Planned phase review",
    body: upcomingPhaseName
      ? `Evidence will determine readiness for ${upcomingPhaseName}.`
      : "Evidence will determine progress and the appropriate goal decision.",
    date,
  }),

  goal_destination: ({ date, targetDescription }) => ({
    title: "Goal destination",
    body: `Future evidence will measure progress toward ${targetDescription}.`,
    date,
  }),
});

function formatShortDate(value) {
  if (!value) return "next";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T12:00:00Z`));
}

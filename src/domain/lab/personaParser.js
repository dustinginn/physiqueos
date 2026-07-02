export function parsePersonasFromMarkdown(markdown) {
  const sections = markdown
    .split(/\n---\n/g)
    .filter((section) => /^# \d+\./m.test(section));

  return sections.map((section) => {
    const titleMatch = section.match(/^# \d+\.\s+(.+)$/m);
    const title = titleMatch?.[1]?.trim() ?? "Untitled Persona";

    return {
      id: slugify(title),
      title,
      level: getPersonaLevel(title, section),
      background: getField(section, "Short Background"),
      primaryGoal: getField(section, "Primary Goal"),
      supportingObjectives: splitList(getField(section, "Potential Supporting Objectives")),
      existingEvidence: splitList(getField(section, "Existing Evidence")),
      missingEvidence: splitList(getField(section, "Missing Evidence")),
      likelyProtocols: splitList(getField(section, "Likely Protocols")),
      engagementStyle: getField(section, "Preferred Engagement Style"),
      potentialIntegrations: splitList(getField(section, "Potential Integrations")),
      briefingStyle: getField(section, "Likely Daily Briefing Style"),
      challenges: splitList(getField(section, "Potential Challenges")),
      onboardingPriorities: getField(section, "Onboarding Should Prioritize"),
      inferenceOpportunities: getField(section, "PhysiqueOS Should Infer"),
      avoidAsking: getField(section, "PhysiqueOS Should Avoid Asking"),
      firstWowMoment: getField(section, "First Wow Moment"),
      firstBriefingEmphasis: getField(section, "First Daily Briefing Might Emphasize"),
      sixWeekEvolution: getField(section, "After Six Weeks"),
    };
  });
}

function getField(section, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escaped}:\\s*\\n\\n([\\s\\S]*?)(?=\\n\\n[A-Z][^\\n]+:\\n|$)`);
  const match = section.match(pattern);

  return cleanValue(match?.[1] ?? "");
}

function cleanValue(value) {
  return value
    .replace(/\n---[\s\S]*$/g, "")
    .replace(/\n+# .+$/g, "")
    .trim();
}

function splitList(value) {
  if (!value) return [];

  return value
    .split(/,|\n\*|\n-/)
    .map((item) => item.replace(/^\*|-/, "").trim())
    .filter(Boolean);
}

function getPersonaLevel(title, section) {
  const value = `${title} ${section}`.toLowerCase();

  if (value.includes("no existing") || value.includes("first fat-loss")) {
    return "Empty profile";
  }

  if (
    value.includes("beginner") ||
    value.includes("starting fresh") ||
    value.includes("minimalist")
  ) {
    return "Beginner";
  }

  if (
    value.includes("powerlifter") ||
    value.includes("bodybuilder") ||
    value.includes("biohacker") ||
    value.includes("data enthusiast") ||
    value.includes("triathlete")
  ) {
    return "Power user";
  }

  if (
    value.includes("athlete") ||
    value.includes("marathon") ||
    value.includes("crossfit") ||
    value.includes("advanced")
  ) {
    return "Advanced";
  }

  return "Intermediate";
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function getDailyEvent({
  checkIns = [],
  dexaScans = [],
  progressPhotos = [],
  protocols = [],
  weights = [],
} = {}) {
  const sortedWeights = sortByDate(weights, "measuredAt");
  const sortedDEXA = sortByDate(dexaScans, "measuredAt");
  const sortedPhotos = sortByDate(progressPhotos, "date");
  const sortedCheckIns = sortByDate(checkIns, "date");
  const latestWeight = sortedWeights.at(-1) ?? null;
  const previousWeight = sortedWeights.at(-2) ?? null;
  const latestCheckIn = sortedCheckIns.at(-1) ?? null;
  const recoveryNote = getRecoveryNote(latestCheckIn);
  const latestWeightEvent = getWeightEvent({
    latestWeight,
    previousWeight,
    weights: sortedWeights,
  });
  const latestDEXA = sortedDEXA.at(-1) ?? null;
  const latestPhotos = sortedPhotos.filter(
    (photo) =>
      latestWeight?.measuredAt &&
      getDateKey(photo.date ?? photo.capturedAt) === latestWeight.measuredAt
  );
  const candidates = [
    latestWeightEvent,
    latestDEXA &&
      isSameDate(latestDEXA.measuredAt, latestWeight?.measuredAt) && {
        type: "new_dexa",
        significance: 90,
        homeSubtitle: "New DEXA processed",
        heroTitle: "New DEXA processed.",
        heroSummary: "Body composition evidence has been refreshed.",
        coachLead: "Today's DEXA adds a new calibration point to the goal model.",
        journeyLead: "A new DEXA scan is now available for body-composition reporting.",
      },
    latestPhotos.length > 0 && {
      type: "new_progress_photos",
      significance: 70,
      homeSubtitle: "Progress photos added",
      heroTitle: "Visual evidence added.",
      heroSummary: "Progress photos strengthened the visual evidence stream.",
      coachLead: "Today's progress photos add fresh visual context to the cut.",
      journeyLead: "New progress photos were added under comparable conditions.",
    },
    recoveryNote && {
      type: "recovery_note",
      significance: 55,
      homeSubtitle: "Recovery context added",
      heroTitle: "Recovery context noted.",
      heroSummary: recoveryNote.summary,
      coachLead: recoveryNote.coachLead,
      journeyLead: recoveryNote.journeyLead,
      note: recoveryNote.originalNote,
    },
    getProtocolCompletionEvent({ checkIns: sortedCheckIns, protocols }),
  ].filter(Boolean);

  return (
    candidates.sort((a, b) => b.significance - a.significance)[0] ??
    getNoMeaningfulChangeEvent({ latestWeight, previousWeight })
  );
}

export function extractManualNoteEvidence(note) {
  const normalized = String(note ?? "").trim();
  const lower = normalized.toLowerCase();

  if (!normalized) return null;

  const sleepMentioned =
    lower.includes("sleep") ||
    lower.includes("slept") ||
    lower.includes("tired") ||
    lower.includes("recovery");
  const poorSleep =
    sleepMentioned &&
    (lower.includes("poor") ||
      lower.includes("only") ||
      lower.includes("not enough") ||
      lower.includes("rough") ||
      lower.includes("7 hour") ||
      lower.includes("7 hours"));

  if (!sleepMentioned) {
    return {
      category: "general_note",
      originalNote: normalized,
      summary: "Manual context was added.",
    };
  }

  return {
    category: "recovery",
    originalNote: normalized,
    summary: poorSleep
      ? "Sleep was flagged as a recovery constraint."
      : "Sleep context was added.",
    sleepQuality: poorSleep ? "limited" : "noted",
    sleepTargetHit: poorSleep ? false : null,
    coachLead: poorSleep
      ? "You added recovery context: sleep has been limited for the last couple nights."
      : "You added sleep context that should travel with today's evidence.",
    journeyLead: poorSleep
      ? "Today's note flagged limited sleep, which matters when interpreting weight and recovery."
      : "Today's note added recovery context to the evidence stream.",
  };
}

function getWeightEvent({ latestWeight, previousWeight, weights }) {
  if (!latestWeight) return null;

  const previousLow = Math.min(
    ...weights
      .slice(0, -1)
      .map((entry) => entry.weight?.value)
      .filter(Number.isFinite)
  );
  const latestValue = latestWeight.weight?.value;
  const previousValue = previousWeight?.weight?.value;

  if (Number.isFinite(latestValue) && latestValue < previousLow) {
    return {
      type: "new_low_weight",
      significance: 100,
      homeSubtitle: "New lowest weight",
      heroTitle: "New low confirmed.",
      heroSummary: `${latestValue.toFixed(1)} ${latestWeight.weight.unit ?? "lb"} established another lowest weigh-in.`,
      coachLead: `Today's new low further strengthens one of the most consistent weight trends of your cut.`,
      journeyLead: `Today's weigh-in established a new low of ${latestValue.toFixed(1)} ${latestWeight.weight.unit ?? "lb"}.`,
    };
  }

  if (
    Number.isFinite(latestValue) &&
    Number.isFinite(previousValue) &&
    latestValue === previousValue &&
    previousValue <= previousLow
  ) {
    return {
      type: "held_low_weight",
      significance: 85,
      homeSubtitle: "Weight held after new low",
      heroTitle: "New low held.",
      heroSummary: `${latestValue.toFixed(1)} ${latestWeight.weight.unit ?? "lb"} held after the recent drop.`,
      coachLead:
        "Holding a new low is consistent with normal stabilization rather than loss of momentum.",
      journeyLead: `Today's weigh-in held the recent low at ${latestValue.toFixed(1)} ${latestWeight.weight.unit ?? "lb"}.`,
    };
  }

  return null;
}

function getProtocolCompletionEvent({ checkIns, protocols }) {
  const latest = checkIns.at(-1);
  const completedIds = latest?.protocols?.completedProtocolIds ?? [];

  if (completedIds.length === 0) return null;

  const names = completedIds
    .map((id) => protocols.find((protocol) => protocol.id === id)?.name)
    .filter(Boolean);

  return {
    type: "protocol_completed",
    significance: 60,
    homeSubtitle: "Protocol completed",
    heroTitle: "Protocol complete.",
    heroSummary: `${names.join(", ") || "Protocol"} completion was recorded.`,
    coachLead: "Today's protocol completion keeps the operating plan on schedule.",
    journeyLead: "Protocol completion was added as contextual evidence.",
  };
}

function getNoMeaningfulChangeEvent({ latestWeight, previousWeight }) {
  const latestValue = latestWeight?.weight?.value;
  const previousValue = previousWeight?.weight?.value;

  if (
    Number.isFinite(latestValue) &&
    Number.isFinite(previousValue) &&
    Math.abs(latestValue - previousValue) <= 0.1
  ) {
    return {
      type: "no_meaningful_change",
      significance: 20,
      homeSubtitle: "No meaningful change",
      heroTitle: "Trend held steady.",
      heroSummary: "Today's evidence did not require a change to the plan.",
      coachLead:
        "Today's evidence is stable, so the right move is to keep execution simple.",
      journeyLead:
        "Today's weigh-in did not materially change the trend, which is useful evidence by itself.",
    };
  }

  return {
    type: "briefing_ready",
    significance: 10,
    homeSubtitle: "See what changed",
    heroTitle: "Briefing ready.",
    heroSummary: "The latest evidence has been organized for review.",
    coachLead:
      "The latest evidence has been reviewed and organized into today's plan.",
    journeyLead: "Evidence has been updated since the last review.",
  };
}

function getRecoveryNote(checkIn) {
  const noteEvidence = extractManualNoteEvidence(checkIn?.notes);

  return noteEvidence?.category === "recovery" ? noteEvidence : null;
}

function sortByDate(records, field) {
  return [...records].sort((a, b) =>
    String(a[field] ?? "").localeCompare(String(b[field] ?? ""))
  );
}

function isSameDate(a, b) {
  return Boolean(a && b && getDateKey(a) === getDateKey(b));
}

function getDateKey(value) {
  return String(value ?? "").slice(0, 10);
}

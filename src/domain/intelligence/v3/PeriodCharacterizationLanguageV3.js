// Realizes the shared Briefing Intelligence characterization as recurring
// narrative sections. Every sentence is built from the structured findings
// (pattern kind, domain, direction, span, recurrence, reliability) — never
// from copy written for a particular period. Wearable measures are described
// directionally, never with estimated precision, and nothing here attributes
// a cause: a routine shift says only what changed together.

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven"];
const DOMAIN_ORDER = { training: 0, nutrition: 1, activity: 2, body: 3 };
const POSITION_PHRASE = { late: "Late in the week", early: "Early in the week", middle: "Midweek", whole: "All week" };

export function realizePeriodCharacterizationV3({ intelligence, goalLabel, nextEvidenceName }) {
  if (intelligence?.policy?.cadence !== "weekly") return null;
  const lead = intelligence.characterization?.[0];
  if (!lead) return null;
  const patternsById = new Map((intelligence.patterns ?? []).map((item) => [item.id, item]));
  const members = lead.kind === "routine_shift"
    ? (lead.members ?? []).map((id) => patternsById.get(id)).filter(Boolean)
    : [lead];
  const ordered = [...members].sort((left, right) =>
    (DOMAIN_ORDER[left.domain] ?? 9) - (DOMAIN_ORDER[right.domain] ?? 9) ||
    right.materiality - left.materiality);
  const clauses = mergeSameDayGaps(ordered).map(memberClause).filter(Boolean);
  if (!clauses.length) return null;
  const span = lead.span;
  const reliability = reliabilityWithin(intelligence.reliability ?? [], span);
  const result = shortenToBudget(lead.kind === "routine_shift"
    ? `${POSITION_PHRASE[lead.position] ?? "This week"} the usual routine changed: ${list(clauses.slice(0, 3))}.`
    : `${upperFirst(clauses[0])}.`);
  const dayCount = lead.kind === "routine_shift" ? span.days : null;
  const recurrence = lead.recurrence?.count > 0 ? lead.recurrence : null;
  const offRoutine = dayCount ? `${upperFirst(numberWord(dayCount))} off-routine ${dayCount === 1 ? "day is" : "days are"}` :
    "A change like this is";
  const weeks = numberWord(Math.round(daysBetween(intelligence.horizon.baselineWindow.startDate,
    intelligence.horizon.window.endDate) / 7));
  const occurrence = recurrence ? ordinal(recurrence.count + 1) : null;
  const recurringWhat = recurrence ? recurrenceNoun(recurrence) : null;
  const meaning = recurrence
    ? `${offRoutine} small against your progress toward ${goalLabel}, but this is the ${occurrence} ${recurringWhat} in the last ${weeks} weeks.`
    : `${offRoutine} small against your progress toward ${goalLabel} and do not change the plan on ${dayCount === 1 ? "its" : "their"} own.`;
  const restore = restorationTargets(ordered);
  const action = restore.length
    ? `Get back to your usual ${list(restore)} this week. Keep the current setup in place.`
    : "Return to your usual routine this week. Keep the current setup in place.";
  const watch = recurrence
    ? `Watch whether next week holds its routine; a ${ordinal(recurrence.count + 2)} ${recurringWhat} would be a pattern worth planning around.`
    : `Watch whether next week holds its routine; one stretch like this is noise, a repeat would be a pattern.`;
  const reliabilityNote = reliability.length
    ? ` Nutrition logs for ${dayPhrase(reliability.map((item) => item.date), "and")} look incomplete, so intake on ${reliability.length === 1 ? "that day" : "those days"} is not counted either way.`
    : "";
  const coachTake = `A few days off the usual routine will not undo the progress, and none of it calls for changing the plan; the goal is to keep it a one-off.${reliabilityNote}`;
  const confidencePeriod = dayCount
    ? `a ${numberWord(dayCount)}-day break in routine`
    : "this week's change";
  return {
    leadId: lead.id,
    result, meaning, action, watch, coachTake,
    confidencePeriod,
    nextEvidenceName,
    reliabilityIds: reliability.map((item) => item.id),
  };
}

// Routine gaps on exactly the same days read as one clause
// ("no training or weigh-ins Friday or Saturday").
function mergeSameDayGaps(members) {
  const merged = [];
  for (const item of members) {
    const twin = item.kind === "routine_gap" && merged.find((other) => other.kind === "routine_gap" &&
      other.dates.join() === item.dates.join());
    if (twin) twin.gapLabels.push(gapLabel(item));
    else merged.push(item.kind === "routine_gap" ? { ...item, gapLabels: [gapLabel(item)] } : item);
  }
  return merged;
}

function gapLabel(item) {
  return item.domain === "training" ? "training" : item.domain === "body" ? "weigh-ins" : label(item);
}

function memberClause(item) {
  const days = dayPhrase(item.dates?.length ? item.dates : [item.span.startDate, item.span.endDate],
    item.kind === "routine_gap" ? "or" : "through");
  if (item.kind === "routine_gap") {
    return `no ${(item.gapLabels ?? [gapLabel(item)]).join(" or ")} ${days}`;
  }
  if (item.kind === "value_run") {
    return `${label(item)} ${directionWord(item)} your usual ${days}`;
  }
  if (item.kind === "level_shift") {
    return `${label(item)} ${directionWord(item)} your usual all week`;
  }
  if (item.kind === "frequency_change") {
    return `${item.magnitude.observed} training ${item.magnitude.observed === 1 ? "day" : "days"} against a usual ${Math.round(item.magnitude.expected)}`;
  }
  if (item.kind === "dispersion_change") return `${label(item)} swinging more than usual`;
  return null;
}

function recurrenceNoun(recurrence) {
  const signals = new Set((recurrence.priorSpans ?? []).map((item) => item.signal));
  return signals.size === 1 && signals.has("training.session") ? "multi-day training break" : "break in routine";
}

function label(item) {
  return {
    "nutrition.calories": "intake",
    "activity.active_kcal": "movement",
    "activity.exercise_minutes": "activity",
    "training.session": "training",
    "body.weigh_in": "weigh-ins",
  }[item.signal] ?? item.domain;
}

function directionWord(item) {
  const ratio = Number(item.magnitude?.ratioToBaseline);
  if (item.direction === "below") return Number.isFinite(ratio) && ratio <= 0.6 ? "well below" : "below";
  if (item.direction === "above") return Number.isFinite(ratio) && ratio >= 1.4 ? "well above" : "above";
  return item.direction;
}

function restorationTargets(members) {
  const targets = [];
  if (members.some((item) => item.domain === "training")) targets.push("training rhythm");
  if (members.some((item) => item.domain === "body")) targets.push("daily weigh-ins");
  if (!targets.length && members.some((item) => item.domain === "nutrition")) targets.push("intake range");
  return targets;
}

function reliabilityWithin(findings, span) {
  return findings.filter((item) => item.date >= span.startDate && item.date <= span.endDate &&
    item.effect === "excluded_from_behavior");
}

function dayPhrase(dates, joiner) {
  const unique = [...new Set(dates)].sort();
  const names = unique.map(weekday);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} ${joiner === "through" ? "and" : joiner} ${names[1]}`;
  if (consecutive(unique) && joiner !== "or") return `${names[0]} through ${names.at(-1)}`;
  return `${names.slice(0, -1).join(", ")}, ${joiner === "through" ? "and" : joiner} ${names.at(-1)}`;
}

function consecutive(dates) {
  return dates.every((date, index) => index === 0 ||
    Date.parse(`${date}T12:00:00Z`) - Date.parse(`${dates[index - 1]}T12:00:00Z`) === 86400000);
}

function weekday(date) {
  return WEEKDAYS[new Date(`${date}T12:00:00.000Z`).getUTCDay()];
}

function numberWord(value) { return NUMBER_WORDS[value] ?? String(value); }

function ordinal(value) {
  return ["zeroth", "first", "second", "third", "fourth", "fifth", "sixth"][value] ?? `${value}th`;
}

function daysBetween(startDate, endDate) {
  return (Date.parse(`${endDate}T12:00:00Z`) - Date.parse(`${startDate}T12:00:00Z`)) / 86400000 + 1;
}

function list(items) {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function shortenToBudget(text, budget = 160) {
  if (text.length <= budget) return text;
  const withoutLast = text.replace(/,? and [^,]+\.$/u, ".").replace(/, ([^,]+)\.$/u, " and $1.");
  return withoutLast.length <= budget ? withoutLast : `${text.slice(0, budget - 1).replace(/[\s,;:]+\S*$/u, "")}.`;
}

function upperFirst(value) {
  return value ? `${value[0].toLocaleUpperCase("en-US")}${value.slice(1)}` : value;
}

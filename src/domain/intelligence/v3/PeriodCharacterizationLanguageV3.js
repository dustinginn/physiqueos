// Realizes the shared Briefing Intelligence characterization as recurring
// narrative sections. Every sentence is chosen from the structured findings —
// the lead's kind, the direction of its members (a break, an increase, a mixed
// or a more variable week), its span, evidenced recurrence, reliability
// findings and the person's own habits — never from copy written for a
// particular period. Wearable measures are described directionally, nothing
// attributes a cause, and nothing assumes progress the evidence has not shown.

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const ORDINALS = ["zeroth", "first", "second", "third", "fourth", "fifth", "sixth"];
const DOMAIN_ORDER = { training: 0, nutrition: 1, activity: 2, body: 3 };
const POSITION_PHRASE = { late: "Late in the week", early: "Early in the week", middle: "Midweek", whole: "All week" };
const HEADLINE_BUDGET = 160;
const LABELS = {
  "nutrition.calories": "intake",
  "activity.active_kcal": "activity",
  "activity.exercise_minutes": "activity",
  "training.session": "training",
  "body.weigh_in": "weigh-ins",
};

export function realizePeriodCharacterizationV3({ intelligence, goalLabel, nextEvidenceName }) {
  if (intelligence?.policy?.cadence !== "weekly") return null;
  const lead = intelligence.characterization?.[0];
  if (!lead) return null;
  const patternsById = new Map((intelligence.patterns ?? []).map((item) => [item.id, item]));
  const members = lead.kind === "routine_shift"
    ? (lead.members ?? []).map((id) => patternsById.get(id)).filter(Boolean)
    : [lead];
  const units = mergeSameDayGaps(mergeActivity(members)).sort((left, right) =>
    (DOMAIN_ORDER[left.domain] ?? 9) - (DOMAIN_ORDER[right.domain] ?? 9) ||
    (right.materiality ?? 0) - (left.materiality ?? 0));
  if (!units.length) return null;

  const tone = toneOf(units);
  const { result, told } = heroResult(lead, units);
  const span = lead.span;
  const days = lead.kind === "routine_shift" || lead.kind === "value_run" || lead.kind === "routine_gap" ? span.days : null;
  const spanDays = span.days;
  const stretch = spanDays >= 7 ? "one week" : `${numberWord(spanDays)} ${spanDays === 1 ? "day" : "days"}`;
  const stretchIs = spanDays >= 7 || spanDays === 1 ? "is" : "are";
  const recurrence = tone === "break" && lead.recurrence?.count > 0 ? lead.recurrence : null;
  const weeks = recurrence ? Math.round(((recurrence.lookbackDays ?? 28) + windowDays(intelligence)) / 7) : null;
  const goalContext = `in the context of ${goalLabel}`;
  const subject = labelOf(told[0] ?? units[0]);

  let meaning;
  let watch;
  let coach;
  if (tone === "break") {
    const plural = Boolean(days && days > 1);
    const offRoutine = days
      ? `${upperFirst(numberWord(days))} off-routine ${plural ? "days are" : "day is"}`
      : "A week below the usual routine is";
    meaning = recurrence
      ? `${offRoutine} small ${goalContext}, but this is the ${ordinal(recurrence.count + 1)} multi-day training break in the last ${numberWord(weeks)} weeks.`
      : `${offRoutine} small ${goalContext} and ${plural ? "do" : "does"} not change the plan on ${plural ? "their" : "its"} own.`;
    watch = recurrence
      ? `Watch whether next week holds its routine; a ${ordinal(recurrence.count + 2)} multi-day training break would be a pattern worth planning around.`
      : "Watch whether next week holds its routine; one stretch like this is noise, a repeat would be a pattern.";
    coach = recurrence
      ? `${upperFirst(numberWord(recurrence.count + 1))} breaks like this in ${numberWord(weeks)} weeks are worth noticing, though not yet a reason to change the plan; the next week or two will show whether it is becoming a habit.`
      : spanDays <= 4
        ? "A short break like this rarely matters on its own; what matters is how quickly the usual routine comes back."
        : "A stretch like this matters less than how quickly the usual routine comes back.";
  } else if (tone === "increase") {
    meaning = `${upperFirst(stretch)} of higher ${subject} ${stretchIs} small ${goalContext}.`;
    watch = `Watch whether ${subject} settles back toward your usual next week; a repeat would be a pattern.`;
    coach = subject === "intake"
      ? "Whether that matters depends on the plan, not on your usual; the Energy view shows how intake compares with the target."
      : `If the extra ${subject} was deliberate, keep an eye on how recovery holds up; if not, ease back toward your usual range.`;
  } else if (tone === "variable") {
    meaning = `A more variable week is small ${goalContext}.`;
    watch = "Watch whether next week is steadier; a second uneven week would be a pattern.";
    coach = "An uneven week happens; what matters is settling back into a steady rhythm.";
  } else {
    meaning = `${upperFirst(stretch)} off the usual routine ${stretchIs} small ${goalContext}.`;
    watch = "Watch whether next week follows the usual routine; a second week like this would be a pattern.";
    coach = "Weeks like this happen; what matters is getting back to a steady routine.";
  }

  const action = composeAction({ tone, told, intelligence });
  const reliabilityNote = composeReliabilityNote(intelligence.reliability ?? [], span);
  return {
    leadId: lead.id,
    tone,
    result,
    meaning,
    action,
    watch,
    coachTake: `${coach}${reliabilityNote}`,
    confidencePeriod: tone === "break"
      ? (days && days <= 4 ? `a ${numberWord(days)}-day break in routine` : "a stretch below the usual routine")
      : `${stretch} off the usual routine`,
    nextEvidenceName,
    reliabilityIds: mostSpecificPerDate(reliabilityWithin(intelligence.reliability ?? [], span)).map((item) => item.id),
    toldPatternIds: told.flatMap((item) => item.sourceIds ?? [item.id]),
  };
}

// ---------------------------------------------------------------- hero

function heroResult(lead, units) {
  const clauses = units.map((unit) => ({ unit, text: clauseFor(unit) })).filter((item) => item.text);
  if (!clauses.length) throw new Error("No realizable clause for this characterization.");
  if (lead.kind !== "routine_shift") {
    const first = clauses[0];
    return { result: `${upperFirst(first.text)}.`, told: [first.unit] };
  }
  const prefix = `${POSITION_PHRASE[lead.position] ?? "This week"} the usual routine changed: `;
  // Whole clauses only, most important first, within the headline budget —
  // never a clause cut in half.
  const kept = [];
  for (const clause of clauses) {
    const candidate = `${prefix}${list([...kept, clause].map((item) => item.text))}.`;
    if (candidate.length <= HEADLINE_BUDGET || kept.length === 0) kept.push(clause);
  }
  return { result: `${prefix}${list(kept.map((item) => item.text))}.`, told: kept.map((item) => item.unit) };
}

function clauseFor(item) {
  const days = dayPhrase(item.dates?.length ? item.dates : [item.span.startDate, item.span.endDate],
    item.kind === "routine_gap" ? "or" : "and");
  if (item.kind === "routine_gap") return `no ${(item.gapLabels ?? [labelOf(item)]).join(" or ")} ${days}`;
  if (item.kind === "value_run") return `${labelOf(item)} ${directionWord(item)} your usual ${days}`;
  if (item.kind === "level_shift") return `${labelOf(item)} ${directionWord(item)} your usual for most of the week`;
  if (item.kind === "frequency_change") {
    return `${item.magnitude.observed} training ${item.magnitude.observed === 1 ? "day" : "days"} against a usual ${Math.round(item.magnitude.expected)}`;
  }
  if (item.kind === "dispersion_change") return `${labelOf(item)} swinging more than usual`;
  return null;
}

// ---------------------------------------------------------------- action

function composeAction({ tone, told, intelligence }) {
  const keep = "Keep the current setup in place.";
  // Intake is judged against the plan's targets (the Energy view), never
  // against the person's usual — a surplus plan may ask for more.
  const intakeTold = told.some((item) => item.domain === "nutrition");
  const intakeLine = intakeTold ? " Keep intake on plan." : "";
  if (tone === "increase") return intakeTold ? `Keep intake on plan this week. ${keep}` : `No adjustment is needed. ${keep}`;
  if (tone !== "break") return `Aim for a steadier routine this week.${intakeLine} ${keep}`;
  const weighInRate = intelligence.baselines?.find((item) => item.signal === "body.weigh_in")?.rate ?? 0;
  const targets = [];
  const has = (domain) => told.some((item) => item.domain === domain || item.gapDomains?.includes(domain));
  if (has("training")) targets.push("training rhythm");
  if (has("activity")) targets.push("activity level");
  if (has("body")) targets.push(weighInRate >= 0.85 ? "daily weigh-ins" : "weigh-in habit");
  return targets.length
    ? `Get back to your usual ${list(targets)} this week.${intakeLine} ${keep}`
    : `Return to your usual routine this week.${intakeLine} ${keep}`;
}

// ---------------------------------------------------------------- reliability

const RELIABILITY_PHRASE = {
  implausible_macro_profile: { one: "looks incomplete (protein far below your usual)", many: "look incomplete (protein far below your usual)" },
  duplicate_day_totals: { one: "repeats the previous day's totals", many: "repeat the previous day's totals" },
  partial_day: { one: "covers only part of the day", many: "cover only part of the day" },
};

function composeReliabilityNote(findings, span) {
  const within = mostSpecificPerDate(reliabilityWithin(findings, span));
  if (!within.length) return "";
  const byKind = new Map();
  for (const item of within) byKind.set(item.kind, [...(byKind.get(item.kind) ?? []), item.date]);
  const parts = [...byKind.entries()].map(([kind, dates]) => {
    const phrase = RELIABILITY_PHRASE[kind] ?? { one: "looks unreliable", many: "look unreliable" };
    return dates.length === 1
      ? `the nutrition log for ${dayPhrase(dates, "and")} ${phrase.one}`
      : `the nutrition logs for ${dayPhrase(dates, "and")} ${phrase.many}`;
  });
  const count = new Set(within.map((item) => item.date)).size;
  return ` ${upperFirst(list(parts))}, so this recap does not read intake on ${count === 1 ? "that day" : "those days"} either way.`;
}

const RELIABILITY_SPECIFICITY = ["duplicate_day_totals", "implausible_macro_profile", "partial_day"];

function mostSpecificPerDate(findings) {
  const byDate = new Map();
  for (const item of findings) {
    const current = byDate.get(item.date);
    const rank = (value) => { const index = RELIABILITY_SPECIFICITY.indexOf(value?.kind); return index < 0 ? 99 : index; };
    if (!current || rank(item) < rank(current)) byDate.set(item.date, item);
  }
  return [...byDate.values()];
}

function reliabilityWithin(findings, span) {
  return findings.filter((item) => item.date >= span.startDate && item.date <= span.endDate &&
    item.effect === "excluded_from_behavior");
}

// ---------------------------------------------------------------- units

// One wearable is one source: movement and exercise minutes read as a single
// "activity" clause, carried by whichever finding is more material.
function mergeActivity(members) {
  const activity = members.filter((item) => item.domain === "activity");
  if (activity.length <= 1) return members;
  const strongest = [...activity].sort((left, right) => (right.materiality ?? 0) - (left.materiality ?? 0))[0];
  const dates = [...new Set(activity.filter((item) => item.direction === strongest.direction)
    .flatMap((item) => item.dates ?? []))].sort();
  return [...members.filter((item) => item.domain !== "activity"),
    { ...strongest, dates, sourceIds: activity.map((item) => item.id) }];
}

// Routine gaps on exactly the same days read as one clause
// ("no training or weigh-ins Friday or Saturday").
function mergeSameDayGaps(members) {
  const merged = [];
  for (const item of members) {
    const twin = item.kind === "routine_gap" && merged.find((other) => other.kind === "routine_gap" &&
      other.dates.join() === item.dates.join());
    if (twin) {
      twin.gapLabels.push(labelOf(item));
      twin.gapDomains.push(item.domain);
      twin.sourceIds.push(item.id);
    } else if (item.kind === "routine_gap") {
      merged.push({ ...item, gapLabels: [labelOf(item)], gapDomains: [item.domain], sourceIds: [item.id] });
    } else {
      merged.push(item);
    }
  }
  return merged;
}

function toneOf(units) {
  const directions = new Set(units.map((item) => item.kind === "dispersion_change" ? "variable" : item.direction));
  if ([...directions].every((value) => value === "below" || value === "absent")) return "break";
  if ([...directions].every((value) => value === "above")) return "increase";
  if ([...directions].every((value) => value === "variable" || value === "more_variable")) return "variable";
  return "mixed";
}

function labelOf(item) { return LABELS[item.signal] ?? item.domain; }

function directionWord(item) {
  const ratio = Number(item.magnitude?.ratioToBaseline);
  if (item.direction === "below") return Number.isFinite(ratio) && ratio <= 0.6 ? "well below" : "below";
  if (item.direction === "above") return Number.isFinite(ratio) && ratio >= 1.4 ? "well above" : "above";
  return item.direction;
}

// ---------------------------------------------------------------- words

function dayPhrase(dates, joiner) {
  const unique = [...new Set(dates)].sort();
  const names = unique.map(weekday);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} ${joiner} ${names[1]}`;
  if (consecutive(unique)) return `${names[0]} through ${names.at(-1)}`;
  return `${names.slice(0, -1).join(", ")}, ${joiner} ${names.at(-1)}`;
}

function consecutive(dates) {
  return dates.every((date, index) => index === 0 ||
    Date.parse(`${date}T12:00:00Z`) - Date.parse(`${dates[index - 1]}T12:00:00Z`) === 86400000);
}

function windowDays(intelligence) {
  const { startDate, endDate } = intelligence.horizon.window;
  return (Date.parse(`${endDate}T12:00:00Z`) - Date.parse(`${startDate}T12:00:00Z`)) / 86400000 + 1;
}

function weekday(date) { return WEEKDAYS[new Date(`${date}T12:00:00.000Z`).getUTCDay()]; }
function numberWord(value) { return NUMBER_WORDS[value] ?? String(value); }
function ordinal(value) { return ORDINALS[value] ?? `${value}th`; }

function list(items) {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function upperFirst(value) {
  return value ? `${value[0].toLocaleUpperCase("en-US")}${value.slice(1)}` : value;
}

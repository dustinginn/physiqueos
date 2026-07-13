export function composeGalleryInterpretation(view = {}) {
  const comparison = view.comparison ?? null;
  const findings = selectEvidenceFindings(view);
  if (comparison) {
    const [primaryFinding, ...supportingFindings] = findings;
    return {
      summary: primaryFinding ?? "No meaningful visual differences stand out between these photos.",
      comparisonBullets: supportingFindings.slice(0, 3),
      conditionSummary: humanConditionSummary(view, comparison),
    };
  }
  return {
    summary: findings[0] ?? `This ${view.label} photo is from ${formatDate(view.captureDate)}.`,
    comparisonBullets: findings.slice(1, 4),
    conditionSummary: humanCurrentConditionSummary(view.conditions, view.captureDate),
  };
}

function selectEvidenceFindings(view) {
  if (view.analysisMode === "fallback") return [];
  const candidates = [...(view.structuredFindings ?? []), ...(view.observedChanges ?? []).map((change) => ({ change }))];
  const findings = candidates.map((item) => String(item.change ?? item.description ?? "").trim()).filter((text) => text && !isImplementationOrCoachingText(text));
  return semanticDeduplicate(findings).slice(0, 4).map(ensurePeriod);
}

export function semanticDeduplicate(findings = []) {
  const groups = new Map();
  findings.forEach((text, index) => {
    const key = semanticKey(text) ?? normalize(text);
    const candidate = { text, index, score: specificityScore(text) };
    const current = groups.get(key);
    if (!current || candidate.score > current.score) groups.set(key, candidate);
  });
  return [...groups.values()].sort((left, right) => left.index - right.index).map((item) => item.text);
}

function semanticKey(text) {
  const value = normalize(text);
  const area = /waist|midsection/.test(value) ? "waist" : /silhouette|front shape|overall front/.test(value) ? "silhouette" : /chest/.test(value) ? "chest" : /shoulder/.test(value) ? "shoulders" : null;
  if (!area) return null;
  const direction = /tight|clean|improv|clear|lean/.test(value) ? "improved" : /maintain|stable|no visible .*loss|preserv/.test(value) ? "stable" : /loss|smaller|worse|soft/.test(value) ? "declined" : "neutral";
  return `${area}:${direction}`;
}
function specificityScore(text) { const value=normalize(text);return value.split(" ").length + (/modestly|meaningfully|slightly|well maintained/.test(value)?3:0) - (/looks a little/.test(value)?2:0); }

function humanConditionSummary(view, comparison) {
  const current = describeConditions(view.conditions, `The ${formatDate(view.captureDate)} photo`);
  const previous = describeConditions(comparison.previousConditions, `The ${formatDate(comparison.previousDate)} photo`);
  const hasUnknownConditions = !hasConditionDetails(view.conditions) || !hasConditionDetails(comparison.previousConditions);
  const limitation = comparison.conditionDifferences?.length ? "That makes this comparison useful for judging overall physique changes, but less reliable for subtle differences." : hasUnknownConditions ? "Small differences in timing or lighting may affect subtle details." : "These photos were taken under similar conditions.";
  return `${current} ${previous} ${limitation}`;
}
function humanCurrentConditionSummary(conditions, captureDate) { return describeConditions(conditions, `The ${formatDate(captureDate)} photo`); }
function describeConditions(conditions={},subject) { const parts=[];if(conditions.postWorkout===true)parts.push("was taken after your workout");if(conditions.postWorkout===false)parts.push("was taken before your workout");if(conditions.fasted===true)parts.push("while fasted");if(conditions.fasted===false)parts.push("after eating");if(conditions.morning===true)parts.push("in the morning");if(conditions.morning===false)parts.push("later in the day");return parts.length?`${subject} ${join(parts)}.`:`No details about the conditions are available for the ${formatDateFromSubject(subject)} photo.`; }
function hasConditionDetails(conditions={}) { return ["postWorkout","fasted","morning"].some((key)=>typeof conditions[key] === "boolean"); }
function isImplementationOrCoachingText(text) { return /fallback mode|repository|persisted|interpreter|evidence|claim|storage|metadata|recorded|comparable set|confirmed|view can be compared|run the|next step|stay the course|change (?:the|your) plan/i.test(text); }
function normalize(value) { return value.toLowerCase().replace(/[^a-z0-9]+/g," ").trim(); }
function ensurePeriod(value) { return /[.!?]$/.test(value)?value:`${value}.`; }
function join(values) { if(values.length<2)return values[0]??"";return `${values.slice(0,-1).join(", ")} and ${values.at(-1)}`; }
function formatDateFromSubject(subject) { return subject.replace(/^The /, "").replace(/ photo$/, ""); }
function formatDate(value) { if(!value)return"the prior date";const [year,month,day]=String(value).slice(0,10).split("-").map(Number);return new Date(year,month-1,day).toLocaleDateString("en-US",{month:"short",day:"numeric"}); }

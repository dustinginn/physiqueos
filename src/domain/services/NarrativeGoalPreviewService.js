const VISIBLE_ABS_GOAL_ID = "goal_visible_abs_at_rest";

export function composeNarrativeGoalPreview({ goalId = VISIBLE_ABS_GOAL_ID, dossier = {} } = {}) {
  const progress = number(dossier.progress);
  const confidence = number(dossier.confidence);
  const journeyState = getJourneyState(progress);
  const completionCriteria = (dossier.successCriteria ?? [])
    .filter((item) => !/lean mass|training performance/i.test(item.label ?? ""))
    .map((item) => ({ label: completionLabel(item.label), status: humanStatus(item.status) }));
  const weight = dossier.evidence?.weight ?? {};
  const dexa = dossier.evidence?.dexa ?? {};
  const visual = dossier.evidence?.visual ?? {};
  const firstWeight = weight.points?.[0] ?? null;
  const latestWeight = weight.points?.at(-1) ?? null;
  const latestDexa = dexa.scans?.at(-1) ?? null;
  const remainingVisual = visual.focus?.filter(Boolean) ?? [];
  const turningPoints = [
    firstWeight && { date: firstWeight.date, label: "Journey Baseline", body: `${firstWeight.value.toFixed(1)} ${firstWeight.unit} established the starting point and made the path measurable.`, tone: "start" },
    latestDexa && { date: latestDexa.date, label: "DEXA Confirmation", body: `The scan measured ${latestDexa.bodyFat.toFixed(1)}% body fat and confirmed that the downward trend represented meaningful fat loss.`, tone: "dexa" },
    latestWeight && latestWeight.date !== firstWeight?.date && { date: latestWeight.date, label: "Evidence Convergence", body: `At ${latestWeight.value.toFixed(1)} ${latestWeight.unit}, weight, photos, and DEXA now point in the same direction. The finish line is specific.`, tone: "today" },
  ].filter(Boolean).sort((a,b)=>a.date.localeCompare(b.date));

  return {
    id: `narrative_goal_${goalId}`,
    goalId,
    hero: {
      title: "Visible Abs at Rest",
      state: journeyState,
      conclusion: remainingVisual.length ? `Most of the journey is behind you. The remaining work is concentrated in ${joinBodyList(remainingVisual,true)} and confirming the result under consistent conditions.` : "The finish line is close and the current direction remains intact.",
      confidence,
      confidenceLabel: dossier.confidenceLevel ?? "Building",
      estimate: dossier.daysRemaining && dossier.daysRemaining !== "Unknown" ? dossier.daysRemaining : null,
    },
    journeyMap: {
      progress,
      stops: [
        { state: "complete", label: "Start", detail: firstWeight ? `${formatDate(firstWeight.date)} · ${firstWeight.value.toFixed(1)} ${firstWeight.unit}` : "Starting point established" },
        { state: "complete", label: "Ground Covered", detail: latestDexa ? `${latestDexa.bodyFat.toFixed(1)}% Body Fat Confirmed` : "Durable Weight Trend" },
        { state: "current", label: "Today", detail: journeyState },
        { state: "next", label: "Next Milestone", detail: remainingVisual[0] ? `${titleCase(remainingVisual[0])} Definition` : "Visual Result Confirmation" },
        { state: "destination", label: "Goal", detail: "Visible Abs at Rest" },
      ],
    },
    groundCovered: [
      weight.summary && { title: "Durable Weight Trend", body: cleanCoachCopy(weight.summary) },
      latestDexa && { title: "Body Fat Confirmed", body: `DEXA showed the cut was changing body composition—not merely the scale.` },
      visual.strengths?.length && { title: "Visual Progress Confirmed", body: `${joinBodyList(visual.strengths.slice(0,3))}. The remaining work is now narrower and clearer.` },
    ].filter(Boolean),
    roadAhead: [
      ...completionCriteria.filter((item)=>item.status!=="Achieved").map((item)=>({ type:"physical", label:item.label, detail:"Continue revealing this outcome without forcing the pace." })),
      { type:"execution", label:"Productive Abdominal Training", detail:"Maintain training quality while the cut finishes." },
      { type:"confirmation", label:"Comparable Finish Confirmation", detail:"Use consistent photos and the next planned checkpoint before transitioning." },
    ],
    completionCriteria,
    strategy: {
      conclusion: "Continue a controlled deficit while keeping training quality and direct abdominal work productive. Recent progress does not call for a more aggressive approach.",
      pillars: (dossier.protocols ?? []).filter((item)=>/nutrition|training|activity|recovery/i.test(item.name)).slice(0,4).map((item)=>({ label:item.name, detail:cleanCoachCopy(item.reason) })),
      constraint: "Protect training quality while finishing the remaining visual work.",
    },
    turningPoints,
    confidence: {
      value: confidence,
      label: dossier.confidenceLevel ?? "Building",
      summary: "Weight, DEXA, photos, and training now tell the same story. The remaining milestone is specific and observable.",
      reasons: (dossier.confidenceReasons ?? []).slice(0,3).map(cleanCoachCopy),
      watching: "Lower-ab definition under consistent photo conditions.",
    },
    protocols: (dossier.protocols ?? []).map((item)=>({ name:item.name, purpose:cleanCoachCopy(item.reason), href:"/profile/protocols" })),
    transition: progress >= 80 ? { title:"What comes next", state:progress >= 100?"Transition Ready":"Approaching Completion", body:"Once lower-ab visibility is confirmed, the focus shifts from losing more weight to stabilizing the result. Maintenance should begin deliberately, not as an abrupt stop." } : null,
    provenance: { presentationOnly:true, persisted:false, source:"visible_abs_goal_dossier" },
  };
}

function getJourneyState(progress){if(progress>=100)return"Transition Ready";if(progress>=85)return"Final Stage";if(progress>=65)return"Nearing Completion";if(progress>=35)return"Building Momentum";return"Path Established";}
function humanStatus(status){if(/achieved|complete/i.test(status??""))return"Achieved";if(/ready/i.test(status??""))return"Ready to Confirm";if(/progress|track|monitor/i.test(status??""))return"In Progress";return"Remaining";}
function completionLabel(label){if(/upper abs/i.test(label??""))return"Consistent Upper Abs Visibility";if(/lower abs/i.test(label??""))return"Lower Abs Visibility at Rest";return titleCase(label);}
function cleanCoachCopy(value){return String(value??"").replace(/\b(evidence gap|insufficient evidence|cannot conclude|not fully resolved|unavailable data|confidence gap|additional calibration required)\b/gi,"the next checkpoint will clarify");}
function number(value){const result=Number(value);return Number.isFinite(result)?result:0;}
function joinBodyList(items,lowercaseFirst=false){const normalized=items.map((item,index)=>index===0&&!lowercaseFirst?String(item):lowerInitial(item));if(normalized.length<2)return normalized[0]??"the final visual milestone";if(normalized.length===2)return `${normalized[0]} and ${normalized[1]}`;return `${normalized.slice(0,-1).join(", ")}, and ${normalized.at(-1)}`;}
function lowerInitial(value){const text=String(value??"");return text?`${text[0].toLowerCase()}${text.slice(1)}`:text;}
function titleCase(value){return String(value).replace(/\b\w/g,(letter)=>letter.toUpperCase());}
function formatDate(value){const [year,month,day]=String(value).slice(0,10).split("-").map(Number);return new Date(year,month-1,day).toLocaleDateString("en-US",{month:"short",day:"numeric"});}

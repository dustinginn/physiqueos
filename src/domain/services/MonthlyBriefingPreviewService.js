const PREVIEW_ID = "monthly_briefing_preview_2026_07_01";
const WINDOW = { startDate: "2026-06-01", endDate: "2026-06-30", deliveryDate: "2026-07-01" };

export function composeMonthlyBriefingPreview({ weights = [], dexaScans = [], progressPhotos = [], dailyBriefings = [], goal = null } = {}) {
  const monthWeights = weights.filter((item) => within(item.measuredAt)).sort(byDate("measuredAt"));
  const monthPhotos = progressPhotos.filter((item) => within(item.capturedAt ?? item.date ?? item.observedAt));
  const currentDexa = [...dexaScans].filter((item) => dateKey(item.measuredAt ?? item.date) <= WINDOW.endDate).sort(byDate("measuredAt")).at(-1) ?? null;
  const priorDexa = [...dexaScans].filter((item) => dateKey(item.measuredAt ?? item.date) < dateKey(currentDexa?.measuredAt ?? currentDexa?.date)).sort(byDate("measuredAt")).at(-1) ?? null;
  const monthClose = dailyBriefings.filter((item) => within(item.generatedAt)).sort(byDate("generatedAt")).at(-1)?.briefing ?? null;
  const startWeight = number(monthWeights[0]?.weight?.value);
  const endWeight = number(monthWeights.at(-1)?.weight?.value);
  const weightChange = startWeight != null && endWeight != null ? round(endWeight - startWeight) : null;
  const bodyFat = number(currentDexa?.bodyFatPercentage?.value ?? currentDexa?.bodyFatPercentage);
  const priorBodyFat = number(priorDexa?.bodyFatPercentage?.value ?? priorDexa?.bodyFatPercentage);
  const bodyFatChange = bodyFat != null && priorBodyFat != null ? round(bodyFat - priorBodyFat) : null;
  const fatChange = difference(currentDexa?.fatMass, priorDexa?.fatMass);
  const leanChange = difference(currentDexa?.leanMass, priorDexa?.leanMass);
  const confidence = number(monthClose?.hero?.confidence);
  const goalProgress = number(monthClose?.goalStatus?.primary?.progress ?? monthClose?.hero?.progress);
  const photoConclusion = monthClose?.progressEvidence?.photos?.summary ?? null;
  const dexaConclusion = monthClose?.progressEvidence?.dexa?.summary ?? null;
  const frontPhotos = monthPhotos.filter(isCanonicalJuneFrontPhoto).sort(byDate("capturedAt"));
  const firstPhoto = frontPhotos[0] ?? null;
  const latestPhoto = frontPhotos.at(-1) ?? null;
  const title = deriveTitle({ weightChange, bodyFat, confidence });
  const gaps = [
    "No completed June Weekly Narrative artifacts are available, so week-to-week confidence changes cannot be consumed directly.",
    "June training, nutrition, recovery, fatigue, and hunger do not have complete structured month-long coverage.",
    "June photos have a structured month-end conclusion, but no persisted June Photo Event narratives exist for individual comparisons.",
  ];
  return {
    id: PREVIEW_ID,
    preview: true,
    version: "monthly_narrative_preview_v3",
    deliveryDate: WINDOW.deliveryDate,
    reviewWindow: { startDate: WINDOW.startDate, endDate: WINDOW.endDate, label: "June 2026" },
    hero: {
      title,
      thesis: `June moved the cut from visible momentum to evidence-backed confidence: scale weight fell ${absolute(weightChange)} lb, the June DEXA measured ${bodyFat?.toFixed(1)}% body fat, and repeated photos supported the same direction.`,
      highlights: [
        weightChange != null ? { domain: "weight", tone: "transformation", icon: "↘", label: "Transformation", value: `${absolute(weightChange)} lb down`, detail: `${startWeight.toFixed(1)} to ${endWeight.toFixed(1)} lb` } : null,
        bodyFat != null ? { domain: "composition", tone: "confirmation", icon: "◎", label: "Confirmation", value: `${bodyFat.toFixed(1)}% body fat`, detail: bodyFatChange != null ? `${absolute(bodyFatChange)} points below May 24` : "June 20 measurement" } : null,
        photoConclusion ? { domain: "visual", tone: "visual", icon: "▣", label: "Visual Breakthrough", value: "Upper abs became consistent", detail: "Stronger obliques and back definition" } : null,
        goalProgress != null ? { domain: "goal", tone: "finish", icon: "◇", label: "Finish Line", value: `${goalProgress}% complete`, detail: confidence != null ? `${confidence}% confidence at month close` : null } : null,
      ].filter(Boolean).slice(0, 4),
      milestone: goalProgress >= 90 ? { label: "Chapter Milestone", value: "The cut entered its final stage before June closed." } : null,
    },
    weightStory: { title: "How June unfolded", summary: "A steady descent, confirmed by composition evidence before the month closed at a new low.", points: monthWeights.map((item) => ({ id: item.id, date: dateKey(item.measuredAt), value: number(item.weight?.value) })), markers: [currentDexa ? { date: dateKey(currentDexa.measuredAt ?? currentDexa.date), type: "DEXA" } : null, ...[...new Set(monthPhotos.map((item) => dateKey(item.capturedAt ?? item.date)))].map((date) => ({ date, type: "Photo" }))].filter(Boolean), start: `${startWeight?.toFixed(1)} lb`, end: `${endWeight?.toFixed(1)} lb`, change: `${absolute(weightChange)} lb down` },
    whereMonthBegan: {
      title: "Where June began",
      summary: `June opened at ${startWeight?.toFixed(1)} lb with Visible Abs at Rest still ahead. The plan was moving; June needed to show whether the weight coming off was fat while the physique held together.`,
      facts: [
        { label: "Opening weight", value: `${startWeight?.toFixed(1)} lb` },
        { label: "Expected pace", value: "Steady loss, no escalation" },
        { label: "Starting question", value: "Was the loss primarily fat?" },
        { label: "Confidence need", value: "DEXA and visual confirmation" },
      ],
    },
    whatChanged: {
      title: "What changed",
      themes: [
        { title: "The trend became undeniable.", body: `Thirty June weigh-ins moved from ${startWeight?.toFixed(1)} to ${endWeight?.toFixed(1)} lb. The month ended at its lowest recorded weight rather than relying on a single isolated drop.` },
        dexaConclusion ? { title: "Composition evidence changed confidence.", body: dexaConclusion } : null,
        photoConclusion ? { title: "The visual record reinforced the result.", body: photoConclusion } : null,
      ].filter(Boolean),
    },
    definingMoments: {
      title: "Defining moments",
      moments: [
        currentDexa ? { date: "Jun 20", label: "DEXA recalibrated the cut", body: `${absolute(fatChange)} lb of measured fat came off since May 24. Measured lean tissue also changed ${signed(leanChange)} lb, making protection—not faster loss—the governing constraint.` } : null,
        monthPhotos.length ? { date: "Jun 29", label: "The visual change became unmistakable", body: "The first and latest June photos made the month visible at a glance.", media: createPhotoMedia(firstPhoto, latestPhoto, photoConclusion) } : null,
        endWeight != null ? { date: "Jun 30", label: "June closed at a new low", body: `${endWeight.toFixed(1)} lb closed the month with the scale, DEXA, and visual record pointing in the same direction.` } : null,
      ].filter(Boolean),
    },
    strategyReview: {
      title: "Strategy review",
      thesis: "The strategy worked, but the success criterion changed.",
      items: [
        { tone: "positive", label: "Strategy", value: "Working.", detail: `June took ${absolute(weightChange)} lb off while body fat moved ${absolute(bodyFatChange)} points lower.` },
        { tone: "watch", label: "Lean tissue", value: "Protect it.", detail: "July is about preserving training quality while finishing the cut." },
        { tone: "neutral", label: "Sustainability", value: "Holding steady.", detail: "Nothing this month suggests the current strategy is becoming unsustainable." },
        { tone: "decision", label: "Recommendation", value: "Finish it well.", detail: "June proved the strategy works. Keep execution steady into the next decision point." },
      ],
    },
    costOfProgress: null,
    chapterAhead: {
      title: "The chapter ahead",
      thesis: "July begins with confirmation, not escalation.",
      body: "The cut is working and the finish line is close. The governing priority is to preserve training quality and recovery while confirming that continued loss is still predominantly fat.",
      priorities: ["Hold the current strategy instead of chasing faster loss.", "Use performance, recovery, photos, and consistent preparation to interpret lean-tissue risk.", "Treat the planned July 18 DEXA as the next decision boundary."],
      success: "Success next month is not simply a lower scale number. It is reaching transition readiness with body composition, visual evidence, and performance still aligned.",
      guidance: [{ icon: "🎯", label: "Priority", value: "Maintain execution.", detail: "Keep the current plan steady." }, { icon: "📅", label: "Next decision", value: "Use the July 18 DEXA.", detail: "Let the next scan guide the transition." }, { icon: "⚠", label: "Watch", value: "Protect training quality.", detail: "Recovery and performance now matter more than faster loss." }, { icon: "🏁", label: "Success", value: "Reach transition readiness.", detail: "Finish aligned—not simply lighter." }],
    },
    evidence: {
      sources: [
        { type: "weights", count: monthWeights.length, window: "June 1–30" },
        { type: "dexa", count: currentDexa ? 1 : 0, window: "June 20 with May 24 baseline" },
        { type: "progress_photos", count: monthPhotos.length, window: "June 5–29" },
        { type: "daily_narrative_conclusion", count: monthClose ? 1 : 0, window: "June 30" },
      ],
      gaps,
    },
    provenance: { source: "founder_alpha", previewOnly: true, persisted: false, generatedFor: WINDOW.deliveryDate },
  };
}

export function createMonthlyBriefingPreviewService({ repositories }) {
  return { async preview({ userId }) {
    const [weights, dexaScans, progressPhotos, dailyBriefings, goal] = await Promise.all([
      repositories.weights.listWeightEntries(userId),
      repositories.dexaScans.listDEXAScans(userId),
      repositories.progressPhotos.listPhotos(userId),
      repositories.dailyBriefings.listDailyBriefings(userId),
      repositories.goals.getActiveGoal(userId),
    ]);
    return composeMonthlyBriefingPreview({ weights, dexaScans, progressPhotos, dailyBriefings, goal });
  }};
}

function deriveTitle({ weightChange, bodyFat, confidence }) { if (weightChange <= -8 && bodyFat <= 11 && confidence >= 85) return "June turned momentum into confidence."; if (weightChange < 0 && bodyFat != null) return "The strategy proved itself."; return "June clarified what comes next."; }
function within(value) { const date=dateKey(value);return date>=WINDOW.startDate&&date<=WINDOW.endDate; }
function dateKey(value) { return String(value??"").slice(0,10); }
function byDate(field) { return (a,b)=>dateKey(a[field]??a.date).localeCompare(dateKey(b[field]??b.date)); }
function isCanonicalJuneFrontPhoto(item = {}) { return item.view === "front" && Boolean(item.imagePath) && item.source?.type === "photo" && item.source?.name === "Founder Historical Progress Photos"; }
function createPhotoMedia(first,latest,summary){if(!first||!latest)return null;const href=(item)=>`/api/private-evidence/${item.imagePath.replace(/^private\//,"")}`;const records=[first,latest].map((item,index)=>({id:item.id,photoSessionId:"monthly-june-photos",label:`Front relaxed · ${dateKey(item.capturedAt)}`,value:dateKey(item.capturedAt),captureDate:dateKey(item.capturedAt),imageHref:href(item),previousImageHref:index?href(first):null,comparison:index?{previousDate:dateKey(first.capturedAt)}:null,galleryInterpretation:{summary:summary??"June's visual evidence supported the scale and DEXA.",comparisonBullets:[],conditionSummary:"Canonical progress-photo conditions."},sourceHistory:"Canonical progress-photo evidence."}));return{records,sets:records.map((record)=>({id:`monthly-set-${record.id}`,date:record.captureDate,views:[record.label],thumbnailHref:record.imageHref,primaryRecordId:record.id,comparedAgainst:record.previousImageHref?dateKey(first.capturedAt):"Opening June photo"}))};}
function number(value) { const result=Number(value);return Number.isFinite(result)?result:null; }
function round(value) { return Math.round(value*10)/10; }
function difference(current,prior) { const a=number(current?.value??current),b=number(prior?.value??prior);return a!=null&&b!=null?round(a-b):null; }
function absolute(value) { return Math.abs(value??0).toFixed(1); }
function signed(value) { return `${value>0?"+":""}${(value??0).toFixed(1)}`; }

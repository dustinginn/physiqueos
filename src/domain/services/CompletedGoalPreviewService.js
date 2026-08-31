import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { parsePrivateMediaReference } from "../../contracts/v1/mediaIdentifiers";

const VISIBLE_ABS_GOAL_ID = "goal_visible_abs_at_rest";
const COMPLETION_DATE = "2026-07-18";

export async function getCompletedGoalPreview() {
  const user = await FounderRepositories.users.getCurrentUser();
  const userId = user?.id;
  const [goals, dexaScans, progressPhotos, briefings, currentGoal] = await Promise.all([
    FounderRepositories.goals.listGoals(userId),
    FounderRepositories.dexaScans.listDEXAScans(userId),
    FounderRepositories.progressPhotos.listPhotos(userId),
    FounderRepositories.dailyBriefings.listDailyBriefings(userId),
    FounderRepositories.goals.getActiveGoal(userId),
  ]);

  return composeCompletedGoalPreview({ goals, dexaScans, progressPhotos, briefings, currentGoal });
}

export function composeCompletedGoalPreview({ goals = [], dexaScans = [], progressPhotos = [], briefings = [], currentGoal = null }) {
  const goal = goals.find((item) => item.id === VISIBLE_ABS_GOAL_ID);
  const scans = dexaScans.filter(hasMeasuredComposition).sort(byDate);
  const baselineScan = scans.find((scan) => dateOf(scan) === goal?.startDate) ?? scans.find((scan) => dateOf(scan) >= (goal?.startDate ?? ""));
  const finalScan = [...scans].reverse().find((scan) => dateOf(scan) <= COMPLETION_DATE);
  const goalPhotos = progressPhotos.filter((photo) => photo.relatedGoalIds?.includes(VISIBLE_ABS_GOAL_ID) && photo.view === "front" && photo.pose === "relaxed").sort(byDate);
  const beginningPhoto = goalPhotos[0] ?? null;
  const finalPhoto = resolveCompletedGoalPhoto({ briefings, goalPhotos, goalId: VISIBLE_ABS_GOAL_ID, completionDate: COMPLETION_DATE, requiredPose: "front-relaxed" });
  const nextGoal = currentGoal?.id !== VISIBLE_ABS_GOAL_ID ? currentGoal : null;

  return {
    preview: { readOnly: true, canonicalGoalId: VISIBLE_ABS_GOAL_ID, supportingGoalIds: ["goal_preserve_lean_mass", "goal_maintain_8_9_body_fat"] },
    hero: {
      title: normalizeGoalTitle(goal?.title),
      status: "Completed",
      dates: `${formatDate(goal?.startDate)} → ${formatDate(COMPLETION_DATE)}`,
      achievement: `${formatNumber(finalScan?.bodyFatPercentage, 1)}% Body Fat`,
    },
    recap: "This journey began with a clear finish line: reveal visible abdominal definition without sacrificing the muscle built before the cut. Across eight deliberate weeks, body fat moved from 13.6% to 7.7%, the waist and midsection became substantially leaner, and training continued to protect the shape underneath. The final DEXA and relaxed photos told the same story—the goal had reached its intended conclusion.",
    highlights: [
      { date: goal?.startDate, title: "The measured starting point", body: `${formatNumber(baselineScan?.bodyFatPercentage, 1)}% body fat established the journey baseline.` },
      { date: "2026-06-20", title: "Definition became measurable", body: "DEXA reached 10.7% body fat as upper-ab definition and waist separation became increasingly visible." },
      { date: COMPLETION_DATE, title: "The finish line aligned", body: "The final DEXA reached 7.7% body fat and the relaxed photo confirmed visible abdominal definition at rest." },
      { date: COMPLETION_DATE, title: "Lean mass largely preserved", body: "The journey finished with 147.5 lb of measured lean mass—within the established preservation tolerance." },
    ],
    photos: {
      beginning: beginningPhoto ? { date: beginningPhoto.date, href: privateEvidenceUrl(beginningPhoto.imagePath) } : null,
      completion: finalPhoto,
      historyHref: "/progress/photos",
    },
    finalComposition: {
      scanId: finalScan?.id,
      date: dateOf(finalScan),
      bodyFat: formatMetric(finalScan?.bodyFatPercentage, "%"),
      leanMass: formatMetric(finalScan?.leanMass?.value, "lb"),
      fatMass: formatMetric(finalScan?.fatMass?.value, "lb"),
      weight: formatMetric(finalScan?.totalMass?.value, "lb"),
      narrative: "This scan represents the successful conclusion of the cut because the numerical target and the final visual confirmation converged: fat mass fell meaningfully, abdominal definition was visible at rest, and measured lean mass remained within the journey’s preservation tolerance.",
      briefingHref: finalScan?.id ? `/briefings/dexa/${finalScan.id}` : null,
    },
    achievedBy: [
      "Body fat reduced from 13.6% to 7.7%.",
      "Lean mass largely preserved through the cut.",
      "Nutrition consistency maintained through the finish.",
      "Training performance remained strong enough to protect muscularity.",
    ],
    unlocked: nextGoal ? {
      title: nextGoal.title,
      href: nextGoal.id ? "/goals/build-lean-mass" : null,
      body: "Reaching 7.7% body fat while largely preserving lean mass created an excellent foundation for the next Build Lean Mass journey.",
    } : null,
  };
}

export function resolveCompletedGoalPhoto({ briefings = [], goalPhotos = [], goalId, completionDate, requiredPose = "front-relaxed" }) {
  const completionEvents = briefings.filter((item) => {
    const narrative = item?.briefing?.photoEventNarrative;
    return narrative?.eventDate === completionDate && narrative?.goalCompletionHandoff?.goalId === goalId;
  });
  for (const event of completionEvents) {
    const narrative = event.briefing.photoEventNarrative;
    const qualifiedId = narrative.goalCompletionHandoff?.qualifiedViewId;
    const explicitFinal = narrative.completionExperience?.journeyComparison?.final;
    if (explicitFinal?.id === qualifiedId && explicitFinal?.poseId === requiredPose && explicitFinal?.captureDate === completionDate && explicitFinal?.imageHref) {
      return { date: completionDate, href: explicitFinal.imageHref, evidenceId: explicitFinal.id };
    }
    const canonical = narrative.cardContent?.progress?.comparisons?.find((item) => item.id === qualifiedId && item.poseId === requiredPose && item.imageHref);
    if (canonical) return { date: completionDate, href: canonical.imageHref, evidenceId: canonical.id };
  }
  const exactDate = goalPhotos.find((photo) => photo.date === completionDate && poseId(photo) === requiredPose);
  if (exactDate) return { date: exactDate.date, href: privateEvidenceUrl(exactDate.imagePath), evidenceId: exactDate.id };
  const fallback = goalPhotos.filter((photo) => photo.date <= completionDate && poseId(photo) === requiredPose).sort(byDate).at(-1);
  return fallback ? { date: fallback.date, href: privateEvidenceUrl(fallback.imagePath), evidenceId: fallback.id } : null;
}

function hasMeasuredComposition(scan) { return Number.isFinite(scan?.bodyFatPercentage) && Number.isFinite(scan?.leanMass?.value); }
function dateOf(item) { return item?.measuredAt ?? item?.date ?? ""; }
function byDate(a, b) { return dateOf(a).localeCompare(dateOf(b)); }
function poseId(photo) { return photo?.poseId ?? `${photo?.view ?? ""}-${photo?.pose ?? ""}`; }
function formatNumber(value, digits) { return Number.isFinite(value) ? value.toFixed(digits) : "—"; }
function formatMetric(value, unit) { return Number.isFinite(value) ? `${value.toFixed(1)}${unit === "%" ? "" : " "}${unit}` : "—"; }
function formatDate(value) { if (!value) return "—"; const [year, month, day] = value.split("-").map(Number); return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
function normalizeGoalTitle(value) { return /visible abs/i.test(String(value ?? "")) ? "Visible Abs at Rest" : value ?? "Visible Abs at Rest"; }
function privateEvidenceUrl(value) { if (!value) return null; const mediaId=parsePrivateMediaReference(value);if(mediaId)return `/api/private-evidence/media/${mediaId}`;if(String(value).startsWith("media://"))return null;return `/api/private-evidence/${String(value).replace(/^private[\\/]/, "").replaceAll("\\", "/")}`; }

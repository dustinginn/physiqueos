import PhotoEventBriefingScreen from "../../../screens/PhotoEventBriefingScreen";

export const dynamic = "force-dynamic";

export default async function PhotoCompletionPreviewPage({ searchParams }) {
  const params = await searchParams;
  const completed = params?.completed === "1";
  const narrative = previewNarrative(params?.flexible === "1");
  return <PhotoEventBriefingScreen artifactId={narrative.eventId} completion={completed ? { completedAt: "2026-07-20", evidence: { finalPhotoSessionId: narrative.photoSessionId } } : null} narrative={narrative}/>;
}

function previewNarrative(flexible = false) {
  const first = previewView("first", "2026-05-24", "#CBD5E1");
  const final = previewView("final", "2026-07-20", "#818CF8");
  const compared = flexible ? [final, previewPose("rear","Rear Relaxed","back-relaxed","#A7F3D0",true), previewPose("rear-flexed","Rear Flexed — Double Biceps","back-flexed","#FDE68A",true)] : [final];
  const newBaselines = flexible ? [previewPose("side","Side Relaxed","side-relaxed","#FBCFE8",false), previewPose("front-flexed","Front Flexed","front-flexed","#BFDBFE",false)] : [];
  const activeViews=[...compared,...newBaselines];
  return {
    eventId: "preview_photo_completion",
    photoSessionId: "preview_final_session",
    eventDate: "2026-07-20",
    completion: flexible ? "5 confirmed views" : "3/3 complete",
    activeViews,
    supportingEvidence: { weight: "167.4 lb", dexa: "Latest DEXA: 7.7% body fat" },
    nextMilestone: null,
    completionExperience: {
      state: "confirmed",
      journeyComparison: { first, final },
      recentComparison: { previous: first, final },
      userDecision: { question: "PhysiqueOS sees the Visible Abs goal as complete. Do you agree?", completeLabel: "Complete Goal", keepOpenLabel: "Keep Goal Open" },
      nextGoalPreview: { title: "Build Lean Mass while maintaining 8–9% body fat", actionLabel: "Create Next Goal", availability: "coming_next" },
    },
    cardContent: {
      hero: { title: "You did it.", body: "The final relaxed photo confirms what the DEXA already suggested: lower abs are visible at rest, fat loss reached the intended endpoint, and lean mass was preserved through the cut." },
      snapshot: { title: "Final confirmation session", poses: activeViews.map((view)=>view.label), conditions: "Taken under qualified relaxed conditions." },
      progress: { title: "The visual journey", body: flexible ? "Three views have matching history. Two first-recorded views establish useful new baselines." : "The first qualifying Front Relaxed photo and the final confirmation frame show the complete visual chapter.", comparisons: compared, newBaselines },
      interpretation: { title: "The result", paragraphs: ["The qualified Front Relaxed view supports visible lower abs at rest.", "The Jul 18 DEXA measured 7.7% body fat.", "Lean tissue finished at 147.5 lb, −1.6 lb from the May 24 baseline and within the preservation tolerance."] },
      coachInsight: { title: "Coach’s Insight", body: "PhysiqueOS sees the Visible Abs goal as complete. Only your explicit decision closes the goal." },
    },
  };
}

function previewPose(id,label,poseId,color,matched) {
  const imageHref=`data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="${color}"/><text x="150" y="200" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#0F172A">${label}</text></svg>`)}`;
  return {id,canonicalViewId:id,label,poseId,captureDate:"2026-07-20",previousDate:matched?"2026-07-11":null,imageHref,previousImageHref:matched?imageHref:null,headline:matched?"Matching history supports direct comparison.":"This view establishes a new baseline.",supportingObservations:[],establishesBaseline:!matched,baselineNarrative:poseId==="front-flexed"?"This is your first confirmed Front Flexed photo. It cannot show change over time yet, but it adds clear goal context.":"This is your first confirmed Side Relaxed photo, so there is no same-pose comparison yet. It establishes a useful new baseline."};
}

function previewView(id, captureDate, color) {
  const imageHref = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="${color}"/><text x="150" y="200" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#0F172A">Front Relaxed</text></svg>`)}`;
  return { id, canonicalViewId: id, label: "Front Relaxed", poseId: "front-relaxed", captureDate, previousDate: "2026-05-24", imageHref, previousImageHref: imageHref, headline: "Lower abs are visibly present at rest.", supportingObservations: ["Waist and obliques show the full visual change."] };
}

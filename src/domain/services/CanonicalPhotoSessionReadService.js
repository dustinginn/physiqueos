import { getProgressPhotoCategoryId, getProgressPhotoCategoryLabel } from "../models/progressPhotoPoseVocabulary";
import { composeGalleryInterpretation } from "./GalleryInterpretationService";

const POSE_ORDER = ["front-relaxed", "back-relaxed", "back-flexed"];
const INACTIVE = new Set(["duplicate", "superseded", "inactive"]);

export function createPhotoSessionReadModels({ canonicalObjects = [], legacyPhotos = [], weights = [], analyses = [] } = {}) {
  const canonicalCandidates = canonicalObjects
    .filter((item) => item.evidence_type === "photo_session" && item.quality?.status !== "superseded")
    .map((item) => buildCanonicalSession(item, { canonicalObjects, legacyPhotos, weights, analyses }));
  const canonicalByFingerprint = new Map();
  canonicalCandidates.forEach((session) => { const key=session.sessionFingerprint;const existing=canonicalByFingerprint.get(key);if(!existing){canonicalByFingerprint.set(key,session);return;}const owner=session.activeViewCount>existing.activeViewCount?session:existing;const alias=owner===session?existing:session;canonicalByFingerprint.set(key,{...owner,hiddenProvenanceAliases:unique([...(owner.hiddenProvenanceAliases??[]),alias.id,...(alias.hiddenProvenanceAliases??[])])}); });
  const canonicalSessions = [...canonicalByFingerprint.values()];
  const ownedSourceIds = new Set(canonicalSessions.flatMap((session)=>[...(session.inactiveSourceReferences??[]),...session.views.flatMap((view)=>view.provenance?.sourceIds??[])]));
  const canonicalAssetKeys = new Set([...canonicalSessions.flatMap((session)=>session.views.map((view)=>stableAssetKey(view.imageReference,[]))),...legacyPhotos.filter((photo)=>ownedSourceIds.has(photo.id)).map((photo)=>stableAssetKey(photo.imagePath,[]))]);
  const legacySessions = buildLegacySessions(legacyPhotos.filter((photo) => !canonicalAssetKeys.has(stableAssetKey(photo.imagePath,[]))), weights, analyses);
  return finalizeComparisons([...canonicalSessions, ...legacySessions].sort((left, right) => right.captureDate.localeCompare(left.captureDate)));
}

function buildCanonicalSession(object, context) {
  const payload = object.payload ?? {};
  const activePhotos = uniqueActivePhotos(payload.photos ?? [], context.legacyPhotos).sort(comparePoses);
  const captureDate = resolveVisibleEvidenceDate({ payload, object, activePhotos, legacyPhotos: context.legacyPhotos });
  const inactivePhotos = (payload.photos ?? []).filter((photo) => INACTIVE.has(photo.status) || photo.active === false);
  const explicitSynthesis = context.analyses.find((item) => item.evidenceIds?.includes(object.canonicalId) && item.metadata?.photoSessionSynthesis);
  const activeSourceIds = new Set(activePhotos.flatMap((photo) => [photo.canonicalPhotoId, String(photo.canonicalPhotoId??"").replace(/^canonical_/,""), ...(photo.sourceIds ?? [])].filter(Boolean)));
  const embeddedObservations = (payload.synthesis ?? []).filter((observation) => {
    const sources = observation.sourceEvidenceIds ?? [];
    return sources.length === 0 || sources.some((sourceId) => activeSourceIds.has(sourceId));
  });
  const synthesis = explicitSynthesis ? {
    id: explicitSynthesis.id,
    source: "persisted_analysis",
    summary: explicitSynthesis.summary ?? null,
    observations: explicitSynthesis.metadata?.photoSessionSynthesis?.observations ?? explicitSynthesis.metadata?.structuredObservations ?? [],
  } : embeddedObservations.length ? {
    id: payload.synthesisOutputReference ?? `photo_synthesis_${object.canonicalId}`,
    source: "embedded_photo_session",
    summary: null,
    observations: embeddedObservations,
  } : null;
  const views = activePhotos.map((photo) => buildCanonicalView(photo, { ...context, captureDate, sessionConditions: payload.sessionConditions ?? payload.conditions ?? {}, synthesis }));
  const linkedWeight = findWeight(context.weights, captureDate);
  const sourceRefs = unique([...(object.provenance?.source_artifact_refs ?? []), ...activePhotos.flatMap((photo) => photo.sourceIds ?? [])]);
  return {
    id: object.canonicalId,
    photoSessionId: object.canonicalId,
    captureDate,
    date: formatDate(captureDate),
    sourceMode: "canonical",
    dateDerivationSource: payload.captureDate ? "canonical_capture_date" : captureDate !== dateKey(payload.observed_at ?? object.lastObservedAt) ? "matched_source_capture_date" : "canonical_observed_date",
    sessionFingerprint: createSessionFingerprint(activePhotos.map((photo)=>resolveCanonicalAsset(photo,context.legacyPhotos))),
    hiddenProvenanceAliases: [],
    activeViewCount: views.length,
    views,
    activePoseIds: views.map((view) => view.poseId),
    thumbnailHref: views.find((view) => view.imageHref)?.imageHref ?? null,
    thumbnailHydrationDiagnostic: views.find((view) => view.imageHref)?.hydrationDiagnostic ?? views[0]?.hydrationDiagnostic ?? null,
    primaryRecordId: views.find((view) => view.imageHref)?.id ?? views[0]?.id ?? null,
    currentWeight: linkedWeight?.weight?.value ?? null,
    weight: linkedWeight ? `${linkedWeight.weight.value.toFixed(1)} ${linkedWeight.weight.unit}` : "No same-day weight",
    comparedAgainst: nearestComparisonDate(views),
    sessionConditions: normalizeConditions(payload.sessionConditions ?? payload.conditions),
    completionStatus: payload.completionState ?? (views.length === 3 ? "complete" : "incomplete"),
    completionLabel: `${views.filter((view) => POSE_ORDER.includes(view.poseId)).length}/3 complete`,
    synthesisStatus: payload.synthesisStatus ?? (synthesis ? "complete" : "pending"),
    synthesisSummaryReference: synthesis?.id ?? payload.synthesisOutputReference ?? null,
    synthesis,
    provenanceSourceCount: unique([...sourceRefs, ...inactivePhotos.flatMap((photo) => photo.sourceIds ?? [])]).length,
    duplicateRetryCount: inactivePhotos.length,
    inactiveSourceReferences: unique([...(payload.duplicateRetrySourceReferences ?? []), ...inactivePhotos.flatMap((photo) => photo.sourceIds ?? [])]),
  };
}

function buildCanonicalView(photo, context) {
  const poseId = getProgressPhotoCategoryId(photo);
  const prior = resolvePriorPhoto(photo, poseId, context);
  const analysisResolution = resolveViewAnalysis(photo, context.analyses);
  const analysis = analysisResolution.analysis;
  const conditions = normalizeConditions(photo.conditions ?? context.sessionConditions);
  const asset = resolveCanonicalAsset(photo, context.legacyPhotos);
  return {
    id: photo.canonicalPhotoId ?? photo.id,
    canonicalViewId: photo.canonicalPhotoId ?? photo.id,
    canonicalPhotoId: photo.canonicalPhotoId ?? photo.id,
    pose: { id: poseId, label: getProgressPhotoCategoryLabel(photo), view: photo.view, pose: photo.pose },
    poseId,
    label: getProgressPhotoCategoryLabel(photo),
    captureDate: context.captureDate,
    value: formatDate(context.captureDate),
    dateKey: context.captureDate,
    imageReference: asset?.path ?? null,
    imageHref: asset?.url ?? null,
    imageUrl: asset?.url ?? null,
    previousImageHref: prior?.imageHref ?? null,
    previousHydrationDiagnostic: prior?.hydrationDiagnostic ?? null,
    previousLabel: prior?.label ?? null,
    comparedAgainst: prior?.captureDate ? formatDate(prior.captureDate) : "Prior matching photo pending",
    priorComparisonId: prior?.id ?? photo.priorComparisonReference ?? null,
    comparison: prior ? { canonicalViewId: prior.id, captureDate: prior.captureDate, imageReference: prior.imageReference, imageUrl: prior.imageHref, label: prior.label } : null,
    conditions,
    conditionDifferences: compareConditions(conditions, prior?.conditions),
    perViewConditions: photo.conditions ? conditions : null,
    tags: conditionTags(conditions),
    observedChanges: (analysis?.metadata?.structuredObservations ?? []).map((item) => item.change ?? item.description).filter(Boolean),
    currentPhotoNarrative: analysis?.metadata?.photoInterpretation?.user_facing_summary ?? analysis?.summary ?? null,
    structuredFindings: (analysis?.metadata?.structuredObservations ?? []).filter((item)=>isPoseRelevantFinding(item,poseId)),
    goalRelevance: analysis?.metadata?.photoInterpretation?.goal_relevance ?? [],
    interpretationConfidence: analysis?.metadata?.photoInterpretation?.confidence_notes ?? [],
    interpretationLimitations: analysis?.metadata?.photoInterpretation?.limitations ?? [],
    analysisLookupPath: analysisResolution.path,
    analysisMode: analysis?.source?.type ?? null,
    strengths: analysis?.metadata?.photoInterpretation?.biggest_improvements ?? [],
    remainingFocus: analysis?.metadata?.photoInterpretation?.remaining_focus ?? [],
    confidenceContribution: analysis?.metadata?.photoInterpretation?.confidence_notes?.join(" ") ?? null,
    timelinePlacement: analysis?.summary ?? context.synthesis?.summary ?? null,
    synthesisMetadata: { synthesisId: context.synthesis?.id ?? null, synthesisStatus: context.synthesis ? "complete" : "pending" },
    provenance: { sourceIds: photo.sourceIds ?? [], sourceHashes: photo.sourceHashes ?? [], resolvedSourceId: asset?.sourceId ?? null },
    hydrationDiagnostic: asset ? null : { stage: "canonical_hydration", canonicalViewId: photo.canonicalPhotoId ?? photo.id, unresolvedSourceIds: photo.sourceIds ?? [], repository: "ProgressPhotoRepository", reason: "No stored image path matched the canonical source identity." },
    sourceMode: "canonical",
  };
}

function resolvePriorPhoto(photo, poseId, { canonicalObjects, legacyPhotos, captureDate }) {
  const explicit = photo.priorComparisonReference;
  const canonicalCandidates = canonicalObjects.filter((item) => item.evidence_type === "progress_photo" && item.quality?.status === "active" && dateKey(item.lastObservedAt) < captureDate && getProgressPhotoCategoryId(item.payload) === poseId);
  const explicitObject = canonicalCandidates.find((item) => item.canonicalId === explicit || item.payload?.sourceIds?.includes(explicit));
  const canonical = explicitObject ?? canonicalCandidates.sort((left, right) => String(right.lastObservedAt).localeCompare(String(left.lastObservedAt)))[0];
  if (canonical) { const asset=resolveCanonicalAsset(canonical.payload,legacyPhotos); return { id: canonical.canonicalId, captureDate: dateKey(canonical.lastObservedAt), imageReference: asset?.path ?? null, imageHref: asset?.url ?? null, label: getProgressPhotoCategoryLabel(canonical.payload), conditions: normalizeConditions(canonical.payload?.conditions), hydrationDiagnostic: asset?null:{ stage:"comparison_hydration", canonicalViewId:canonical.canonicalId, unresolvedSourceIds:canonical.payload?.sourceIds??[], repository:"ProgressPhotoRepository", reason:"No stored comparison image matched the canonical source identity." } }; }
  const legacy = legacyPhotos.filter((item) => dateKey(item.date ?? item.capturedAt) < captureDate && getProgressPhotoCategoryId(item) === poseId).sort((left, right) => dateKey(right.date ?? right.capturedAt).localeCompare(dateKey(left.date ?? left.capturedAt)))[0];
  return legacy ? { id: legacy.id, captureDate: dateKey(legacy.date ?? legacy.capturedAt), imageReference: legacy.imagePath, imageHref: privateHref(legacy.imagePath), label: getProgressPhotoCategoryLabel(legacy), conditions: normalizeConditions(legacy.conditions) } : null;
}

function buildLegacySessions(photos, weights, analyses) {
  const byDate = new Map();
  photos.forEach((photo) => {
    const captureDate = dateKey(photo.date ?? photo.capturedAt);
    if (!captureDate) return;
    if (!byDate.has(captureDate)) byDate.set(captureDate, new Map());
    byDate.get(captureDate).set(getProgressPhotoCategoryId(photo), photo);
  });
  return [...byDate.entries()].map(([captureDate, byPose]) => {
    const views = [...byPose.values()].sort(comparePoses).map((photo) => { const poseId=getProgressPhotoCategoryId(photo);const resolution=resolveViewAnalysis({sourceIds:[photo.id],sourceHashes:[photo.sourceHash??photo.source_hash].filter(Boolean)},analyses);const analysis=resolution.analysis;return { id: `legacy-view-${photo.id}`, canonicalViewId: `legacy-view-${photo.id}`, canonicalPhotoId: null, sourceId: photo.id, pose: { id: poseId, label: getProgressPhotoCategoryLabel(photo), view: photo.view, pose: photo.pose }, poseId, label: getProgressPhotoCategoryLabel(photo), captureDate, date: captureDate, value: formatDate(captureDate), dateKey: captureDate, imageReference: photo.imagePath, imageUrl: privateHref(photo.imagePath), imageHref: privateHref(photo.imagePath), previousImageHref: null, comparedAgainst: "Prior matching photo pending", conditions: normalizeConditions(photo.conditions), tags: conditionTags(normalizeConditions(photo.conditions)), currentPhotoNarrative:analysis?.metadata?.photoInterpretation?.user_facing_summary??analysis?.summary??null,structuredFindings:(analysis?.metadata?.structuredObservations??[]).filter((item)=>isPoseRelevantFinding(item,poseId)),goalRelevance:analysis?.metadata?.photoInterpretation?.goal_relevance??[],interpretationConfidence:analysis?.metadata?.photoInterpretation?.confidence_notes??[],interpretationLimitations:analysis?.metadata?.photoInterpretation?.limitations??[],analysisLookupPath:resolution.path,analysisMode:analysis?.source?.type??null, synthesisMetadata: { synthesisId: null, synthesisStatus: "legacy" }, provenance: { sourceIds: [photo.id], sourceHashes: [] }, hydrationDiagnostic: photo.imagePath ? null : { stage: "legacy_adapter_hydration", canonicalViewId: `legacy-view-${photo.id}`, unresolvedSourceIds: [photo.id], repository: "ProgressPhotoRepository", reason: "Legacy image path is unavailable." }, sourceMode: "legacy-adapted" }; });
    const weight = findWeight(weights, captureDate);
    const sessionFingerprint=createSessionFingerprint(views.map((view)=>({path:view.imageReference})));
    return { id: `legacy-photo-session-${sessionFingerprint}`, photoSessionId: null, captureDate, date: formatDate(captureDate), dateDerivationSource:"legacy_evidence_date",sessionFingerprint,hiddenProvenanceAliases:[], sourceMode: "legacy-adapted", activeViewCount: views.length, views, activePoseIds: views.map((view) => view.poseId), thumbnailHref: views[0]?.imageHref ?? null, primaryRecordId: views[0]?.id ?? null, currentWeight: weight?.weight?.value ?? null, weight: weight ? `${weight.weight.value.toFixed(1)} ${weight.weight.unit}` : "No same-day weight", comparedAgainst: "Prior matching photo pending", sessionConditions: {}, completionStatus: views.length === 3 ? "complete" : "incomplete", completionLabel: `${views.filter((view) => POSE_ORDER.includes(view.poseId)).length}/3 complete`, synthesisStatus: "legacy", synthesisSummaryReference: null, provenanceSourceCount: views.length, duplicateRetryCount: 0, inactiveSourceReferences: [] };
  });
}

function finalizeComparisons(sessions) {
  return sessions.map((session) => {
    const views = session.views.map((view) => { const compared=attachBestComparison(view, session, sessions);return{...compared,galleryInterpretation:composeGalleryInterpretation(compared),sourceHistory:sourceHistory(compared)}; });
    return { ...session, views, comparedAgainst: sessionComparisonLabel(views), comparisonAvailability: summarizeComparisonAvailability(views) };
  });
}
function sourceHistory(view) { return view.comparison ? `This comparison uses your ${view.label} photos from ${formatDate(view.comparison.previousDate)} and ${formatDate(view.captureDate)}.` : `This is your ${view.label} photo from ${formatDate(view.captureDate)}.`; }

function resolveViewAnalysis(photo, analyses) {
  const sourceIds=new Set(photo.sourceIds??[]);const hashes=new Set(photo.sourceHashes??[]);
  const canonical=analyses.find((item)=>item.evidenceIds?.includes(photo.canonicalPhotoId));if(canonical)return{analysis:canonical,path:"canonical_analysis_id"};
  const source=analyses.find((item)=>(item.evidenceIds??[]).some((id)=>sourceIds.has(id)));if(source)return{analysis:source,path:"source_id"};
  const asset=analyses.find((item)=>{const text=JSON.stringify(item.metadata??{});return [...hashes].some((hash)=>text.includes(hash));});if(asset)return{analysis:asset,path:"image_hash"};
  return{analysis:null,path:null};
}

function isPoseRelevantFinding(item,poseId) { const region=String(item.region??"").toLowerCase();if(poseId==="front-relaxed")return !/lower back|back detail|lat width|v-taper/.test(region);if(poseId.startsWith("back-"))return !/upper abdomen|lower abdomen|upper abs|oblique/.test(region);return true; }

function attachBestComparison(view, session, sessions) {
  const priorViews = sessions
    .filter((candidateSession) => candidateSession.captureDate < session.captureDate && candidateSession.id !== session.id)
    .flatMap((candidateSession) => candidateSession.views.map((candidateView) => ({ ...candidateView, sessionId: candidateSession.id, sourceMode: candidateSession.sourceMode })))
    .filter((candidate) => candidate.poseId === view.poseId)
    .sort((left, right) => right.captureDate.localeCompare(left.captureDate));
  const hydrated = priorViews.filter((candidate) => candidate.imageHref);
  const comparable = hydrated.filter((candidate) => getConditionComparison(view.conditions, candidate.conditions).comparable);
  const previous = comparable[0] ?? hydrated[0] ?? null;
  if (!previous) {
    const status = priorViews.length > 0 ? "prior_image_unavailable" : session.sourceMode === "canonical" || priorViews.length === 0 ? "no_prior_matching_pose" : "insufficient_canonical_data";
    return { ...view, sessionId: session.id, date: session.captureDate, comparisonStatus: status, comparison: null, previousImageHref: null, previousHydrationDiagnostic: priorViews[0]?.hydrationDiagnostic ?? null, comparedAgainst: status === "prior_image_unavailable" ? "Prior image unavailable" : "No prior matching pose", comparisonNarrative: noComparisonNarrative(view.label, status) };
  }
  const condition = getConditionComparison(view.conditions, previous.conditions);
  const status = condition.differences.length > 0 ? "comparable_with_condition_differences" : "comparable";
  const narrative = buildComparisonNarrative({ view, previous, condition });
  const comparison = {
    previousSessionId: previous.sessionId,
    previousCanonicalViewId: previous.canonicalViewId ?? previous.id,
    previousDate: previous.captureDate,
    previousPose: previous.pose,
    previousImageReference: previous.imageReference,
    previousImageUrl: previous.imageUrl ?? previous.imageHref,
    previousImageHref: previous.imageHref,
    previousConditions: previous.conditions,
    conditionDifferences: condition.differences,
    conditionComparability: condition.comparable ? "broadly_comparable" : "different",
    conditionSummary: condition.summary,
    comparisonConfidence: condition.differences.length === 0 ? "high" : condition.comparable ? "moderate" : "limited",
    comparisonNarrative: narrative.text,
    narrativeSource: narrative.source,
    sourceMode: previous.sourceMode,
    hydrationDiagnostic: previous.hydrationDiagnostic ?? null,
  };
  return { ...view, sessionId: session.id, date: session.captureDate, comparisonStatus: status, comparison, previousImageHref: comparison.previousImageHref, previousLabel: previous.label, previousHydrationDiagnostic: comparison.hydrationDiagnostic, comparedAgainst: formatDate(previous.captureDate), priorComparisonId: comparison.previousCanonicalViewId, conditionDifferences: condition.differences, conditionSummary: condition.summary, comparisonNarrative: narrative.text, comparisonNarrativeSource: narrative.source };
}

function getConditionComparison(current = {}, previous = {}) {
  const labels = [];
  if (current.postWorkout !== previous.postWorkout && current.postWorkout !== undefined && previous.postWorkout !== undefined) labels.push(current.postWorkout ? "the current photo was taken after training" : "the previous photo was taken after training");
  if (current.fasted !== previous.fasted && current.fasted !== undefined && previous.fasted !== undefined) labels.push(current.fasted ? "the current photo was fasted" : "the current photo was not fasted");
  if (current.morning !== previous.morning && current.morning !== undefined && previous.morning !== undefined) labels.push(current.morning ? "the current photo was taken in the morning" : "the previous photo was taken in the morning");
  if (knownDifferent(current.pump, previous.pump)) labels.push("pump status differed");
  if (knownDifferent(current.lighting, previous.lighting)) labels.push("lighting differed");
  if (knownDifferent(current.location, previous.location)) labels.push("location differed");
  const materialDifferenceCount = labels.filter((label) => !/lighting|location/.test(label)).length;
  return { comparable: materialDifferenceCount <= 2, differences: labels, summary: labels.length ? `Conditions differ: ${joinNatural(labels)}.` : "Conditions were broadly similar." };
}

function buildComparisonNarrative({ view, previous, condition }) {
  const findings = (view.observedChanges ?? []).filter(Boolean).slice(0, 2);
  if (findings.length > 0) return { source: "persisted_pose_analysis", text: `Compared with ${formatDate(previous.captureDate)}, ${joinNatural(findings.map(sentenceFragment))}. ${confidenceSentence(condition)}` };
  return { source: "neutral_condition_fallback", text: `${formatDate(previous.captureDate)} is the nearest ${view.label} comparison. ${condition.differences.length ? `${condition.summary} Use this comparison for broad visual context rather than small physique changes.` : "The images were captured under broadly similar conditions, but no stored visual finding is available for this pair. The side-by-side photos are shown for manual review without claiming a physique change."}` };
}

function confidenceSentence(condition) { return condition.differences.length ? `Confidence is ${condition.comparable ? "moderate" : "limited"} because ${joinNatural(condition.differences)}.` : "Confidence is higher because the recorded conditions were broadly similar."; }
function noComparisonNarrative(label, status) { return status === "prior_image_unavailable" ? `A prior ${label} record exists, but its stored image is unavailable. No comparison is shown.` : `No earlier ${label} photo is available. This photo is shown without a comparison.`; }
function summarizeComparisonAvailability(views) { const count=views.filter((view)=>view.comparison).length;return `${count}/${views.length} poses have prior comparisons`; }
function sessionComparisonLabel(views) { const dates=unique(views.map((view)=>view.comparison?.previousDate).filter(Boolean));if(dates.length===1)return formatDate(dates[0]);if(dates.length>1)return"Comparisons available";return"No prior matching view"; }
function knownDifferent(left,right) { return left!==undefined&&right!==undefined&&left!==null&&right!==null&&left!=="unknown"&&right!=="unknown"&&left!==right; }
function sentenceFragment(value) { const text=String(value).trim().replace(/[.!]+$/g,"");return text.charAt(0).toLowerCase()+text.slice(1); }
function joinNatural(values) { if(values.length<2)return values[0]??"";if(values.length===2)return `${values[0]} and ${values[1]}`;return `${values.slice(0,-1).join(", ")}, and ${values.at(-1)}`; }

function uniqueActivePhotos(photos, legacyPhotos=[]) {
  const byPose = new Map();
  photos.filter((photo) => photo.active !== false && !INACTIVE.has(photo.status)).forEach((photo) => { const direct=photo.storage_path??photo.imagePath;const matched=legacyPhotos.find((item)=>direct&&item.imagePath===direct)||legacyPhotos.find((item)=>(photo.sourceIds??[]).includes(item.id));const hydrated=getProgressPhotoCategoryId(photo)==="unknown"&&matched?{...photo,view:matched.view,pose:matched.pose}:photo;const pose = getProgressPhotoCategoryId(hydrated); if (pose !== "unknown" && !byPose.has(pose)) byPose.set(pose, hydrated); });
  return [...byPose.values()];
}
function comparePoses(left, right) { return POSE_ORDER.indexOf(getProgressPhotoCategoryId(left)) - POSE_ORDER.indexOf(getProgressPhotoCategoryId(right)); }
function normalizeConditions(conditions = {}) { return Object.fromEntries(Object.entries(conditions ?? {}).map(([key, value]) => [key, value && typeof value === "object" && "value" in value ? value.value : value])); }
function conditionTags(conditions) { const tags=[]; if(conditions.postWorkout===true)tags.push("Post-workout");if(conditions.morning===false)tags.push("Not morning");if(conditions.fasted===false)tags.push("Not fasted");if(conditions.pump==="unknown"||conditions.pump==null)tags.push("Pump unknown");if(typeof conditions.lighting==="string"&&conditions.lighting!=="unknown")tags.push(`Lighting ${conditions.lighting.replaceAll("_"," ")}`);if(typeof conditions.location==="string"&&conditions.location!=="unknown")tags.push(`Location ${conditions.location.replaceAll("_"," ")}`);return tags; }
function compareConditions(current, prior) { if(!prior)return[];return Object.keys(current).filter((key)=>current[key]!==undefined&&prior[key]!==undefined&&current[key]!==prior[key]).map((key)=>`${key.replaceAll(/([A-Z])/g," $1").toLowerCase()}: current ${formatCondition(current[key])}; previous ${formatCondition(prior[key])}`); }
function formatCondition(value) { if(value===true)return"yes";if(value===false)return"no";return String(value??"unknown").replaceAll("_"," "); }
function nearestComparisonDate(views) { return views.map((view) => view.comparedAgainst).find((value) => value && value !== "Prior matching photo pending") ?? "Prior matching photo pending"; }
function findWeight(weights, date) { return weights.find((item) => dateKey(item.measuredAt) === date) ?? null; }
function resolveCanonicalAsset(photo, legacyPhotos) { const direct=photo.storage_path??photo.imagePath??photo.sourcePath; if(direct)return{path:direct,url:privateHref(direct),sourceId:photo.sourceIds?.[0]??null};const sourceIds=new Set(photo.sourceIds??[]);const hashes=new Set(photo.sourceHashes??[]);const source=legacyPhotos.find((item)=>sourceIds.has(item.id)||hashes.has(item.sourceHash)||hashes.has(item.source_hash));return source?.imagePath?{path:source.imagePath,url:privateHref(source.imagePath),sourceId:source.id}:null; }
function resolveVisibleEvidenceDate({payload,object,activePhotos,legacyPhotos}) { if(payload.captureDate)return dateKey(payload.captureDate);const paths=new Set(activePhotos.map((photo)=>resolveCanonicalAsset(photo,legacyPhotos)?.path).filter(Boolean));const matchedDates=legacyPhotos.filter((photo)=>paths.has(photo.imagePath)).map((photo)=>dateKey(photo.capturedAt??photo.date)).filter(Boolean);if(matchedDates.length)return mostCommon(matchedDates);return dateKey(payload.observed_at??object.lastObservedAt); }
function createSessionFingerprint(assets) { const keys=assets.map((asset)=>stableAssetKey(asset?.path,asset?.hashes)).filter(Boolean).sort();return `photo-assets-${hashText(keys.join("|"))}`; }
function stableAssetKey(pathValue,hashes=[]) { const hash=(hashes??[]).find(Boolean);if(hash)return `hash:${hash}`;return pathValue?`path:${String(pathValue).toLowerCase().replaceAll("\\","/")}`:null; }
function hashText(value) { let hash=2166136261;for(const char of String(value)){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(36); }
function mostCommon(values) { const counts=new Map();values.forEach((value)=>counts.set(value,(counts.get(value)??0)+1));return [...counts.entries()].sort((left,right)=>right[1]-left[1]||left[0].localeCompare(right[0]))[0]?.[0]??null; }
function privateHref(value) { if (!value) return null; return `/api/private-evidence/${String(value).replace(/^private[\\/]/i, "").replaceAll("\\", "/")}`; }
function dateKey(value) { return String(value ?? "").slice(0, 10); }
function formatDate(value) { if (!value) return "Pending"; const [year, month, day] = dateKey(value).split("-").map(Number); return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }

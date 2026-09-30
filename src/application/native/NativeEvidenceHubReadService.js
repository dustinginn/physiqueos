import { createProviderEnergyEvidenceReport } from "../../domain/services/EnergyEvidenceService.js";
import {
  projectNativeNutritionRead,
  projectNativeTrainingLandingRead,
  projectNativeWeightRead,
} from "./NativeReadProjectionService.js";

const STREAMS = Object.freeze([
  Object.freeze({ id: "training", title: "Training", tone: "primary", href: "/progress/training" }),
  Object.freeze({ id: "nutrition", title: "Nutrition", tone: "primary", href: "/progress/nutrition" }),
  Object.freeze({ id: "weight", title: "Weight", tone: "evidence", href: "/progress/weight" }),
  Object.freeze({ id: "photos", title: "Progress Photos", tone: "primary", href: "/progress/photos" }),
  Object.freeze({ id: "dexa", title: "DEXA", tone: "success", href: "/progress/dexa" }),
  Object.freeze({ id: "activity", title: "Activity", tone: "primary", href: "/progress/activity" }),
  Object.freeze({ id: "energy", title: "Energy", tone: "primary", href: "/progress/energy" }),
]);

export async function readNativeEvidenceHub({ readers, context = "all", currentDate, onTelemetry = null } = {}) {
  const reads = [
    () => readers.training.getLanding({ context, currentDate }).then(projectNativeTrainingLandingRead),
    () => readers.progress.getNutrition({ context, currentDate }).then(projectNativeNutritionRead),
    () => readers.progress.getWeight({ context, currentDate }).then((value) => projectNativeWeightRead({ ...value, limit: 1 })),
    () => readers.photos.getNativePhotosTimeline({ context, currentDate, limit: 1 }),
    () => readers.progress.getDEXA({ context, currentDate }),
    () => readers.progress.getActivity({ context, currentDate }),
    () => readers.progress.getEnergy({ context, currentDate }).then((value) => createProviderEnergyEvidenceReport({
      ...value,
      contextId: value.timeline.contextId,
      currentDate,
      timeline: value.timeline,
    })),
  ];
  const settled = await Promise.allSettled(reads.map((read) => read()));
  const streams = settled.map((result, index) => {
    const definition = STREAMS[index];
    if (result.status === "rejected") return unavailable(definition, "read_failed");
    try {
      return project(definition, result.value);
    } catch {
      return unavailable(definition, "contract_invalid");
    }
  });
  onTelemetry?.(Object.freeze({
    event: "native.evidence_hub.composed",
    states: Object.freeze(Object.fromEntries(streams.map(({ id, state }) => [id, state]))),
  }));
  return Object.freeze({
    schemaVersion: "native_evidence_hub_v1",
    title: "Evidence Hub",
    subtitle: "PhysiqueOS organizes what it knows about your body, progress, and routines.",
    streams: Object.freeze(streams),
  });
}

function project(definition, value) {
  requireObject(value);
  switch (definition.id) {
    case "training": {
      const latest = value.report?.latestTrainingDay ?? null;
      return latest
        ? available(definition, latest.daySummary ?? latest.summary ?? "Training recorded", latest.daySummary ?? latest.summary ?? "Training recorded", latest.date)
        : empty(definition, "No training recorded");
    }
    case "nutrition": {
      const latest = value.report?.nutritionDays?.[0] ?? null;
      return latest ? available(definition, latest.value, latest.detail, latest.date) : empty(definition, "No nutrition recorded");
    }
    case "weight": {
      const latest = value.history?.[0] ?? value.current ?? null;
      return latest ? available(definition, latest.value, latest.detail ?? latest.value, latest.date) : empty(definition, "No weight recorded");
    }
    case "photos": {
      const latest = value.sessions?.[0] ?? null;
      const date = latest?.intendedCaptureDate ?? latest?.date ?? null;
      const count = latest?.photos?.length ?? latest?.views?.length ?? 0;
      return latest ? available(definition, `${count} views`, `Last session ${date}`, date) : empty(definition, "No sessions recorded");
    }
    case "dexa": {
      const latest = value.report?.latestScan ?? null;
      const metric = value.report?.summary?.find?.((item) => item.label === "Body Fat")?.value;
      return latest ? available(definition, metric ?? "Scan recorded", `Last scan ${latest.date}`, latest.date) : empty(definition, "No scan recorded");
    }
    case "activity": {
      const latest = value.report?.latestActivityDay ?? null;
      return latest ? available(definition, latest.value, latest.detail, latest.date) : empty(definition, "No activity recorded");
    }
    case "energy": {
      const latest = value.days?.[0] ?? null;
      const summary = value.summary;
      if (!summary || typeof summary.completeDays !== "number" || typeof summary.evidenceDays !== "number") throw new Error("Invalid Energy summary.");
      return latest
        ? available(definition, latest.completeness, `${summary.completeDays} of ${summary.evidenceDays} evidence days complete`, latest.date)
        : empty(definition, "No energy evidence recorded", `0 of ${summary.evidenceDays} evidence days complete`);
    }
    default: throw new Error("Unknown Evidence Hub stream.");
  }
}

function available(definition, metric, trend, lastUpdated) {
  if (metric == null || trend == null) throw new Error("Evidence Hub summary is malformed.");
  return Object.freeze({ ...definition, state: "available", status: "available", metric: String(metric), trend: String(trend), lastUpdated: lastUpdated ?? null });
}

function empty(definition, message, trend = message) {
  return Object.freeze({ ...definition, state: "empty", status: "placeholder", metric: message, trend, lastUpdated: null });
}

function unavailable(definition, failureClass) {
  return Object.freeze({
    ...definition,
    state: "unavailable",
    status: "placeholder",
    metric: "Temporarily unavailable",
    trend: "Other evidence remains available",
    lastUpdated: null,
    failureClass,
  });
}

function requireObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Evidence Hub source is malformed.");
}

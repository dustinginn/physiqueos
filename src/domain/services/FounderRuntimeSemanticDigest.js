import { createHash } from "node:crypto";

export function createFounderRuntimeSemanticDigest(value) {
  return createHash("sha256")
    .update(stableSerialize(value))
    .digest("hex")
    .toUpperCase();
}

const PROGRESS_PHOTOS_EXECUTION_ID = "execution_progress_photos";
const PROGRESS_PHOTOS_REMINDER_ID = "reminder_weekly_progress_photo_set";
const DEXA_APPOINTMENT_ID = "execution_next_dexa";

export function createCoachingUpdatesSemanticDigest(value) {
  const briefingProtocols = (value?.protocols ?? []).filter((item) =>
    (item.protocolType ?? item.category) === "briefings" && item.status === "active"
  );
  const briefingProtocolIds = new Set(briefingProtocols.map((item) => item.id));
  const currentBriefingVersionIds = new Set(briefingProtocols.map((item) => item.currentVersionId).filter(Boolean));
  const progressPhotoProtocols = (value?.protocols ?? []).filter((item) =>
    item.id === "protocol_progress_photos" ||
    ["progress_photos", "photos"].includes(item.protocolType ?? item.category)
  );
  const progressPhotoProtocolIds = new Set(progressPhotoProtocols.map((item) => item.id));
  const progressPhotoVersionIds = new Set(progressPhotoProtocols.map((item) => item.currentVersionId).filter(Boolean));
  return createFounderRuntimeSemanticDigest({
    // Only the canonical records rendered and submitted by the composite
    // Coaching editor participate in its optimistic-concurrency fence.
    // Evidence Reviews, canonical evidence, unrelated priorities, goals,
    // protocols, executions, and reminders are intentionally absent.
    briefingProtocols,
    briefingVersions: (value?.protocolVersions ?? []).filter((item) =>
      briefingProtocolIds.has(item.protocolId) && currentBriefingVersionIds.has(item.id)
    ),
    progressPhotoProtocols,
    progressPhotoVersions: (value?.protocolVersions ?? []).filter((item) =>
      progressPhotoProtocolIds.has(item.protocolId) && progressPhotoVersionIds.has(item.id)
    ),
    progressPhotoExecution: (value?.executionItems ?? []).find((item) =>
      item.id === PROGRESS_PHOTOS_EXECUTION_ID
    ) ?? null,
    progressPhotoReminder: (value?.reminders ?? []).find((item) =>
      item.id === PROGRESS_PHOTOS_REMINDER_ID
    ) ?? null,
    dexaAppointment: (value?.executionItems ?? []).find((item) =>
      item.id === DEXA_APPOINTMENT_ID
    ) ?? null,
  });
}

export function createProgressPhotosScheduleSemanticDigest(value) {
  const protocols = (value?.protocols ?? []).filter((item) =>
    item.id === "protocol_progress_photos" ||
    ["progress_photos", "photos"].includes(item.protocolType ?? item.category)
  );
  const protocolIds = new Set(protocols.map((item) => item.id));
  const currentVersionIds = new Set(protocols.map((item) => item.currentVersionId).filter(Boolean));
  return createFounderRuntimeSemanticDigest({
    protocols,
    protocolVersions: (value?.protocolVersions ?? []).filter((item) =>
      protocolIds.has(item.protocolId) && currentVersionIds.has(item.id)
    ),
    execution: (value?.executionItems ?? []).find((item) =>
      item.id === PROGRESS_PHOTOS_EXECUTION_ID
    ) ?? null,
    reminder: (value?.reminders ?? []).find((item) =>
      item.id === PROGRESS_PHOTOS_REMINDER_ID
    ) ?? null,
  });
}

export function createFounderRuntimeFileHash(raw) {
  return createHash("sha256").update(raw).digest("hex").toUpperCase();
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

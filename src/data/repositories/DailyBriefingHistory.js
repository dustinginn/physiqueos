export function getBriefingOccurrenceIdentity(artifact = {}) {
  if (!artifact || typeof artifact !== "object") return null;
  const userId = clean(artifact.userId);
  const type = clean(artifact.artifactType);
  const cadence = clean(artifact.cadence ?? artifact.evidenceWindow?.cadence);
  const id = clean(artifact.id);
  const windowId = clean(artifact.evidenceWindow?.id);

  if (type === "event" || cadence === "event") {
    return userId && id ? `${userId}|event|${id}` : null;
  }
  if (type === "scheduled" && ["daily", "weekly", "monthly"].includes(cadence)) {
    if (userId && windowId) return `${userId}|scheduled|${cadence}|${windowId}`;
    if (cadence === "daily" && userId) {
      const date = clean(artifact.generatedAt ?? artifact.createdAt).slice(0, 10);
      return date ? `${userId}|scheduled|daily|legacy-date:${date}` : null;
    }
    return userId && id ? `${userId}|scheduled|${cadence}|legacy-id:${id}` : null;
  }
  return userId && id && type && cadence
    ? `${userId}|${type}|${cadence}|stable-id:${id}`
    : null;
}

export function classifyBriefingCadence(artifact = {}) {
  if (!artifact || typeof artifact !== "object" || artifact.preview === true || artifact.lifecycle?.preview === true) return "unknown";
  const cadence = clean(artifact.cadence ?? artifact.evidenceWindow?.cadence).toLowerCase();
  const type = clean(artifact.artifactType).toLowerCase();
  const windowId = clean(artifact.evidenceWindow?.id).toLowerCase();
  const id = clean(artifact.id).toLowerCase();
  if (type === "event" || cadence === "event" || artifact.trigger?.evidenceType && !["scheduled", "daily", "weekly", "monthly"].includes(type)) return "event";
  if (["daily", "weekly", "monthly"].includes(cadence)) return cadence;
  if (windowId.startsWith("daily:")) return "daily";
  if (windowId.startsWith("weekly:")) return "weekly";
  if (windowId.startsWith("monthly:")) return "monthly";
  if (type && type !== "scheduled") return "unknown";
  if (/^daily_briefing_/.test(id)) return "daily";
  if (/^weekly_briefing_/.test(id)) return "weekly";
  if (/^monthly_briefing_/.test(id)) return "monthly";
  if (/^event_briefing_/.test(id)) return "event";
  return "unknown";
}

export function sanitizeHistoricalBriefingArtifact(artifact) {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) return null;
  const { replacedBriefingHistory: _history, previousEntry: _previous, artifact: _artifact, ...sanitized } = artifact;
  return { ...sanitized };
}

export function flattenBriefingHistory(root, { replacedByArtifactId = root?.id ?? null } = {}) {
  const output = [];
  const exact = new Set();

  function visitEntry(entry, inherited = {}) {
    if (!entry || typeof entry !== "object") return;
    const artifact = entry.artifact ?? entry.briefing ?? entry.previousEntry ?? null;
    if (!artifact || typeof artifact !== "object") return;
    for (const nested of artifact.replacedBriefingHistory ?? []) visitEntry(nested, entry);
    const sanitized = sanitizeHistoricalBriefingArtifact(artifact);
    if (!sanitized) return;
    const key = `${clean(sanitized.id)}|${stableSerialize(sanitized)}`;
    if (exact.has(key)) return;
    exact.add(key);
    output.push({
      artifact: sanitized,
      replacedAt: entry.replacedAt ?? inherited.replacedAt ?? sanitized.updatedAt ?? sanitized.generatedAt ?? null,
      reason: entry.reason ?? inherited.reason ?? "Briefing artifact replaced.",
      replacedByArtifactId: entry.replacedByArtifactId ?? replacedByArtifactId,
    });
  }

  for (const entry of root?.replacedBriefingHistory ?? []) visitEntry(entry);
  return output;
}

export function createBriefingHistoryEntry(artifact, { replacedAt, reason, replacedByArtifactId } = {}) {
  const sanitized = sanitizeHistoricalBriefingArtifact(artifact);
  if (!sanitized) throw new Error("Cannot archive an invalid briefing artifact.");
  return { artifact: sanitized, replacedAt: replacedAt ?? sanitized.updatedAt ?? sanitized.generatedAt ?? null, reason: reason ?? "Briefing artifact replaced.", replacedByArtifactId: replacedByArtifactId ?? null };
}

export function normalizeDailyBriefingRecords(records = []) {
  const normalized = [];
  const exactRoots = new Set();
  for (const record of Array.isArray(records) ? records : []) {
    if (!record || typeof record !== "object") continue;
    const next = { ...record, replacedBriefingHistory: flattenBriefingHistory(record) };
    if (next.replacedBriefingHistory.length === 0) delete next.replacedBriefingHistory;
    const key = `${getBriefingOccurrenceIdentity(next) ?? "unidentified"}|${stableSerialize(next)}`;
    if (exactRoots.has(key)) continue;
    exactRoots.add(key);
    normalized.push(next);
  }
  return normalized;
}

export function assertFlatBriefingHistory(records = []) {
  for (const root of records) for (const entry of root?.replacedBriefingHistory ?? []) {
    if (!entry?.artifact || entry.briefing || entry.previousEntry) throw new Error("Briefing history entry is not canonical.");
    if (entry.artifact.replacedBriefingHistory || entry.artifact.previousEntry) throw new Error("Nested briefing history is not allowed.");
  }
  return true;
}

export function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function clean(value) { return String(value ?? "").trim(); }

const TIME_OF_DAY_VALUES = Object.freeze(["morning", "afternoon", "evening"]);

export function extractOriginalImageCaptureMetadata(buffer, { mimeType = "" } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return unavailable("image_metadata_unavailable");
  try {
    const tiff = findExifTiffBuffer(buffer, mimeType);
    if (!tiff) return unavailable("exif_unavailable");
    const fields = readExifFields(tiff);
    const rawTimestamp = fields.dateTimeOriginal ?? fields.dateTimeDigitized ?? fields.dateTime;
    const parsed = parseExifTimestamp(rawTimestamp, fields.offsetTimeOriginal);
    if (!parsed) return unavailable("exif_capture_timestamp_invalid");
    return {
      status: "reliable",
      capturedAt: parsed.capturedAt,
      localDateTime: parsed.localDateTime,
      offset: parsed.offset,
      timeOfDay: classifyPhotoTimeOfDay(parsed.hour),
      source: fields.dateTimeOriginal ? "exif_datetime_original" : "exif_capture_datetime",
      limitations: parsed.offset ? [] : ["capture_timezone_unavailable"],
    };
  } catch {
    return unavailable("exif_unreadable");
  }
}

export function inferPhotoSessionCaptureMetadata(artifacts = [], { evidenceDate = null } = {}) {
  const reliable = artifacts
    .map((artifact) => artifact.originalCaptureMetadata)
    .filter((item) => item?.status === "reliable");
  if (!reliable.length) {
    return {
      status: "needs_review",
      capturedAt: null,
      timeOfDay: null,
      source: "session_review",
      limitations: ["original_capture_metadata_unavailable"],
    };
  }
  const localValues = reliable.map((item) => item.localDateTime).sort();
  const dates = [...new Set(localValues.map((value) => value.slice(0, 10)))];
  const times = reliable.map((item) => item.timeOfDay);
  const conflictingDate = evidenceDate && dates.some((date) => date !== evidenceDate);
  const conflictingBand = new Set(times).size > 1;
  if (dates.length !== 1 || conflictingDate || conflictingBand) {
    return {
      status: "needs_review",
      capturedAt: null,
      timeOfDay: null,
      source: "session_review",
      limitations: [
        dates.length !== 1 ? "capture_dates_conflict" : null,
        conflictingDate ? "capture_date_contradicts_review_date" : null,
        conflictingBand ? "capture_times_conflict" : null,
      ].filter(Boolean),
    };
  }
  const representative = reliable.sort((left, right) =>
    left.localDateTime.localeCompare(right.localDateTime)
  )[0];
  return {
    status: "inferred",
    capturedAt: representative.capturedAt,
    localDateTime: representative.localDateTime,
    timeOfDay: representative.timeOfDay,
    source: representative.source,
    reviewed: false,
    limitations: unique(reliable.flatMap((item) => item.limitations ?? [])),
  };
}

export function resolvePhotoSessionGoalRelationship({
  evidenceDate,
  executionItems = [],
  goals = [],
} = {}) {
  const goalById = new Map(goals.filter((goal) => goal?.id).map((goal) => [goal.id, goal]));
  const scheduledGoalIds = unique(executionItems
    .filter((item) => isProgressPhotoOccurrence(item, evidenceDate))
    .flatMap((item) => item.linkedGoalIds ?? []))
    .filter((id) => goalById.has(id));
  if (scheduledGoalIds.length === 1) {
    return resolvedGoalRelationship(scheduledGoalIds[0], goalById, "scheduled_progress_photo_occurrence");
  }
  if (scheduledGoalIds.length > 1) {
    return reviewableGoalRelationship(goals, "scheduled_occurrence_has_multiple_goals");
  }
  const applicable = goals.filter((goal) => goalAppliesOnDate(goal, evidenceDate));
  const primary = applicable.filter((goal) => goal.primary === true);
  const candidates = primary.length === 1 ? primary : applicable;
  if (candidates.length === 1) {
    return resolvedGoalRelationship(candidates[0].id, goalById, "active_goal_on_evidence_date");
  }
  return reviewableGoalRelationship(goals, candidates.length ? "multiple_applicable_goals" : "goal_context_unavailable");
}

export function normalizeReviewedPhotoSessionMetadata({
  goalId = null,
  goalOptions = [],
  timeOfDay = null,
} = {}) {
  const normalizedTime = String(timeOfDay ?? "").toLowerCase();
  if (!TIME_OF_DAY_VALUES.includes(normalizedTime)) {
    throw new Error("Choose Morning, Afternoon, or Evening for this photo session.");
  }
  const normalizedGoalId = String(goalId ?? "").trim();
  const selectedGoal = goalOptions.find((goal) => goal.id === normalizedGoalId);
  if (goalOptions.length && !selectedGoal) throw new Error("Choose a valid Goal relationship for this photo session.");
  return {
    captureMetadata: {
      status: "reviewed",
      capturedAt: null,
      timeOfDay: normalizedTime,
      source: "user_session_review",
      reviewed: true,
      limitations: ["exact_capture_time_unavailable"],
    },
    goalRelationship: normalizedGoalId
      ? {
          status: "resolved",
          goalIds: [normalizedGoalId],
          goalLabel: selectedGoal?.title ?? null,
          source: "user_session_review",
          reviewed: true,
          options: goalOptions,
          limitations: [],
        }
      : {
          status: "unrelated",
          goalIds: [],
          goalLabel: null,
          source: "user_session_review",
          reviewed: true,
          options: [],
          limitations: ["no_goal_relationship_selected"],
        },
  };
}

export function classifyPhotoTimeOfDay(hour) {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function findExifTiffBuffer(buffer, mimeType) {
  const mime = String(mimeType).toLowerCase();
  if (mime.includes("jpeg") || (buffer[0] === 0xff && buffer[1] === 0xd8)) {
    let offset = 2;
    while (offset + 4 <= buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      if (marker === 0xd9 || marker === 0xda) break;
      const length = buffer.readUInt16BE(offset + 2);
      if (length < 2 || offset + 2 + length > buffer.length) break;
      if (marker === 0xe1 && buffer.subarray(offset + 4, offset + 10).toString("ascii") === "Exif\u0000\u0000") {
        return buffer.subarray(offset + 10, offset + 2 + length);
      }
      offset += 2 + length;
    }
  }
  if (mime.includes("png") || buffer.subarray(1, 4).toString("ascii") === "PNG") {
    let offset = 8;
    while (offset + 12 <= buffer.length) {
      const length = buffer.readUInt32BE(offset);
      const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
      if (type === "eXIf") return buffer.subarray(offset + 8, offset + 8 + length);
      offset += 12 + length;
    }
  }
  if (mime.includes("webp") || buffer.subarray(0, 4).toString("ascii") === "RIFF") {
    let offset = 12;
    while (offset + 8 <= buffer.length) {
      const type = buffer.subarray(offset, offset + 4).toString("ascii");
      const length = buffer.readUInt32LE(offset + 4);
      if (type === "EXIF") {
        const data = buffer.subarray(offset + 8, offset + 8 + length);
        return data.subarray(0, 6).toString("ascii") === "Exif\u0000\u0000" ? data.subarray(6) : data;
      }
      offset += 8 + length + (length % 2);
    }
  }
  return null;
}

function readExifFields(tiff) {
  const little = tiff.subarray(0, 2).toString("ascii") === "II";
  if (!little && tiff.subarray(0, 2).toString("ascii") !== "MM") throw new Error("Invalid TIFF byte order.");
  const u16 = (offset) => little ? tiff.readUInt16LE(offset) : tiff.readUInt16BE(offset);
  const u32 = (offset) => little ? tiff.readUInt32LE(offset) : tiff.readUInt32BE(offset);
  if (u16(2) !== 42) throw new Error("Invalid TIFF header.");
  const readAscii = (entryOffset) => {
    const count = u32(entryOffset + 4);
    const dataOffset = count <= 4 ? entryOffset + 8 : u32(entryOffset + 8);
    if (dataOffset < 0 || dataOffset + count > tiff.length) return null;
    return tiff.subarray(dataOffset, dataOffset + count).toString("ascii").replace(/\u0000+$/g, "").trim() || null;
  };
  const readIfd = (offset) => {
    if (!Number.isInteger(offset) || offset < 0 || offset + 2 > tiff.length) return new Map();
    const count = u16(offset);
    const entries = new Map();
    for (let index = 0; index < count; index += 1) {
      const entryOffset = offset + 2 + index * 12;
      if (entryOffset + 12 > tiff.length) break;
      entries.set(u16(entryOffset), { entryOffset, type: u16(entryOffset + 2), value: u32(entryOffset + 8) });
    }
    return entries;
  };
  const root = readIfd(u32(4));
  const exifOffset = root.get(0x8769)?.value;
  const exif = readIfd(exifOffset);
  const ascii = (entries, tag) => {
    const entry = entries.get(tag);
    return entry?.type === 2 ? readAscii(entry.entryOffset) : null;
  };
  return {
    dateTime: ascii(root, 0x0132),
    dateTimeOriginal: ascii(exif, 0x9003),
    dateTimeDigitized: ascii(exif, 0x9004),
    offsetTimeOriginal: ascii(exif, 0x9011),
  };
}

function parseExifTimestamp(value, offset) {
  const match = String(value ?? "").match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const [numericYear, numericMonth, numericDay, numericHour, numericMinute, numericSecond] =
    [year, month, day, hour, minute, second].map(Number);
  const calendarCheck = new Date(Date.UTC(
    numericYear,
    numericMonth - 1,
    numericDay,
    numericHour,
    numericMinute,
    numericSecond
  ));
  if (
    calendarCheck.getUTCFullYear() !== numericYear ||
    calendarCheck.getUTCMonth() !== numericMonth - 1 ||
    calendarCheck.getUTCDate() !== numericDay ||
    calendarCheck.getUTCHours() !== numericHour ||
    calendarCheck.getUTCMinutes() !== numericMinute ||
    calendarCheck.getUTCSeconds() !== numericSecond
  ) return null;
  const localDateTime = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  const normalizedOffset = /^[+-]\d{2}:\d{2}$/.test(String(offset ?? "")) ? String(offset) : null;
  const capturedAt = `${localDateTime}${normalizedOffset ?? ""}`;
  if (normalizedOffset && Number.isNaN(new Date(capturedAt).getTime())) return null;
  return { capturedAt, localDateTime, offset: normalizedOffset, hour: numericHour };
}

function isProgressPhotoOccurrence(item, evidenceDate) {
  if (item?.active === false || item?.status === "cancelled") return false;
  const photoEvidence = (item?.linkedEvidenceTypes ?? []).some((type) => /progress_photo|photo_session/.test(type));
  if (!photoEvidence && !/progress photos?/i.test(String(item?.title ?? ""))) return false;
  const date = String(evidenceDate ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  if (item.preferredSchedule?.date) return item.preferredSchedule.date === date;
  const weekdays = item.preferredSchedule?.daysOfWeek ?? [];
  if (!weekdays.length) return item.cadence?.type === "weekly";
  const weekday = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }).toLowerCase();
  return weekdays.map((value) => String(value).toLowerCase()).includes(weekday);
}

function goalAppliesOnDate(goal, evidenceDate) {
  const date = String(evidenceDate ?? "").slice(0, 10);
  const start = String(goal.timeline?.startDate ?? goal.startDate ?? goal.startedAt ?? "").slice(0, 10);
  const end = String(goal.completedAt ?? goal.timeline?.endDate ?? goal.endDate ?? "").slice(0, 10);
  if (start && date < start) return false;
  if (end && date > end) return false;
  return ["active", "completed"].includes(goal.status) || (!goal.status && Boolean(goal.id));
}

function resolvedGoalRelationship(goalId, goalById, source) {
  const goal = goalById.get(goalId);
  return {
    status: "resolved",
    goalIds: [goalId],
    goalLabel: goal?.title ?? null,
    source,
    reviewed: false,
    options: [...goalById.values()].map(goalOption),
    limitations: [],
  };
}

function reviewableGoalRelationship(goals, reason) {
  return {
    status: "needs_review",
    goalIds: [],
    goalLabel: null,
    source: "session_review",
    reviewed: false,
    options: goals.filter((goal) => goal?.id).map(goalOption),
    limitations: [reason],
  };
}

function goalOption(goal) {
  return { id: goal.id, title: goal.title ?? "Goal" };
}

function unavailable(reason) {
  return { status: "unavailable", capturedAt: null, localDateTime: null, offset: null, timeOfDay: null, source: null, limitations: [reason] };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

import { describe, expect, it } from "vitest";
import { normalizeProtocolRecurrence, createProtocolRecurrenceIdentity } from "./ProtocolRecurrenceNormalizationService";
import { getProtocolOccurrenceOnOrAfter, isProtocolDateOnCycle } from "./ProtocolOccurrenceResolver";
import {
  createProgressPhotosExecutionHydrationModel,
  prepareProgressPhotosScheduleSuccessor,
  applyPreparedProgressPhotosScheduleSuccessor,
} from "./ProgressPhotosExecutionScheduleService";
import { createProgressPhotosScheduleSemanticDigest } from "./FounderRuntimeSemanticDigest";
import { getFounderStoreRevision } from "../../data/repositories/FounderStoreUnitOfWork.js";

const LA = "America/Los_Angeles";
const WD = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const weekly = (interval, anchorDate = "2026-07-25", weekday = "saturday") => normalizeProtocolRecurrence({
  frequency: "weekly", interval, weekdays: [weekday], timeOfDay: "afternoon", timezone: LA, anchorDate,
});
const monthly = (interval, weekOfMonth, anchorDate, weekday = "saturday") => normalizeProtocolRecurrence({
  frequency: "monthly", interval, weekOfMonth, weekdays: [weekday], timeOfDay: "afternoon", timezone: LA, anchorDate,
});
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const diff = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
function store(recurrence, effectiveAt = "2026-07-25") {
  return {
    revision: 5,
    protocols: [{ id: "photos", status: "active", protocolType: "photos", currentVersionId: "photos-v1", currentGoalIds: ["g"] }],
    protocolVersions: [{ id: "photos-v1", protocolId: "photos", versionNumber: 1, status: "active", effectiveAt, endedAt: null, recurrence, goalLinks: [{ goalId: "g", relationship: "supports" }], intent: { summary: "x" } }],
    executionItems: [{ id: "execution_progress_photos", cadence: { type: "weekly", interval: recurrence.interval }, preferredSchedule: { daysOfWeek: recurrence.weekdays, timeOfDay: "afternoon" } }],
    reminders: [{ id: "reminder_weekly_progress_photo_set", active: true, schedule: { type: "weekly", interval: recurrence.interval, daysOfWeek: recurrence.weekdays, timezone: LA, anchorDate: recurrence.anchorDate } }],
  };
}
const cmd = (s, recurrence, effectiveDate) => ({
  protocolId: "photos", expectedCurrentVersionId: s.protocols[0].currentVersionId,
  expectedRevision: getFounderStoreRevision(s), expectedSemanticDigest: createProgressPhotosScheduleSemanticDigest(s),
  effectiveDate, recurrence, author: { type: "user", id: "u", displayName: "F" },
});
const at = (date) => new Date(`${date}T19:00:00Z`);
function lastOnOrBefore(r, d) { for (let i = 0; i < 800; i += 1) { const c = addDays(d, -i); if (c < r.anchorDate) return null; if (isProtocolDateOnCycle(r, c)) return c; } return null; }

describe("re-review", () => {
  it("exhaustive change properties via prepare", () => {
    const prevs = [];
    for (const wd of ["saturday", "sunday"]) {
      for (const n of [1, 2, 3, 5, 12]) prevs.push(weekly(n, "2026-07-25", wd === "saturday" ? "saturday" : "sunday"));
      for (const w of ["first", "third", "last"]) for (const n of [1, 2, 12]) prevs.push(monthly(n, w, w === "last" ? "2026-07-25" : "2026-08-01", wd));
    }
    // fix sunday weekly anchors to be sundays
    const prevsFixed = prevs.map((r) => r.weekdays[0] === "sunday" && r.frequency === "weekly" ? weekly(r.interval, "2026-07-26", "sunday") : r)
      .map((r) => r.weekdays[0] === "sunday" && r.frequency === "monthly" ? monthly(r.interval, r.weekOfMonth, r.weekOfMonth === "last" ? "2026-07-26" : "2026-08-02", "sunday") : r);
    const nexts = [];
    for (const wd of ["saturday", "sunday", "wednesday"]) {
      for (const n of [1, 2, 3, 4, 12]) nexts.push({ frequency: "weekly", interval: n, weekdays: [wd] });
      for (const w of ["first", "second", "fourth", "last"]) for (const n of [1, 3, 12]) nexts.push({ frequency: "monthly", interval: n, weekOfMonth: w, weekdays: [wd] });
    }
    const problems = [];
    for (let day = 0; day < 400; day += 5) {
      const today = addDays("2026-09-01", day);
      for (const prev of prevsFixed) {
        for (const n of nexts) {
          const s = store(prev, "2026-07-01");
          const req = { ...prev, ...n };
          if (n.frequency === "weekly") delete req.weekOfMonth;
          const r = prepareProgressPhotosScheduleSuccessor(s, cmd(s, req, today), at(today));
          const tag = `${today} ${prev.frequency}${prev.interval}${prev.weekOfMonth ?? ""}${prev.weekdays[0]} -> ${n.frequency}${n.interval}${n.weekOfMonth ?? ""}${n.weekdays[0]}`;
          if (!r.ok) { problems.push(`${tag} REJECTED ${r.reason}`); continue; }
          if (r.outcome === "unchanged") continue;
          const first = r.nextOccurrence.scheduledLocalDate;
          if (first !== r.recurrence.anchorDate) problems.push(`${tag} anchor ${r.recurrence.anchorDate} != first ${first}`);
          const prevDueToday = isProtocolDateOnCycle(prev, today);
          if (first === today && !prevDueToday) problems.push(`${tag} newly due today`);
          if (first < today) problems.push(`${tag} first in past`);
          // weekly same weekday: gap from previous last occurrence must be <= new interval*7 (no skipped week)
          if (n.frequency === "weekly" && n.weekdays[0] === prev.weekdays[0]) {
            const last = lastOnOrBefore(prev, today);
            if (last && first !== today && diff(last, first) > n.interval * 7) problems.push(`${tag} gap ${diff(last, first)} from last ${last}`);
          }
          // monthly: first within ~62 days
          if (n.frequency === "monthly" && diff(today, first) > 62) problems.push(`${tag} monthly first far ${first}`);
          // hydration after apply works at several later dates
          applyPreparedProgressPhotosScheduleSuccessor(s, r);
          for (const later of [today, addDays(today, 30), addDays(today, 200)]) {
            const h = createProgressPhotosExecutionHydrationModel(s, null, { now: at(later) });
            if (!h.item.preferredSchedule.nextDueAt) problems.push(`${tag} hydration null next at ${later}`);
          }
        }
      }
    }
    expect(problems.slice(0, 20)).toEqual([]);
  });

  it("founder untouched schedule", () => {
    const s = store(weekly(2));
    const before = JSON.stringify(s);
    const out = {};
    for (const d of ["2026-10-01", "2026-10-03", "2026-10-04", "2026-11-01"]) {
      const h = createProgressPhotosExecutionHydrationModel(s, null, { now: at(d) });
      out[d] = [h.item.preferredSchedule.nextDueAt, h.item.preferredSchedule.lastDueAt, h.item.cadence.type, h.item.intervalTwoNextDueAt, h.item.schedulePreviews.weekly.next, h.item.schedulePreviews.weekly_interval_2.next, h.item.recurrenceIdentity === createProtocolRecurrenceIdentity(weekly(2))];
    }
    expect(JSON.stringify(s)).toBe(before);
    expect(out).toEqual({});
  });

  it("web exec preview equals save result", () => {
    const out = [];
    for (const prev of [weekly(1), weekly(2), weekly(3, "2026-07-25")]) {
      for (let i = 0; i < 28; i += 1) {
        const today = addDays("2026-10-01", i);
        const s = store(prev);
        const h = createProgressPhotosExecutionHydrationModel(s, null, { now: at(today) });
        for (const interval of [1, 2]) {
          const r = prepareProgressPhotosScheduleSuccessor(s, cmd(s, { ...prev, interval, anchorDate: h.item.preferredSchedule.anchorDate }, today), at(today));
          const actual = r.outcome === "unchanged" ? h.item.preferredSchedule.nextDueAt : r.nextOccurrence?.scheduledLocalDate;
          const previewText = interval === 2 ? h.item.schedulePreviews.weekly_interval_2.next : h.item.schedulePreviews.weekly.next;
          const previewDate = interval === 2 ? h.item.intervalTwoNextDueAt : null;
          if (previewDate && previewDate !== actual) out.push(`${today} w${prev.interval}->w${interval} preview ${previewDate} actual ${actual}`);
          const d = new Date(`${actual}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", day: "numeric" });
          if (!previewText?.includes(d)) out.push(`${today} w${prev.interval}->w${interval} text "${previewText}" actual ${actual}`);
        }
      }
    }
    expect(out.slice(0, 10)).toEqual([]);
  });

  it("same-day change and revert", () => {
    const s = store(weekly(2));
    const today = "2026-10-04";
    let r = prepareProgressPhotosScheduleSuccessor(s, cmd(s, weekly(1), today), at(today));
    applyPreparedProgressPhotosScheduleSuccessor(s, r);
    const afterFirst = r.nextOccurrence.scheduledLocalDate;
    r = prepareProgressPhotosScheduleSuccessor(s, cmd(s, { ...s.protocolVersions.at(-1).recurrence, interval: 2 }, today), at(today));
    expect({ afterFirst, revertOutcome: r.outcome, amend: Boolean(r.amendment), anchor: r.recurrence.anchorDate, next: r.nextOccurrence?.scheduledLocalDate, originalNext: "2026-10-17" }).toEqual({});
  });
});

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 3660;
const MAX_PAGE = 100;
const MINUTES_PER_DAY = 1_440;
const NIGHT_CLOCK_ANCHOR_MINUTE = 18 * 60;
// Algorithms whose stage, awake and continuity values are trustworthy.
// sleep-canon-v1 is not (duplicate copies could double count).
const STAGE_CAPABLE_ALGORITHMS = new Set(["sleep-canon-v2", "sleep-canon-v3"]);

export function createHealthKitSleepEvidenceReadService({ store, now = () => new Date() } = {}) {
  if (typeof store?.listDays !== "function") throw new Error("Sleep Evidence requires an owner-scoped day store.");
  return Object.freeze({
    async landing({ ownerUserId, throughDate }) {
      const end = date(throughDate ?? now().toISOString().slice(0, 10));
      const start = shift(end, -29);
      const rows = newest(await store.listDays({ ownerUserId, startDate: start, endDate: end })).map(projectNight);
      const nights = rows.slice(0, 14);
      const seven = rows.filter((night) => night.status === "asleep_recorded").slice(0, 7);
      return Object.freeze({
        schemaVersion: "recovery-sleep-evidence-v1",
        lastNight: nights.find((night) => night.status === "asleep_recorded") ?? nights[0] ?? null,
        nights: Object.freeze(nights),
        sevenNightAverage: average(seven.map((night) => night.mainSleep?.asleepSeconds)),
        window: consistency(nights),
        sources: sourceSummary(rows),
        strategicUse: "quarantined",
      });
    },
    async trends({ ownerUserId, startDate, endDate, limit = 30, cursor = null }) {
      const start = date(startDate); const end = date(endDate);
      const span = daysBetween(start, end) + 1;
      if (span < 1 || span > MAX_RANGE_DAYS) throw new RangeError(`Sleep trend range must be 1-${MAX_RANGE_DAYS} days.`);
      const pageSize = integer(limit, 1, MAX_PAGE);
      let rows = newest(await store.listDays({ ownerUserId, startDate: start, endDate: end }));
      if (cursor) rows = rows.filter((row) => row.sleepDay < date(cursor));
      const projected = rows.slice(0, pageSize).map(projectNight);
      return Object.freeze({
        schemaVersion: "recovery-sleep-trends-v1", range: Object.freeze({ startDate: start, endDate: end }),
        granularity: span >= 183 ? "week" : "night",
        series: Object.freeze(span >= 183 ? weekly(rows) : projected),
        nights: Object.freeze(projected),
        page: Object.freeze({ limit: pageSize, count: projected.length, nextCursor: rows.length > pageSize ? projected.at(-1)?.sleepDay ?? null : null }),
        strategicUse: "quarantined",
      });
    },
    async night({ ownerUserId, sleepDay }) {
      const day = date(sleepDay);
      const rows = await store.listDays({ ownerUserId, startDate: day, endDate: day });
      const row = prefer(rows);
      return row ? Object.freeze({ schemaVersion: "recovery-sleep-night-v1", ...projectNight(row), strategicUse: "quarantined" }) : null;
    },
  });
}

export function projectNight(row) {
  const main = row?.episodes?.[row.mainEpisodeIndex] ?? row?.episodes?.find((episode) => episode.kind === "main") ?? null;
  const timeline = main?.timeline ?? [];
  return Object.freeze({
    sleepDay: row.sleepDay, status: row.status, mainSleep: row.mainSleep,
    sleepWindow: main ? Object.freeze({ start: main.start, end: main.end, timeZone: main.timeZone }) : null,
    timeline: Object.freeze(timeline.map((segment) => Object.freeze({ stage: segment.stage, start: segment.start, end: segment.end }))),
    stageStatus: STAGE_CAPABLE_ALGORITHMS.has(row.algorithmVersion) && main?.completeness?.stageDetail === "staged" ? "available" : "unavailable",
    stages: STAGE_CAPABLE_ALGORITHMS.has(row.algorithmVersion) ? stageValues(row.mainSleep) : null,
    continuity: STAGE_CAPABLE_ALGORITHMS.has(row.algorithmVersion) ? continuity(timeline, row.mainSleep) : null,
    timeInBedSeconds: row.mainSleep?.inBedSeconds ?? null,
    secondarySleep: Object.freeze((row.episodes ?? []).filter((episode) => episode.kind === "secondary").map(projectSecondary)),
    totalAsleepIncludingSecondarySeconds: row.totalAsleepIncludingSecondarySeconds ?? null,
    source: main?.primarySource ? family(main.primarySource.sourceFamily) : null,
    corroboratingSources: Object.freeze([...(main?.corroboratingSources ?? [])].map((source) => family(source.sourceFamily)).filter(Boolean)),
    completeness: main?.completeness ?? null,
    timeZoneBasis: main?.timeZoneSource ?? null,
    timeZoneUncertain: main?.timeZoneSource === "device_at_ingest" && historical(row),
    algorithmVersion: row.algorithmVersion,
    provenance: Object.freeze({ origin: row.origin ?? row.ingestionPurpose, ingestionPurpose: row.ingestionPurpose, computedAt: row.computedAt ?? null }),
    strategicEligible: false,
  });
}

function historical(row) { return row?.ingestionPurpose === "historical_evidence_import"; }
function stageValues(main) { return main ? Object.freeze({ deepSeconds: main.deepSeconds, coreSeconds: main.coreSeconds, remSeconds: main.remSeconds, awakeSeconds: main.awakeSeconds, unspecifiedSeconds: main.unspecifiedSeconds }) : null; }
function continuity(timeline, main) {
  let longest = 0; let current = 0; let lastEnd = null;
  for (const segment of timeline) {
    const asleep = ["asleep_core", "asleep_deep", "asleep_rem", "asleep_unspecified"].includes(segment.stage);
    const seconds = Math.max(0, (Date.parse(segment.end) - Date.parse(segment.start)) / 1000);
    current = asleep && lastEnd === segment.start ? current + seconds : asleep ? seconds : 0;
    longest = Math.max(longest, current); lastEnd = segment.end;
  }
  return Object.freeze({ awakeInWindowSeconds: main?.awakeSeconds ?? null, longestAsleepStretchSeconds: Math.round(longest) });
}
function projectSecondary(episode) { return Object.freeze({ start: episode.start, end: episode.end, asleepSeconds: episode.asleepSeconds, timeZone: episode.timeZone, source: family(episode.primarySource?.sourceFamily) }); }
function consistency(nights) {
  const eligible = nights.filter((night) => night.sleepWindow && !night.timeZoneUncertain);
  const starts = eligible.map((night) => nightClockMinute(clockMinute(night.sleepWindow.start, night.sleepWindow.timeZone)));
  const ends = eligible.map((night) => nightClockMinute(clockMinute(night.sleepWindow.end, night.sleepWindow.timeZone)));
  const medianStart = median(starts);
  const medianEnd = median(ends);
  return Object.freeze({
    medianStartMinute: wallClockMinute(medianStart),
    medianEndMinute: wallClockMinute(medianEnd),
    startSpreadMinutes: mad(starts),
    endSpreadMinutes: mad(ends),
    nightsUsed: eligible.length,
    inferredNightsExcluded: nights.filter((night) => night.timeZoneUncertain).length,
  });
}
function sourceSummary(nights) { return Object.freeze([...new Set(nights.flatMap((night) => [night.source, ...night.corroboratingSources]).filter(Boolean))].sort().map((label) => Object.freeze({ label }))); }
function average(values) { const valid = values.filter(Number.isFinite); return Object.freeze({ seconds: valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null, nightCount: valid.length }); }
function weekly(rows) { const groups = new Map(); for (const row of rows) { const key = monday(row.sleepDay); const list = groups.get(key) ?? []; list.push(projectNight(row)); groups.set(key, list); } return [...groups].sort(([a], [b]) => b.localeCompare(a)).map(([weekStart, values]) => Object.freeze({ weekStart, averageAsleepSeconds: average(values.map((v) => v.mainSleep?.asleepSeconds)).seconds, nightCount: values.filter((v) => Number.isFinite(v.mainSleep?.asleepSeconds)).length })); }
function prefer(rows) { return [...rows].sort((a, b) => Number(b.ingestionPurpose !== "historical_evidence_import") - Number(a.ingestionPurpose !== "historical_evidence_import"))[0] ?? null; }
function newest(rows) { const byDay = new Map(); for (const row of rows) if (!byDay.has(row.sleepDay) || row.ingestionPurpose !== "historical_evidence_import") byDay.set(row.sleepDay, row); return [...byDay.values()].sort((a, b) => b.sleepDay.localeCompare(a.sleepDay)); }
function family(value) { return ({ oura: "Oura", apple_watch: "Apple Watch", apple_iphone: "iPhone", apple_other: "Apple Health", sleep_cycle: "Sleep Cycle", whoop: "WHOOP", autosleep: "AutoSleep", third_party_other: "Another app", manual: "Entered in Health" })[value] ?? null; }
function clockMinute(instant, zone) { const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(instant)); return Number(parts.find((p) => p.type === "hour")?.value) * 60 + Number(parts.find((p) => p.type === "minute")?.value); }
// Sleep windows are linearized at 18:00 local time so midnight is an ordinary
// interior point. Even medians and MAD values retain the established Math.round
// integer rule. The API maps medians back to 0-1439 wall-clock minutes.
function nightClockMinute(value) { return (value - NIGHT_CLOCK_ANCHOR_MINUTE + MINUTES_PER_DAY) % MINUTES_PER_DAY; }
function wallClockMinute(value) { return value == null ? null : (value + NIGHT_CLOCK_ANCHOR_MINUTE) % MINUTES_PER_DAY; }
function median(values) { if (!values.length) return null; const sorted = [...values].sort((a,b)=>a-b); return sorted.length % 2 ? sorted[(sorted.length-1)/2] : Math.round((sorted[sorted.length/2-1]+sorted[sorted.length/2])/2); }
function mad(values) { const center = median(values); return center == null ? null : median(values.map((value) => Math.abs(value-center))); }
function monday(value) { const d = new Date(`${value}T00:00:00Z`); return shift(value, -((d.getUTCDay()+6)%7)); }
function shift(value, amount) { return new Date(Date.parse(`${value}T00:00:00Z`) + amount * DAY_MS).toISOString().slice(0,10); }
function daysBetween(a,b) { return Math.round((Date.parse(`${b}T00:00:00Z`)-Date.parse(`${a}T00:00:00Z`))/DAY_MS); }
function date(value) { if (!DATE.test(String(value ?? "")) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new RangeError("A valid YYYY-MM-DD date is required."); return String(value); }
function integer(value,min,max) { const number=Number(value); if (!Number.isInteger(number)||number<min||number>max) throw new RangeError(`Value must be ${min}-${max}.`); return number; }

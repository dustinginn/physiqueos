#!/usr/bin/env python3
"""Generate RecoverySleepFixture.json in the LIVE Server shape
(b81c784e src/application/recovery/HealthKitSleepEvidenceReadService.js).

SYNTHETIC ONLY. Deterministic (seeded); no Founder values are used or modeled.

Contents:
- "nights": projected nights (projectNight shape), newest first:
    * 2026-07-06..2026-09-30 historical_evidence_import (device_at_ingest,
      timeZoneUncertain=true), a few omitted days (no record);
    * 2026-10-01 prospective validation_only (zone not uncertain);
    * 2026-09-14 unstaged Apple Watch night (stageStatus unavailable);
    * 2026-09-21 a sleep-canon-v1 night (stages withheld; tolerance case);
    * 2026-09-20 one secondary sleep episode.
- "examples": landing / trends (night + week) / night payloads computed by a
  faithful port of the Server read service, for Native decode tests.

The Sandbox API serves "nights" through the same projection rules in Swift.
Run from ios/: python3 Scripts/generate_recovery_sleep_fixture.py
"""
import datetime as dt
import json
import math
from zoneinfo import ZoneInfo

LA = ZoneInfo("America/Los_Angeles")
OUT = "PhysiqueOS/Resources/RecoverySleepFixture.json"
FIRST = dt.date(2026, 7, 6)
LAST_HISTORICAL = dt.date(2026, 9, 30)
PROSPECTIVE = dt.date(2026, 10, 1)
OMITTED = {"2026-08-03", "2026-08-19", "2026-09-10"}
UNSTAGED = "2026-09-14"
V1_NIGHT = "2026-09-21"
SECONDARY = "2026-09-20"
FAMILY_LABEL = {"oura": "Oura", "apple_watch": "Apple Watch"}


class Rng:
    def __init__(self, seed):
        self.state = seed

    def next(self):
        self.state = (self.state * 6364136223846793005 + 1442695040888963407) % (1 << 64)
        return self.state >> 33

    def int(self, low, high):
        return low + self.next() % (high - low + 1)


def iso(moment):
    return moment.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def timeline(start, target_asleep, rng):
    segments, cursor, asleep, cycle = [], start, 0, 0

    def add(stage, minutes):
        nonlocal cursor, asleep
        if minutes <= 0:
            return
        end = cursor + dt.timedelta(minutes=minutes)
        if segments and segments[-1][0] == stage:
            segments[-1] = (stage, segments[-1][1], end)
        else:
            segments.append((stage, cursor, end))
        if stage != "awake":
            asleep += minutes * 60
        cursor = end

    while asleep < target_asleep:
        deep_weight, rem_weight = max(0, 3 - cycle), min(4, cycle + 1)
        bouts = 5 + rng.int(0, 3)
        for bout in range(bouts):
            add("asleep_core", 4 + rng.int(0, 9))
            if bout < deep_weight + 1 and deep_weight > 0:
                add("asleep_deep", 3 + rng.int(0, 4 * deep_weight))
            if bout >= bouts - rem_weight:
                add("asleep_rem", 3 + rng.int(0, 3 * rem_weight))
            if rng.int(0, 9) == 0:
                add("awake", 1 + rng.int(0, 2))
            if asleep >= target_asleep:
                break
        if asleep < target_asleep:
            add("awake", 2 + rng.int(0, 6))
        cycle += 1
    while segments and segments[-1][0] == "awake":
        segments.pop()
    return segments, segments[-1][2]


def continuity(segments, awake):
    longest = current = 0
    last_end = None
    for stage, a, b in segments:
        asleep = stage.startswith("asleep_")
        seconds = (b - a).total_seconds()
        current = current + seconds if asleep and last_end == a else (seconds if asleep else 0)
        longest = max(longest, current)
        last_end = b
    return {"awakeInWindowSeconds": awake, "longestAsleepStretchSeconds": round(longest)}


def project(day, rng):
    key = day.isoformat()
    prospective = day == PROSPECTIVE
    wake_midnight = dt.datetime(day.year, day.month, day.day, tzinfo=LA)
    start = wake_midnight + dt.timedelta(minutes=22 * 60 + 35 + rng.int(0, 70) - 24 * 60)
    segs, end = timeline(start, 6 * 3600 + 25 * 60 + rng.int(0, 80 * 60), rng)
    in_bed = int((end - start).total_seconds()) + 60 * (14 + rng.int(0, 30))
    totals = {s: int(sum((b - a).total_seconds() for st, a, b in segs if st == s))
              for s in ("asleep_core", "asleep_deep", "asleep_rem", "awake")}
    family, staged, algorithm = "oura", True, "sleep-canon-v2"
    timeline_payload = [{"stage": s, "start": iso(a), "end": iso(b)} for s, a, b in segs]
    if key == UNSTAGED:
        family, staged = "apple_watch", False
        timeline_payload = [{"stage": "asleep_unspecified", "start": iso(start), "end": iso(end)}]
        segs = [("asleep_unspecified", start, end)]
        totals = {"asleep_core": 0, "asleep_deep": 0, "asleep_rem": 0, "awake": 0}
    if key == V1_NIGHT:
        algorithm = "sleep-canon-v1"
    unspecified = int((end - start).total_seconds()) if key == UNSTAGED else 0
    asleep = totals["asleep_core"] + totals["asleep_deep"] + totals["asleep_rem"] + unspecified
    main = {"asleepSeconds": asleep, "awakeSeconds": totals["awake"], "coreSeconds": totals["asleep_core"],
            "deepSeconds": totals["asleep_deep"], "remSeconds": totals["asleep_rem"], "unspecifiedSeconds": unspecified,
            "inBedSeconds": in_bed, "stageCoverage": 1 if staged else 0}
    secondary = []
    if key == SECONDARY:
        nap = wake_midnight + dt.timedelta(hours=13, minutes=10)
        secondary = [{"start": iso(nap), "end": iso(nap + dt.timedelta(minutes=35)), "asleepSeconds": 31 * 60,
                      "timeZone": "America/Los_Angeles", "source": "Apple Watch"}]
    v2 = algorithm == "sleep-canon-v2"
    purpose = "validation_only" if prospective else "historical_evidence_import"
    return {
        "sleepDay": key, "status": "asleep_recorded", "mainSleep": main,
        "sleepWindow": {"start": iso(start), "end": iso(end), "timeZone": "America/Los_Angeles"},
        "timeline": timeline_payload,
        "stageStatus": "available" if v2 and staged else "unavailable",
        "stages": {"deepSeconds": main["deepSeconds"], "coreSeconds": main["coreSeconds"], "remSeconds": main["remSeconds"],
                   "awakeSeconds": main["awakeSeconds"], "unspecifiedSeconds": main["unspecifiedSeconds"]} if v2 else None,
        "continuity": continuity(segs, totals["awake"]) if v2 else None,
        "timeInBedSeconds": in_bed,
        "secondarySleep": secondary,
        "totalAsleepIncludingSecondarySeconds": asleep + sum(s["asleepSeconds"] for s in secondary),
        "source": FAMILY_LABEL[family],
        "corroboratingSources": ["Oura"] if key == UNSTAGED else [],
        "completeness": {"asleepData": "present", "stageDetail": "staged" if staged else "stage_detail_absent",
                         "sourceBasis": "sensor"},
        "timeZoneBasis": "device_at_ingest",
        "timeZoneUncertain": not prospective,
        "algorithmVersion": algorithm,
        "provenance": {"origin": purpose, "ingestionPurpose": purpose,
                       "computedAt": iso(end + dt.timedelta(hours=3)) if prospective else "2026-10-01T13:00:00.000Z"},
        "strategicEligible": False,
    }


# ---- Faithful port of the Server read service (for example payloads) ----

def clock_minute(instant, zone):
    local = dt.datetime.fromisoformat(instant.replace("Z", "+00:00")).astimezone(ZoneInfo(zone))
    return local.hour * 60 + local.minute


def jsround(value):
    """JavaScript Math.round (half up), as the Server uses."""
    return math.floor(value + 0.5)


def median(values):
    if not values:
        return None
    s = sorted(values)
    n = len(s)
    return s[(n - 1) // 2] if n % 2 else jsround((s[n // 2 - 1] + s[n // 2]) / 2)


def mad(values):
    center = median(values)
    return None if center is None else median([abs(v - center) for v in values])


def average(values):
    valid = [v for v in values if isinstance(v, (int, float))]
    return {"seconds": jsround(sum(valid) / len(valid)) if valid else None, "nightCount": len(valid)}


def landing(nights, through):
    start = (dt.date.fromisoformat(through) - dt.timedelta(days=29)).isoformat()
    rows = [n for n in nights if start <= n["sleepDay"] <= through]
    shown = rows[:14]
    seven = [n for n in rows if n["status"] == "asleep_recorded"][:7]
    eligible = [n for n in shown if n["sleepWindow"] and not n["timeZoneUncertain"]]
    starts = [clock_minute(n["sleepWindow"]["start"], n["sleepWindow"]["timeZone"]) for n in eligible]
    ends = [clock_minute(n["sleepWindow"]["end"], n["sleepWindow"]["timeZone"]) for n in eligible]
    labels = sorted({label for n in rows for label in [n["source"], *n["corroboratingSources"]] if label})
    return {
        "schemaVersion": "recovery-sleep-evidence-v1",
        "lastNight": next((n for n in shown if n["status"] == "asleep_recorded"), shown[0] if shown else None),
        "nights": shown,
        "sevenNightAverage": average([n["mainSleep"]["asleepSeconds"] for n in seven]),
        "window": {"medianStartMinute": median(starts), "medianEndMinute": median(ends),
                   "startSpreadMinutes": mad(starts), "endSpreadMinutes": mad(ends),
                   "nightsUsed": len(eligible), "inferredNightsExcluded": sum(1 for n in shown if n["timeZoneUncertain"])},
        "sources": [{"label": label} for label in labels],
        "strategicUse": "quarantined",
    }


def monday(key):
    day = dt.date.fromisoformat(key)
    return (day - dt.timedelta(days=day.weekday())).isoformat()


def trends(nights, start, end, limit=30, cursor=None):
    span = (dt.date.fromisoformat(end) - dt.date.fromisoformat(start)).days + 1
    rows = [n for n in nights if start <= n["sleepDay"] <= end]
    if cursor:
        rows = [n for n in rows if n["sleepDay"] < cursor]
    projected = rows[:limit]
    if span >= 183:
        groups = {}
        for n in rows:
            groups.setdefault(monday(n["sleepDay"]), []).append(n)
        series = [{"weekStart": w, "averageAsleepSeconds": average([n["mainSleep"]["asleepSeconds"] for n in groups[w]])["seconds"],
                   "nightCount": len(groups[w])} for w in sorted(groups, reverse=True)]
    else:
        series = projected
    return {"schemaVersion": "recovery-sleep-trends-v1", "range": {"startDate": start, "endDate": end},
            "granularity": "week" if span >= 183 else "night", "series": series, "nights": projected,
            "page": {"limit": limit, "count": len(projected),
                     "nextCursor": projected[-1]["sleepDay"] if len(rows) > limit and projected else None},
            "strategicUse": "quarantined"}


def main():
    rng = Rng(0x51EE9C0D)
    nights = []
    day = PROSPECTIVE
    while day >= FIRST:
        if day.isoformat() not in OMITTED:
            nights.append(project(day, rng))
        day -= dt.timedelta(days=1)
    examples = {
        "landing": landing(nights, "2026-10-01"),
        "trendsNight": trends(nights, "2026-09-02", "2026-10-01", limit=100),
        "trendsPage2": trends(nights, "2026-07-06", "2026-10-01", limit=20, cursor="2026-09-11"),
        "trendsWeek": trends(nights, "2026-04-02", "2026-10-01", limit=30),
        "night": {"schemaVersion": "recovery-sleep-night-v1", **next(n for n in nights if n["sleepDay"] == "2026-09-29"),
                  "strategicUse": "quarantined"},
    }
    # Decode tests do not need every example night's full timeline; keep the
    # night-detail example complete and trim the rest to keep the bundle small.
    def trimmed(payload):
        def trim(night):
            return {**night, "timeline": night["timeline"][:3]}
        out = dict(payload)
        for key in ("nights", "series"):
            if isinstance(out.get(key), list):
                out[key] = [trim(n) if isinstance(n, dict) and "timeline" in n else n for n in out[key]]
        if out.get("lastNight"):
            out["lastNight"] = trim(out["lastNight"])
        return out
    for key in ("landing", "trendsNight", "trendsPage2", "trendsWeek"):
        examples[key] = trimmed(examples[key])
    fixture = {
        "_comment": "SYNTHETIC Sandbox fixture in the live recovery-sleep-* shape (Server b81c784e). Generated by ios/Scripts/generate_recovery_sleep_fixture.py. Not Founder data.",
        "anchorSleepDay": PROSPECTIVE.isoformat(),
        "nights": nights,
        "examples": examples,
    }
    with open(OUT, "w") as handle:
        json.dump(fixture, handle, separators=(",", ":"), sort_keys=True)
        handle.write("\n")
    print(f"wrote {OUT}: {len(nights)} nights")


if __name__ == "__main__":
    main()

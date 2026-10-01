#!/usr/bin/env python3
"""Generate RecoverySleepFixture.json: the Sandbox example of the
`recovery-sleep*` read contract (proposal v0).

SYNTHETIC ONLY. Deterministic (seeded); no Founder values are used or modeled.
It deliberately exercises every state the Native UI must handle:

- 2026-10-01: prospective night, window still open, zone inferred at sync;
- 2026-09-02..09-30: historical import, zone basis device_at_ingest,
  certainty "uncertain"; 09-26..09-29 additionally excluded from consistency
  (Server-flagged uncertain travel-period clock times);
- 2026-09-21: stage detail pending correction (sleep-canon-v1);
- 2026-09-14: unstaged Apple Watch fallback night (stages absent);
- 2026-09-20: one additional (secondary) sleep episode;
- 2026-09-10: no sleep recorded.

Run from ios/: python3 Scripts/generate_recovery_sleep_fixture.py
"""
import datetime as dt
import json
import statistics
from zoneinfo import ZoneInfo

LA = ZoneInfo("America/Los_Angeles")
OUT = "PhysiqueOS/Resources/RecoverySleepFixture.json"
NEWEST = dt.date(2026, 10, 1)
NIGHTS = 30
PENDING = "2026-09-21"
ABSENT = "2026-09-14"
SECONDARY = "2026-09-20"
MISSING = "2026-09-10"
EXCLUDED = {"2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29"}


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
        deep_weight = max(0, 3 - cycle)
        rem_weight = min(4, cycle + 1)
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


def clock_minutes(moment, zone):
    local = moment.astimezone(zone)
    return (local.hour * 60 + local.minute - 18 * 60) % 1440


def mad(values):
    center = statistics.median(values)
    return round(statistics.median([abs(v - center) for v in values]))


def build_nights():
    rng = Rng(0x51EE9C0D)
    details = []
    for offset in range(NIGHTS):
        wake = NEWEST - dt.timedelta(days=offset)
        key = wake.isoformat()
        prospective = offset == 0
        base = {
            "sleepDay": key,
            "timeZone": "America/Los_Angeles",
            "timeZoneBasis": "device_at_ingest",
            "timeZoneCertainty": "inferred" if prospective else "uncertain",
            "includedInConsistency": key not in EXCLUDED,
            "windowOpen": prospective,
            "windowClosesAt": iso(dt.datetime(wake.year, wake.month, wake.day, 18, tzinfo=LA)),
            "origin": "prospective" if prospective else "historical_import",
        }
        if key == MISSING:
            details.append({"night": {**base, "status": "no_sleep_recorded", "asleepSeconds": None,
                                      "totalAsleepIncludingSecondarySeconds": None, "secondaryEpisodeCount": 0,
                                      "start": None, "end": None, "stageStatus": "absent",
                                      "primarySourceFamily": None, "includedInConsistency": False},
                            "main": None, "secondary": [], "provenance": None})
            continue
        bed_minute = 22 * 60 + 35 + rng.int(0, 70)
        wake_midnight = dt.datetime(wake.year, wake.month, wake.day, tzinfo=LA)
        start = wake_midnight + dt.timedelta(minutes=bed_minute - 24 * 60)
        segs, end = timeline(start, 6 * 3600 + 25 * 60 + rng.int(0, 80 * 60), rng)
        in_bed_start = start - dt.timedelta(minutes=8 + rng.int(0, 14))
        in_bed_end = end + dt.timedelta(minutes=6 + rng.int(0, 18))
        totals = {s: sum((b - a).seconds for st, a, b in segs if st == s) for s in
                  ("asleep_core", "asleep_deep", "asleep_rem", "awake")}
        asleep = totals["asleep_core"] + totals["asleep_deep"] + totals["asleep_rem"]
        longest, run_start, run_end = 0, None, None
        for stage, a, b in segs:
            if stage == "awake":
                run_start = run_end = None
                continue
            if run_end == a:
                run_end = b
            else:
                run_start, run_end = a, b
            longest = max(longest, (run_end - run_start).seconds)

        family, stage_status = "oura", "available"
        timeline_payload = [{"stage": s, "start": iso(a), "end": iso(b)} for s, a, b in segs]
        stages = {"status": "available", "deepSeconds": totals["asleep_deep"], "coreSeconds": totals["asleep_core"],
                  "remSeconds": totals["asleep_rem"], "unspecifiedSeconds": 0, "awakeSeconds": totals["awake"]}
        continuity = {"status": "available", "awakeInWindowSeconds": totals["awake"], "longestAsleepStretchSeconds": longest}
        timeline_status = "available"
        reason, preference_applied, corroborating = "only_candidate", True, []
        algorithm = "sleep-canon-v2"
        if key == PENDING:
            stage_status = timeline_status = "pending_correction"
            algorithm = "sleep-canon-v1"
            stages = {"status": "pending_correction", "deepSeconds": None, "coreSeconds": None, "remSeconds": None,
                      "unspecifiedSeconds": None, "awakeSeconds": None}
            continuity = {"status": "pending_correction", "awakeInWindowSeconds": None, "longestAsleepStretchSeconds": None}
            timeline_payload = []
        if key == ABSENT:
            family, stage_status, timeline_status = "apple_watch", "absent", "absent"
            reason, preference_applied = "usable_over_insufficient_coverage", False
            corroborating = [{"sourceFamily": "oura", "usable": False}]
            timeline_payload = [{"stage": "asleep_unspecified", "start": iso(start), "end": iso(end)}]
            stages = {"status": "absent", "deepSeconds": None, "coreSeconds": None, "remSeconds": None,
                      "unspecifiedSeconds": int((end - start).total_seconds()), "awakeSeconds": None}
            continuity = {"status": "absent", "awakeInWindowSeconds": None, "longestAsleepStretchSeconds": None}
            asleep = int((end - start).total_seconds())
        secondary = []
        if key == SECONDARY:
            nap_start = wake_midnight + dt.timedelta(hours=13, minutes=10)
            secondary = [{"start": iso(nap_start), "end": iso(nap_start + dt.timedelta(minutes=35)),
                          "asleepSeconds": 31 * 60, "sourceFamily": "apple_watch"}]
        night = {**base, "status": "asleep_recorded", "asleepSeconds": asleep,
                 "totalAsleepIncludingSecondarySeconds": asleep + sum(s["asleepSeconds"] for s in secondary),
                 "secondaryEpisodeCount": len(secondary), "start": iso(start), "end": iso(end),
                 "stageStatus": stage_status, "primarySourceFamily": family}
        recomputed = (end + dt.timedelta(hours=3)) if prospective else dt.datetime(2026, 10, 2, 9, 0, tzinfo=LA)
        details.append({
            "night": night,
            "main": {"start": iso(start), "end": iso(end), "inBedStart": iso(in_bed_start), "inBedEnd": iso(in_bed_end),
                     "inBedSeconds": int((in_bed_end - in_bed_start).total_seconds()),
                     "stages": stages, "continuity": continuity,
                     "timeline": {"status": timeline_status, "segments": timeline_payload}},
            "secondary": secondary,
            "provenance": {"primarySourceFamily": family, "preferenceApplied": preference_applied, "reason": reason,
                           "corroborating": corroborating, "algorithmVersion": algorithm,
                           "lastRecomputedAt": iso(recomputed)},
        })
    return details


def average(nights, minimum=3):
    values = [n["asleepSeconds"] for n in nights if n["asleepSeconds"] is not None]
    return {"asleepSeconds": round(sum(values) / len(values)) if len(values) >= minimum else None,
            "nightCount": len(values), "windowNights": len(nights), "minimumNights": minimum}


def window_summary(details):
    rows = [d for d in details if d["main"] and d["night"]["includedInConsistency"]]
    excluded = sum(1 for d in details if d["main"] and not d["night"]["includedInConsistency"])
    if not rows:
        return {"typicalStartMinutes": None, "typicalEndMinutes": None, "startSpreadMinutes": None,
                "endSpreadMinutes": None, "nightsIncluded": 0, "nightsExcludedUncertainTime": excluded}
    starts = [clock_minutes(dt.datetime.fromisoformat(d["main"]["start"].replace("Z", "+00:00")), LA) for d in rows]
    ends = [clock_minutes(dt.datetime.fromisoformat(d["main"]["end"].replace("Z", "+00:00")), LA) for d in rows]
    return {"typicalStartMinutes": round(statistics.median(starts)), "typicalEndMinutes": round(statistics.median(ends)),
            "startSpreadMinutes": mad(starts), "endSpreadMinutes": mad(ends),
            "nightsIncluded": len(rows), "nightsExcludedUncertainTime": excluded}


def trailing(details, index):
    return average([d["night"] for d in details[index:index + 7]])["asleepSeconds"]


def trends(details, range_key, count):
    subset = details[:count]
    window_rows = []
    for d in subset:
        if not d["main"]:
            continue
        start = dt.datetime.fromisoformat(d["main"]["start"].replace("Z", "+00:00"))
        end = dt.datetime.fromisoformat(d["main"]["end"].replace("Z", "+00:00"))
        window_rows.append({"sleepDay": d["night"]["sleepDay"], "startMinutes": clock_minutes(start, LA),
                            "endMinutes": clock_minutes(end, LA),
                            "timeZoneCertainty": d["night"]["timeZoneCertainty"],
                            "includedInConsistency": d["night"]["includedInConsistency"]})
    with_data = [d["night"] for d in subset if d["night"]["asleepSeconds"] is not None]
    return {
        "range": range_key, "granularity": "night",
        "averageAsleepSeconds": round(sum(n["asleepSeconds"] for n in with_data) / len(with_data)),
        "nightsWithData": len(with_data),
        "totalSleep": [{"periodStart": d["night"]["sleepDay"], "asleepSeconds": d["night"]["asleepSeconds"],
                        "nightCount": 1 if d["night"]["asleepSeconds"] is not None else 0,
                        "trailingAverageSeconds": trailing(details, i)} for i, d in enumerate(subset)],
        "sleepWindow": window_summary(subset),
        "windowRows": window_rows,
        "continuity": [{"sleepDay": d["night"]["sleepDay"], "status": d["main"]["continuity"]["status"] if d["main"] else "absent",
                        "awakeInWindowSeconds": d["main"]["continuity"]["awakeInWindowSeconds"] if d["main"] else None,
                        "longestAsleepStretchSeconds": d["main"]["continuity"]["longestAsleepStretchSeconds"] if d["main"] else None}
                       for d in subset],
        "stageMix": [{"sleepDay": d["night"]["sleepDay"], "status": d["main"]["stages"]["status"] if d["main"] else "absent",
                      "deepSeconds": d["main"]["stages"]["deepSeconds"] if d["main"] else None,
                      "coreSeconds": d["main"]["stages"]["coreSeconds"] if d["main"] else None,
                      "remSeconds": d["main"]["stages"]["remSeconds"] if d["main"] else None} for d in subset],
    }


def weekly(details):
    weeks = {}
    for d in details:
        day = dt.date.fromisoformat(d["night"]["sleepDay"])
        week_start = (day - dt.timedelta(days=day.weekday())).isoformat()
        weeks.setdefault(week_start, []).append(d["night"])
    points = []
    for week_start in sorted(weeks, reverse=True):
        avg = average(weeks[week_start], minimum=1)
        points.append({"periodStart": week_start, "asleepSeconds": avg["asleepSeconds"],
                       "nightCount": avg["nightCount"], "trailingAverageSeconds": None})
    with_data = [d["night"] for d in details if d["night"]["asleepSeconds"] is not None]
    return {"range": "6m", "granularity": "week",
            "averageAsleepSeconds": round(sum(n["asleepSeconds"] for n in with_data) / len(with_data)),
            "nightsWithData": len(with_data), "totalSleep": points,
            "sleepWindow": None, "windowRows": None, "continuity": None, "stageMix": None}


def main():
    details = build_nights()
    recent = details[:14]
    landing = {
        "state": "available",
        "lastNight": details[0]["night"],
        "nights": [d["night"] for d in recent],
        "sevenNightAverage": average([d["night"] for d in details[:7]]),
        "priorSevenNightAverage": average([d["night"] for d in details[7:14]]),
        "trailingAverages": [{"sleepDay": d["night"]["sleepDay"], "asleepSeconds": trailing(details, i)}
                             for i, d in enumerate(recent)],
        "sleepWindow": window_summary(recent),
        "sources": [
            {"family": "oura", "role": "preferred", "nightsRecorded": 28, "windowNights": 30},
            {"family": "apple_watch", "role": "recording", "nightsRecorded": 2, "windowNights": 30},
            {"family": "manual", "role": "not_recorded", "nightsRecorded": 0, "windowNights": 30},
        ],
        "evidenceStartSleepDay": details[-1]["night"]["sleepDay"],
    }
    fixture = {
        "_comment": "SYNTHETIC Sandbox fixture for the recovery-sleep read contract v0. Generated by ios/Scripts/generate_recovery_sleep_fixture.py. Not Founder data.",
        "landing": landing,
        "trends": {"2w": trends(details, "2w", 14), "1m": trends(details, "1m", 30), "all": trends(details, "all", 30),
                   "6m": weekly(details)},
        "nights": details,
    }
    with open(OUT, "w") as handle:
        json.dump(fixture, handle, separators=(",", ":"), sort_keys=True)
        handle.write("\n")
    print(f"wrote {OUT}: {len(details)} nights, {sum(len(d['main']['timeline']['segments']) for d in details if d['main'])} segments")


if __name__ == "__main__":
    main()

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Activity,
  Camera,
  ChevronRight,
  ClipboardList,
  Dumbbell,
  HeartPulse,
  Salad,
  ScanLine,
  Scale,
  Syringe,
} from "lucide-react";
import IconBadge from "../ui/IconBadge";
import {
  orderEvidenceStreams,
  readEvidenceHubUsage,
  rankRecentlyUsedEvidence,
  recordEvidenceHubVisit,
  writeEvidenceHubUsage,
} from "../../domain/services/EvidenceHubUsageService";

const streamIcons = {
  activity: Activity,
  dexa: ScanLine,
  "health-metrics": HeartPulse,
  nutrition: Salad,
  photos: Camera,
  protocols: Syringe,
  recovery: Activity,
  training: Dumbbell,
  weight: Scale,
};

export default function EvidenceHubIndex({ from, streams }) {
  const [recentIds, setRecentIds] = useState([]);
  const orderedStreams = orderEvidenceStreams(streams);
  const streamById = new Map(orderedStreams.map((stream) => [stream.id, stream]));
  const recentlyUsed = recentIds.map((id) => streamById.get(id)).filter(Boolean);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const usage = readEvidenceHubUsage(window.localStorage);
        setRecentIds(rankRecentlyUsedEvidence(usage, new Date(), 3));
      } catch {
        // The server-rendered cold-start state remains valid without local storage.
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const recordVisit = (evidenceType) => {
    try {
      const current = readEvidenceHubUsage(window.localStorage);
      const next = recordEvidenceHubVisit(current, evidenceType, new Date());
      writeEvidenceHubUsage(window.localStorage, next);
    } catch {
      // Navigation must remain reliable when local storage is unavailable.
    }
  };

  return (
    <div className="space-y-6">
      {recentlyUsed.length > 0 && (
        <section aria-labelledby="recently-used-heading" className="space-y-2">
          <h2 className="text-lg font-extrabold leading-tight text-slate-950" id="recently-used-heading">
            Recently Used
          </h2>
          <div className="space-y-2">
            {recentlyUsed.map((stream) => (
              <EvidenceStreamCard
                from={from}
                key={`recent-${stream.id}`}
                onVisit={recordVisit}
                stream={stream}
              />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="all-evidence-heading" className="space-y-2">
        <h2 className="text-lg font-extrabold leading-tight text-slate-950" id="all-evidence-heading">
          All Evidence
        </h2>
        <div className="space-y-2">
          {orderedStreams.map((stream) => (
            <EvidenceStreamCard
              from={from}
              key={stream.id}
              onVisit={recordVisit}
              stream={stream}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function EvidenceStreamCard({ from, onVisit, stream }) {
  const Icon = streamIcons[stream.id] ?? ClipboardList;
  const href = from === "you" ? `${stream.href}?from=you` : stream.href;
  const summary = getCompactSummary(stream);
  const title = displayTitle(stream);
  const accessibleSummary = summary.value ? `${summary.label}: ${summary.value}` : summary.label;

  return (
    <Link
      aria-label={`Review ${title}. ${accessibleSummary}`}
      className="flex min-h-[68px] w-full items-center gap-3 rounded-[14px] border border-[var(--divider)] bg-[var(--surface-elevated)] px-3.5 py-3 shadow-[var(--shadow-card)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100"
      href={href}
      onClick={() => onVisit(stream.id)}
    >
      <IconBadge
        className="h-8 min-h-8 w-8 min-w-8 flex-none aspect-square rounded-full"
        color={stream.tone}
        icon={Icon}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-extrabold leading-5 text-slate-950">
          {title}
        </h3>
        <p className="mt-0.5 truncate text-xs font-semibold leading-5 text-slate-500">
          <span>{summary.label}</span>
          {summary.value && <span className="text-slate-700"> · {summary.value}</span>}
        </p>
      </div>
      <ChevronRight
        aria-hidden="true"
        className="h-[18px] w-[18px] shrink-0 text-slate-400"
        size={18}
      />
    </Link>
  );
}

function getCompactSummary(stream) {
  const datedLabels = {
    training: "Last workout",
    nutrition: "Last logged",
    photos: "Last session",
    dexa: "Last scan",
  };

  if (datedLabels[stream.id]) {
    return {
      label: datedLabels[stream.id],
      value: stream.lastUpdated ? formatDate(stream.lastUpdated) : stream.metric,
    };
  }

  if (stream.id === "weight" || stream.id === "activity") {
    return { label: "Latest", value: stream.metric };
  }

  return { label: stream.metric, value: null };
}

function displayTitle(stream) {
  return stream.id === "photos" ? "Photos" : stream.title;
}

function formatDate(value) {
  if (!value) return "Not connected";
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  const date = year && month && day ? new Date(year, month - 1, day) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

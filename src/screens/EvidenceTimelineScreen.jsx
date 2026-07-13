import Link from "next/link";
import { ArrowLeft, Activity, Camera, FileText, ScanLine, Scale } from "lucide-react";
import Card from "../components/ui/Card";
import IconBadge from "../components/ui/IconBadge";

const typeIcons = {
  Analysis: FileText,
  "Daily Activity": Activity,
  "Daily Check-In": Activity,
  "Daily Briefing": FileText,
  DEXA: ScanLine,
  "Evidence Upload": FileText,
  "Progress Photo": Camera,
  Protocol: Activity,
  Weight: Scale,
  Workout: Activity,
};

export default function EvidenceTimelineScreen({ items }) {
  return (
    <main className="min-h-screen bg-[#F7F8FA]">
      <div className="mx-auto max-w-[393px] px-4 pt-10 pb-10">
        <Link
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-500"
          href="/"
        >
          <ArrowLeft size={18} />
          Home
        </Link>

        <header className="mb-6 space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-indigo-600">
            Evidence Timeline
          </p>
          <h1 className="text-3xl font-extrabold leading-tight text-slate-950">
            Founder history.
          </h1>
          <p className="text-base leading-7 text-slate-500">
            Weight, photos, DEXA, workouts, activity, protocols, check-ins, and
            analyses all stay visible as operating history.
          </p>
        </header>

        <Card className="space-y-3">
          {items.map((item) => {
            const Icon = typeIcons[item.type] ?? FileText;

            return (
              <div
                key={`${item.type}-${item.id}`}
                className="flex gap-3 border-b border-[#E5E7EB] pb-3 last:border-b-0 last:pb-0"
              >
                <IconBadge icon={Icon} color={item.tone} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                      {item.type}
                    </p>
                    <p className="shrink-0 text-[11px] font-semibold text-slate-400">
                      {formatDate(item.date)}
                    </p>
                  </div>
                  <h2 className="mt-1 text-base font-bold leading-tight text-slate-950">
                    {renderTimelineValue(item.title, "Timeline entry")}
                  </h2>
                  <p className="mt-1 text-sm leading-5 text-slate-500">
                    {renderTimelineValue(item.detail, "Details available")}
                  </p>
                </div>
              </div>
            );
          })}
        </Card>
      </div>
    </main>
  );
}

export function renderTimelineValue(value, fallback) {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map((item)=>renderTimelineValue(item, "")).filter(Boolean).join(", ") || fallback;
  if (value == null) return fallback;
  if (process.env.NODE_ENV !== "production") console.warn("[EvidenceTimeline] Prevented object from rendering as a React child.");
  return fallback;
}

function formatDate(value) {
  const dateKey = String(value).slice(0, 10);
  const [year, month, day] = dateKey.split("-").map(Number);
  const date =
    year && month && day
      ? new Date(year, month - 1, day)
      : new Date(value);

  if (Number.isNaN(date.getTime())) return dateKey;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

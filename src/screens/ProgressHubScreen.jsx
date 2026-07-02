import Link from "next/link";
import {
  Activity,
  ArrowLeft,
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
import Card from "../components/ui/Card";
import IconBadge from "../components/ui/IconBadge";

const streamIcons = {
  dexa: ScanLine,
  "health-metrics": HeartPulse,
  nutrition: Salad,
  photos: Camera,
  protocols: Syringe,
  recovery: Activity,
  training: Dumbbell,
  weight: Scale,
};

export default function ProgressHubScreen({ from, report }) {
  const fromYou = from === "you";

  return (
    <main className="app-surface min-h-screen">
      <div className="mx-auto max-w-[393px] px-4 pt-10 pb-24">
        <Link
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-500"
          href={fromYou ? "/profile" : "/"}
        >
          <ArrowLeft size={18} />
          {fromYou ? "You" : "Home"}
        </Link>

        <header className="mb-6 space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-indigo-600">
            Evidence Hub
          </p>
          <h1 className="text-3xl font-extrabold leading-tight text-slate-950">
            {report.title}
          </h1>
          <p className="text-base leading-7 text-slate-500">{report.subtitle}</p>
        </header>

        <section className="space-y-3">
          {report.streams.map((stream) => (
            <EvidenceStreamCard from={from} key={stream.id} stream={stream} />
          ))}
        </section>
      </div>
    </main>
  );
}

function EvidenceStreamCard({ from, stream }) {
  const Icon = streamIcons[stream.id] ?? ClipboardList;
  const href = from === "you" ? `${stream.href}?from=you` : stream.href;

  return (
    <Link className="block" href={href}>
      <Card className="transition hover:border-[var(--border-strong)] hover:bg-[color-mix(in_srgb,var(--surface-muted)_72%,var(--surface-elevated))]">
        <div className="flex items-start gap-3">
          <IconBadge
            className="rounded-full"
            color={stream.tone}
            icon={Icon}
            size="md"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
                  {stream.status === "available" ? "Reporting" : "Preview"}
                </p>
                <h2 className="mt-1 text-lg font-extrabold leading-tight text-slate-950">
                  {stream.title}
                </h2>
              </div>
              <ChevronRight className="mt-1 shrink-0 text-slate-300" size={18} />
            </div>

            <div className="mt-4 grid grid-cols-[1fr_auto] items-end gap-3">
              <div>
                <p className="text-2xl font-extrabold tracking-tight text-slate-950">
                  {stream.metric}
                </p>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {stream.trend}{" "}
                  <span className="font-semibold text-slate-400">
                    {stream.trendLabel}
                  </span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
                  History
                </p>
                <p className="mt-1 text-xs font-extrabold text-slate-700">
                  {stream.history}
                </p>
              </div>
            </div>

            <p className="mt-3 text-[11px] font-semibold text-slate-400">
              Latest: {formatDate(stream.lastUpdated)}
            </p>
          </div>
        </div>
      </Card>
    </Link>
  );
}

function formatDate(value) {
  if (!value) return "Not connected";

  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  const date =
    year && month && day ? new Date(year, month - 1, day) : new Date(value);

  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

import Link from "next/link";
import { ArrowLeft, Scale } from "lucide-react";
import EvidenceReportContext from "../components/progress/EvidenceReportContext";
import ProgressLineChart from "../components/progress/ProgressLineChart";
import ReportDrawer from "../components/progress/ReportDrawer";
import Card from "../components/ui/Card";
import IconBadge from "../components/ui/IconBadge";

export default function WeightReportScreen({ from, report }) {
  return (
    <main className="app-surface min-h-screen">
      <div className="mx-auto max-w-[393px] px-4 pt-10 pb-24">
        <Link
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-500"
          href={from === "you" ? "/progress?from=you" : "/progress"}
        >
          <ArrowLeft size={18} />
          Evidence Hub
        </Link>

        <header className="mb-5 flex items-start gap-3">
          <IconBadge className="rounded-full" color="evidence" icon={Scale} size="lg" />
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-sky-600">
              Evidence Report
            </p>
            <h1 className="mt-1 text-3xl font-extrabold leading-tight text-slate-950">
              {report.title}
            </h1>
            <p className="mt-2 text-base leading-7 text-slate-500">
              {report.subtitle}
            </p>
          </div>
        </header>

        <EvidenceReportContext
          mode="related-goals"
          relatedGoals={report.relatedGoals}
        />

        <section className="grid grid-cols-2 gap-3">
          {report.summary.map((item) => (
            <Card key={item.label} padding="sm">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
                {item.label}
              </p>
              <p className="mt-1 text-xl font-extrabold text-slate-950">
                {item.value}
              </p>
            </Card>
          ))}
        </section>

        <Card className="mt-4 space-y-3">
          <div>
            <h2 className="text-lg font-extrabold text-slate-950">
              Weight Trend
            </h2>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Weight history with DEXA scan markers.
            </p>
          </div>
          <ProgressLineChart
            ariaLabel="Weight trend over time"
            color="#0EA5E9"
            metricLabel="Weight"
            markers={report.chart.markers}
            points={report.chart.points}
            suffix=" lb"
          />
        </Card>

        <div className="mt-4">
          <ReportDrawer
            description="Weekly trend smoothing for scale noise."
            preview={<WeeklyAverageRows weeks={report.weeklyAverages.slice(0, 3)} />}
            title="Weekly Averages"
          >
            <WeeklyAverageRows weeks={report.weeklyAverages} />
          </ReportDrawer>
        </div>

        <div className="mt-4">
          <ReportDrawer
            preview={<WeightHistoryRows entries={report.history.slice(0, 3)} />}
            title="Weight History"
          >
            <WeightHistoryRows entries={report.history} />
          </ReportDrawer>
        </div>

        <EvidenceReportContext
          dataSources={report.dataSources}
          mode="data-sources"
        />
      </div>
    </main>
  );
}

function WeightHistoryRows({ entries }) {
  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <div
          className="flex items-center justify-between gap-3 rounded-[12px] bg-[var(--surface-muted)] p-3"
          key={entry.id}
        >
          <div>
            <p className="text-sm font-bold text-slate-950">
              {formatDate(entry.date)}
            </p>
            <p className="text-xs font-medium text-slate-400">
              {entry.detail}
            </p>
          </div>
          <p className="text-sm font-extrabold text-slate-700">
            {entry.label}
          </p>
        </div>
      ))}
    </div>
  );
}

function WeeklyAverageRows({ weeks }) {
  return (
    <div className="space-y-2">
      {weeks.map((week) => (
        <div
          className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-[12px] bg-[var(--surface-muted)] p-3"
          key={week.week}
        >
          <div>
            <p className="text-sm font-extrabold text-slate-950">
              Week of {week.week}
            </p>
            <p className="text-xs font-semibold text-slate-400">
              {week.entries} entries
            </p>
          </div>
          <p className="text-sm font-extrabold text-slate-700">
            {week.average.toFixed(1)} lb
          </p>
          <p
            className={`text-sm font-extrabold ${
              week.weekOverWeek < 0 ? "text-emerald-600" : "text-slate-500"
            }`}
          >
            {week.weekOverWeek === null
              ? "Base"
              : `${week.weekOverWeek > 0 ? "+" : ""}${week.weekOverWeek.toFixed(1)} lb`}
          </p>
        </div>
      ))}
    </div>
  );
}

function formatDate(value) {
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  const date =
    year && month && day ? new Date(year, month - 1, day) : new Date(value);

  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

import Link from "next/link";
import { ArrowLeft, ScanLine } from "lucide-react";
import EvidenceReportContext from "../components/progress/EvidenceReportContext";
import ProgressLineChart from "../components/progress/ProgressLineChart";
import ReportDrawer from "../components/progress/ReportDrawer";
import Card from "../components/ui/Card";
import IconBadge from "../components/ui/IconBadge";

export default function DEXAReportScreen({ from, report }) {
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
          <IconBadge className="rounded-full" color="success" icon={ScanLine} size="lg" />
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-600">
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

        {report.latestScan && (
          <Card className="mb-4 grid grid-cols-[1fr_auto] gap-3" padding="sm">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-emerald-600">
                Latest Scan
              </p>
              <p className="mt-1 text-xl font-extrabold text-slate-950">
                {formatDate(report.latestScan.date)}
              </p>
            </div>
            <div className="self-center text-right">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
                Original PDF
              </p>
              {report.latestScan.sourceHref ? (
                <a
                  className="mt-1 block max-w-[120px] truncate text-xs font-extrabold text-[var(--primary)]"
                  href={report.latestScan.sourceHref}
                  rel="noreferrer"
                  target="_blank"
                >
                  View Original
                </a>
              ) : (
                <p className="mt-1 max-w-[120px] truncate text-xs font-bold text-slate-600">
                  {report.latestScan.sourceFileId ?? "Stored"}
                </p>
              )}
            </div>
          </Card>
        )}

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

        {report.delta && (
          <Card className="mt-4 grid grid-cols-3 gap-2" padding="sm">
            <Delta label="BF" value={report.delta.bodyFat} />
            <Delta label="Fat Mass" value={report.delta.fatMass} />
            <Delta label="Lean Mass" value={report.delta.leanMass} />
          </Card>
        )}

        <div className="mt-4">
          <ReportDrawer
            defaultOpen
            description="Primary BodySpec trend lines for the cut."
            title="Core Trends"
          >
            <div className="grid gap-4">
              <ChartCard
                chart={report.chart}
                description="Verified BodySpec scan history."
                label="Body Fat"
                suffix="%"
              />
              {report.charts
                .filter((chart) =>
                  ["fatMass", "leanMass", "totalMass", "rmr"].includes(chart.id)
                )
                .map((chart) => (
                  <ChartCard chart={chart} key={chart.id} />
                ))}
            </div>
          </ReportDrawer>
        </div>

        <div className="mt-4">
          <ReportDrawer
            description="Secondary calibration metrics from BodySpec."
            preview={<MetricRows rows={report.latestDetails.slice(0, 3)} />}
            title="Supplemental Metrics"
          >
            <div className="grid gap-4">
              <MetricRows rows={report.latestDetails} />
              {report.charts
                .filter((chart) =>
                  ["vatMass", "androidGynoidRatio"].includes(chart.id)
                )
                .map((chart) => (
                  <ChartCard chart={chart} key={chart.id} />
                ))}
            </div>
          </ReportDrawer>
        </div>

        <div className="mt-4">
          <ReportDrawer
            description="Regional lean tissue in pounds."
            preview={
              <MetricRows
                rows={[
                  ["Arms Lean Mass", report.latestRegional?.arms?.leanMass?.value, " lb"],
                  ["Legs Lean Mass", report.latestRegional?.legs?.leanMass?.value, " lb"],
                  ["Trunk Lean Mass", report.latestRegional?.trunk?.leanMass?.value, " lb"],
                ]}
              />
            }
            title="Regional Tissue Lean Mass"
          >
            <div className="grid gap-4">
              <MetricRows
                rows={[
                  ["Arms Lean Mass", report.latestRegional?.arms?.leanMass?.value, " lb"],
                  ["Legs Lean Mass", report.latestRegional?.legs?.leanMass?.value, " lb"],
                  ["Trunk Lean Mass", report.latestRegional?.trunk?.leanMass?.value, " lb"],
                  ["Android Lean Mass", report.latestRegional?.android?.leanMass?.value, " lb"],
                  ["Gynoid Lean Mass", report.latestRegional?.gynoid?.leanMass?.value, " lb"],
                ]}
              />
              {report.regionalMassCharts
                .filter((chart) => chart.id.includes("leanMass"))
                .map((chart) => (
                  <ChartCard
                    chart={chart}
                    color="var(--chart-2)"
                    description="Regional lean tissue mass extracted from BodySpec reports."
                    key={chart.id}
                  />
                ))}
            </div>
          </ReportDrawer>
        </div>

        <div className="mt-4">
          <ReportDrawer
            description="Regional fat tissue in pounds."
            preview={
              <MetricRows
                rows={[
                  ["Arms Fat Mass", report.latestRegional?.arms?.fatMass?.value, " lb"],
                  ["Legs Fat Mass", report.latestRegional?.legs?.fatMass?.value, " lb"],
                  ["Trunk Fat Mass", report.latestRegional?.trunk?.fatMass?.value, " lb"],
                ]}
              />
            }
            title="Regional Tissue Fat Mass"
          >
            <div className="grid gap-4">
              <MetricRows
                rows={[
                  ["Arms Fat Mass", report.latestRegional?.arms?.fatMass?.value, " lb"],
                  ["Legs Fat Mass", report.latestRegional?.legs?.fatMass?.value, " lb"],
                  ["Trunk Fat Mass", report.latestRegional?.trunk?.fatMass?.value, " lb"],
                  ["Android Fat Mass", report.latestRegional?.android?.fatMass?.value, " lb"],
                  ["Gynoid Fat Mass", report.latestRegional?.gynoid?.fatMass?.value, " lb"],
                ]}
              />
              {report.regionalMassCharts
                .filter((chart) => chart.id.includes("fatMass"))
                .map((chart) => (
                  <ChartCard
                    chart={chart}
                    color="var(--chart-3)"
                    description="Regional fat tissue mass extracted from BodySpec reports."
                    key={chart.id}
                  />
                ))}
            </div>
          </ReportDrawer>
        </div>

        <div className="mt-4">
          <ReportDrawer title="Scan History">
            {report.history.map((scan) => (
              <div
                className="mb-2 rounded-[12px] bg-[var(--surface-muted)] p-3 last:mb-0"
                key={scan.id}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-extrabold text-slate-950">
                    {formatDate(scan.date)}
                  </p>
                  <p className="text-sm font-extrabold text-emerald-600">
                    {scan.bodyFatPercentage.toFixed(1)}%
                  </p>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] font-bold text-slate-500">
                  <span>{scan.fatMass.toFixed(1)} lb fat</span>
                  <span>{scan.leanMass.toFixed(1)} lb lean</span>
                  <span>{scan.rmr} RMR</span>
                </div>
                {scan.sourceHref ? (
                  <a
                    className="mt-2 inline-flex text-[11px] font-extrabold text-[var(--primary)]"
                    href={scan.sourceHref}
                    rel="noreferrer"
                    target="_blank"
                  >
                    View Original PDF
                  </a>
                ) : (
                  <p className="mt-2 text-[11px] font-semibold text-slate-400">
                    Original PDF: {scan.sourceFileId ?? "Stored with evidence"}
                  </p>
                )}
              </div>
            ))}
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

function ChartCard({
  chart,
  color = getChartColor(chart.id),
  description = "Structured values extracted from BodySpec PDFs.",
  label = chart.label,
  suffix = chart.suffix,
}) {
  return (
    <Card className="space-y-3" padding="sm">
      <div>
        <h3 className="text-base font-extrabold text-slate-950">
          {label} Trend
        </h3>
        <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
          {description}
        </p>
      </div>
      <ProgressLineChart
        ariaLabel={`DEXA ${label} trend`}
        color={color}
        metricLabel={label}
        points={chart.points}
        suffix={suffix}
      />
    </Card>
  );
}

function getChartColor(id) {
  const colors = {
    androidGynoidRatio: "var(--chart-4)",
    bodyFatPercentage: "var(--chart-1)",
    fatMass: "var(--chart-3)",
    leanMass: "var(--chart-2)",
    rmr: "var(--chart-5)",
    vatMass: "var(--chart-4)",
  };

  return colors[id] ?? "var(--chart-line-primary)";
}

function Delta({ label, value }) {
  return (
    <div className="rounded-[12px] bg-[var(--surface-muted)] p-2 text-center">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-extrabold text-slate-800">{value}</p>
    </div>
  );
}

function MetricRows({ rows }) {
  return (
    <div className="space-y-2">
      {rows.map(([label, value, unit]) => (
        <div
          className="flex items-center justify-between rounded-[12px] bg-[var(--surface-muted)] px-3 py-2"
          key={label}
        >
          <p className="text-sm font-bold text-slate-600">{label}</p>
          <p className="text-sm font-extrabold text-slate-950">
            {Number.isFinite(value) ? `${value.toFixed(1)}${unit}` : "Pending"}
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

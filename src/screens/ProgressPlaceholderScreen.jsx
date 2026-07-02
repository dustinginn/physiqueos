import Link from "next/link";
import { ArrowLeft, ClipboardList } from "lucide-react";
import EvidenceReportContext from "../components/progress/EvidenceReportContext";
import ProgressPhotoGallery from "../components/progress/ProgressPhotoGallery";
import ReportDrawer from "../components/progress/ReportDrawer";
import Card from "../components/ui/Card";
import IconBadge from "../components/ui/IconBadge";

export default function ProgressPlaceholderScreen({ from, report }) {
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
          <IconBadge
            className="rounded-full"
            color={report.tone}
            icon={ClipboardList}
            size="lg"
          />
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-indigo-600">
              Evidence Report
            </p>
            <h1 className="mt-1 text-3xl font-extrabold leading-tight text-slate-950">
              {report.title}
            </h1>
            <p className="mt-2 text-base leading-7 text-slate-500">
              Evidence records and source context for this stream.
            </p>
          </div>
        </header>

        <EvidenceReportContext
          mode="related-goals"
          relatedGoals={report.relatedGoals}
        />

        {report.id !== "photos" && (
          <Card className="space-y-3">
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
                  Latest
                </p>
                <p className="mt-1 text-2xl font-extrabold text-slate-950">
                  {report.metric}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
                  History
                </p>
                <p className="mt-1 text-sm font-extrabold text-slate-700">
                  {report.history}
                </p>
              </div>
            </div>
            <p className="text-sm font-semibold leading-6 text-slate-500">
              {report.trend}
            </p>
            {report.educationalContext && (
              <p className="rounded-[12px] bg-[var(--surface-muted)] p-3 text-sm font-medium leading-5 text-[var(--text-secondary)]">
                {report.educationalContext}
              </p>
            )}
          </Card>
        )}

        {report.id === "photos" && (
          <ProgressPhotoGallery
            latestPhotoSet={report.latestPhotoSet}
            records={report.entries}
            sets={report.photoSets}
          />
        )}

        {report.expandableRecords?.length > 0 && (
          <Card className="mt-4 space-y-3">
            <h2 className="text-lg font-extrabold text-slate-950">
              Protocol Intelligence
            </h2>
            <div className="space-y-2">
              {report.expandableRecords.map((record) => (
                <details
                  className="rounded-[12px] border border-[var(--divider)] bg-[var(--surface-muted)] p-3"
                  key={record.id}
                >
                  <summary className="cursor-pointer text-sm font-extrabold text-slate-950">
                    {record.title}
                  </summary>
                  <p className="mt-2 text-xs font-bold text-slate-500">
                    {record.detail}
                  </p>
                  <p className="mt-2 text-xs font-medium leading-5 text-slate-500">
                    {record.education}
                  </p>
                </details>
              ))}
            </div>
          </Card>
        )}

        {report.id !== "photos" && (
          <div className="mt-4">
            <ReportDrawer
              description="Evidence records for this stream."
              preview={<RecordPreview entries={report.entries.slice(0, 3)} />}
              title="Available Records"
            >
              <RecordPreview entries={report.entries} />
            </ReportDrawer>
          </div>
        )}

        <EvidenceReportContext
          dataSources={report.dataSources}
          mode="data-sources"
        />
      </div>
    </main>
  );
}

function RecordPreview({ entries }) {
  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <div
          className="flex items-center justify-between gap-3 rounded-[12px] bg-[var(--surface-muted)] p-3"
          key={entry.id ?? `${entry.label}-${entry.value}`}
        >
          <div>
            <p className="text-sm font-bold text-slate-700">{entry.label}</p>
            {entry.detail && (
              <p className="mt-0.5 text-xs font-medium text-slate-500">
                {entry.detail}
              </p>
            )}
          </div>
          <p className="text-right text-sm font-extrabold text-slate-950">
            {entry.value}
          </p>
        </div>
      ))}
    </div>
  );
}

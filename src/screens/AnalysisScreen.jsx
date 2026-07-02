import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import Card from "../components/ui/Card";
import ActionButton from "../components/ui/ActionButton";
import IconBadge from "../components/ui/IconBadge";

export default function AnalysisScreen({ analysis }) {
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

        <div className="mb-6 space-y-3">
          <IconBadge icon={CheckCircle2} color="success" size="md" />
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-indigo-600">
              Latest Analysis
            </p>
            <h1 className="text-3xl font-extrabold leading-tight text-slate-950">
              {analysis.title}
            </h1>
            <p className="text-base leading-7 text-slate-500">
              {analysis.summary}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <AnalysisSection
            title="What changed"
            items={analysis.findings.map((finding) => ({
              label: finding.title,
              detail: finding.detail,
            }))}
          />

          <AnalysisSection
            title="Confidence impact"
            items={[
              {
                label: formatConfidenceChange(analysis),
                detail:
                  "Confidence describes PhysiqueOS model certainty, not your chance of success.",
              },
            ]}
          />

          <AnalysisSection
            title="Today's recommendation"
            items={[
              {
                label: analysis.recommendation.title,
                detail: analysis.recommendation.rationale,
              },
            ]}
          />

          <ActionButton href="/">Continue</ActionButton>
        </div>
      </div>
    </main>
  );
}

function AnalysisSection({ title, items }) {
  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-bold text-slate-950">{title}</h2>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={`${title}-${item.label}`} className="space-y-1">
            <p className="text-base font-semibold text-slate-900">{item.label}</p>
            <p className="text-sm leading-6 text-slate-500">{item.detail}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function formatConfidenceChange(analysis) {
  if (
    analysis.confidenceBefore === null ||
    analysis.confidenceAfter === null
  ) {
    return "Confidence ready to update";
  }

  const before = Math.round(analysis.confidenceBefore * 100);
  const after = Math.round(analysis.confidenceAfter * 100);

  if (after === before) return `Confidence held at ${after}%`;

  return `Confidence moved from ${before}% to ${after}%`;
}

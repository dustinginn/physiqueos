import Link from "next/link";
import Card from "../ui/Card";

export default function EvidenceReportContext({
  dataSources = [],
  mode = "all",
  relatedGoals = [],
}) {
  if (mode === "related-goals") {
    return <RelatedGoalsCard relatedGoals={relatedGoals} />;
  }

  if (mode === "data-sources") {
    return <DataSourcesCard dataSources={dataSources} />;
  }

  return (
    <>
      <RelatedGoalsCard relatedGoals={relatedGoals} />
      <DataSourcesCard dataSources={dataSources} />
    </>
  );
}

function RelatedGoalsCard({ relatedGoals = [] }) {
  if (relatedGoals.length === 0) return null;

  return (
    <div className="mb-4">
      <Card className="space-y-2" padding="sm">
        <h2 className="text-sm font-extrabold text-slate-950">Related Goals</h2>
        <div className="flex flex-wrap gap-2">
          {relatedGoals.map((goal) => (
            <Link
              className="rounded-full bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] px-3 py-1 text-xs font-extrabold text-[var(--primary)]"
              href={goal.href}
              key={goal.id}
            >
              {goal.title}
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}

function DataSourcesCard({ dataSources = [] }) {
  if (dataSources.length === 0) return null;

  return (
    <Card className="mt-4 space-y-2" padding="sm">
      <h2 className="text-sm font-extrabold text-slate-950">Data Sources</h2>
      <div className="grid gap-2">
        {dataSources.map((source) => (
          <div
            className="flex items-center justify-between text-xs font-bold"
            key={source.name}
          >
            <span className="text-[var(--text-secondary)]">{source.name}</span>
            <span className="text-[var(--text-subtle)]">{source.status}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

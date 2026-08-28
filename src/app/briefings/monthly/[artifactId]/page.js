import Link from "next/link";
import { FounderRepositories } from "../../../../data/repositories/founderRepositories";
import { projectPersistedMonthlyPresentationForRendering } from "../../../../domain/services/MonthlyPersistedArtifactCompatibilityService";
import MonthlyBriefingScreen from "../../../../screens/MonthlyBriefingScreen";
import { createBriefingReconciliationPresentation } from "../../../../domain/services/BriefingReconciliationPresentationService";

export const dynamic = "force-dynamic";

export default async function MonthlyBriefingArtifactPage({ params }) {
  const { artifactId } = await params;
  return FounderRepositories.runInReadScope(async () => {
  const user = await FounderRepositories.users.getCurrentUser();
  const [artifacts, workItems] = user?.id
    ? await Promise.all([
        FounderRepositories.dailyBriefings.listDailyBriefings(user.id),
        FounderRepositories.briefingReconciliationWorkItems.listWorkItems(user.id),
      ])
    : [[], []];
  const artifact = artifacts.find((item) => item.id === artifactId);
  if (!isReadableMonthlyArtifact(artifact, user?.id)) {
    return <MonthlyUnavailableState />;
  }
  const presentation = projectPersistedMonthlyPresentationForRendering(
    artifact.briefing.monthlyPresentation
  );
  const reconciliation = createBriefingReconciliationPresentation({
    publicationRootId: artifact.id,
    workItems,
  });
  return <MonthlyBriefingScreen
    presentation={presentation}
    reconciliation={reconciliation}
  />;
  }, { readModel: "route.monthly-briefing" });
}

function isReadableMonthlyArtifact(artifact, userId) {
  if (!artifact || artifact.userId !== userId) return false;
  if (artifact.artifactType !== "scheduled" || artifact.cadence !== "monthly") {
    return false;
  }
  if (!artifact.briefing?.monthlyPresentation) return false;
  const invalid = new Set(["failed", "in_progress", "invalid", "retired", "superseded"]);
  return ![
    artifact.status,
    artifact.lifecycle?.status,
    artifact.lifecycle?.generationStatus,
  ].filter(Boolean)
    .map((value) => String(value).toLowerCase())
    .some((value) => invalid.has(value));
}

function MonthlyUnavailableState() {
  return (
    <main className="app-surface min-h-screen overflow-x-hidden">
      <div className="mx-auto max-w-[393px] px-4 pb-32 pt-8">
        <Link
          className="inline-flex text-sm font-bold text-[var(--text-secondary)]"
          href="/briefings/review"
        >
          ← Briefing History
        </Link>
        <section className="mt-6 rounded-[24px] border border-[var(--divider)] bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow-card)]">
          <p className="text-xs font-extrabold uppercase tracking-[.1em] text-[var(--primary)]">
            Monthly Briefing
          </p>
          <h1 className="mt-3 text-2xl font-extrabold text-[var(--text-primary)]">
            This briefing is not available.
          </h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-[var(--text-secondary)]">
            A completed Monthly Briefing will appear here after its scheduled delivery.
          </p>
        </section>
      </div>
    </main>
  );
}

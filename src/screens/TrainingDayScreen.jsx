import {
  DeepPageCard,
  InformationList,
  InformationListItem,
} from "../components/deep-page/DeepPagePrimitives";
import MobilePageHeader from "../components/navigation/MobilePageHeader";

export default function TrainingDayScreen({ backHref, day }) {
  const summary = formatDaySummary(day.summary);

  return (
    <main className="app-surface min-h-screen">
      <div className="mx-auto max-w-[393px] px-4 pt-10 pb-24">
        <MobilePageHeader
          description={summary || "Recorded sessions for this local calendar day."}
          parentHref={backHref}
          parentLabel="Recent Training History"
          sectionLabel="Training Day"
          title={day.label}
        />

        <DeepPageCard className="space-y-2.5">
          <h2 className="text-sm font-extrabold text-slate-950">Sessions</h2>
          {day.sessions.length ? (
            <InformationList>
              {day.sessions.map((session) => (
                <InformationListItem
                  detail={session.detail}
                  href={session.href}
                  key={session.id}
                  label={session.title}
                />
              ))}
            </InformationList>
          ) : (
            <p className="text-sm font-semibold leading-6 text-slate-500">
              No active training sessions are recorded for this day.
            </p>
          )}
        </DeepPageCard>
      </div>
    </main>
  );
}

export function formatDaySummary(summary = {}) {
  const parts = [];
  if (summary.bodyAreas?.length) parts.push(summary.bodyAreas.join(" · "));
  if (summary.strengthSessions) {
    parts.push(`${summary.strengthSessions} strength ${summary.strengthSessions === 1 ? "session" : "sessions"}`);
  }
  if (summary.exerciseCount) {
    parts.push(`${summary.exerciseCount} ${summary.exerciseCount === 1 ? "exercise" : "exercises"}`);
  }
  if (summary.hasWalking) parts.push("Walking");
  else if (summary.hasCardio) parts.push("Cardio");
  return parts.join(" · ");
}

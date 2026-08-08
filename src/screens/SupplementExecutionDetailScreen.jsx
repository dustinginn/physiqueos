import Link from "next/link";
import Card from "../components/ui/Card";
import { formatSupplementSupportSummary } from "../domain/services/SupplementSupportManagementService";

export default function SupplementExecutionDetailScreen({ item, protocol, reminder }) {
  return (
    <main className="app-surface min-h-screen">
      <div className="mx-auto max-w-[393px] space-y-5 px-4 pb-28 pt-10">
        <Link
          className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--text-secondary)]"
          href={`/profile/protocols/${encodeURIComponent(protocol.id)}?from=operating-plan`}
        >
          ← Supplement Strategy
        </Link>
        <header>
          <p className="text-xs font-extrabold uppercase tracking-widest text-[var(--primary)]">
            Supplement Support
          </p>
          <h1 className="mt-2 text-3xl font-extrabold">{protocol.name}</h1>
          <p className="mt-2 text-sm font-semibold text-[var(--text-secondary)]">
            {formatSupplementSupportSummary(item)}
          </p>
        </header>
        {!item ? (
          <Card><p className="text-sm font-semibold text-[var(--text-secondary)]">Not configured</p></Card>
        ) : (
          <div className="space-y-3">
            <Row
              label="Dose / Quantity"
              value={[item.dose?.amount, item.dose?.unit].filter(Boolean).join(" ") || "Not specified"}
            />
            <Row label="Schedule" value={formatSupplementSupportSummary(item)} />
            <Row label="Reminder" value={reminder?.active === true ? "Remind me" : "No reminder"} />
            {item.notes && <Row label="Execution Notes" value={item.notes} />}
          </div>
        )}
        <Link
          className="flex min-h-12 items-center justify-center rounded-2xl bg-[var(--primary)] px-4 text-sm font-extrabold text-white"
          href={`/profile/operating-plan/execution/supplements/${encodeURIComponent(protocol.id)}?edit=1`}
        >
          Edit Support
        </Link>
      </div>
    </main>
  );
}

function Row({ label: heading, value }) {
  return (
    <Card className="space-y-1">
      <h2 className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-muted)]">
        {heading}
      </h2>
      <p className="text-sm font-semibold leading-6 text-[var(--text-primary)]">{value}</p>
    </Card>
  );
}

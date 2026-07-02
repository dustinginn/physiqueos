import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import Card from "../components/ui/Card";
import ActionButton from "../components/ui/ActionButton";
import IconBadge from "../components/ui/IconBadge";

export default function PriorityDetailScreen({ completeAction, priority }) {
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
          <IconBadge icon={CheckCircle2} color="primary" size="md" />
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-indigo-600">
              {priority.eyebrow}
            </p>
            <h1 className="text-3xl font-extrabold leading-tight text-slate-950">
              {priority.title}
            </h1>
            <p className="text-base leading-7 text-slate-500">
              {priority.subtitle}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {priority.sections.map((section) => (
            <PrioritySection key={section.title} section={section} />
          ))}

          {priority.completable && completeAction ? (
            <form action={completeAction}>
              <input name="priorityId" type="hidden" value={priority.id} />
              <ActionButton type="submit">Mark Complete</ActionButton>
            </form>
          ) : (
            <ActionButton href={priority.action?.href ?? "/"}>
              {priority.action?.label ?? "Continue"}
            </ActionButton>
          )}
        </div>
      </div>
    </main>
  );
}

function PrioritySection({ section }) {
  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-bold text-slate-950">{section.title}</h2>
      <div className="space-y-3">
        {section.items.map((item) => (
          <div key={`${section.title}-${item.label}`} className="space-y-1">
            <p className="text-base font-semibold text-slate-900">{item.label}</p>
            <p className="text-sm leading-6 text-slate-500">{item.detail}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

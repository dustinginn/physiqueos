import Link from "next/link";
import { ArrowRight, Brain } from "lucide-react";
import Card from "../ui/Card";
import IconBadge from "../ui/IconBadge";
import SectionTitle from "../ui/SectionTitle";
import BriefingGenerationButton from "./BriefingGenerationButton";

export default function LatestAnalysisCard({
  sectionLabel = "Latest Analysis",
  title,
  createdAt,
  prompt = "See what's changed.",
  href,
  action,
  actionLabel,
  historicalFallback,
}) {
  const content = (
    <Card as="section" padding="sm">
      <SectionTitle
        title={sectionLabel}
        action={
          href ? (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-bold text-[#4F46E5]"
            >
              View
              <ArrowRight size={14} strokeWidth={2.5} />
            </span>
          ) : null
        }
      />

      <div className="mt-3 flex items-start gap-2.5">
        <IconBadge icon={Brain} color="evidence" size="md" />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-[16px] font-bold leading-tight text-[#0B1020]">
              {title}
            </h3>
            {createdAt && (
              <span className="shrink-0 text-[11px] font-semibold text-[#64748B]">
                {formatRelativeDate(createdAt)}
              </span>
            )}
          </div>

          <p className="mt-1.5 text-[13px] font-medium leading-5 text-[#64748B]">
            {prompt}
          </p>
          {action && (
            <form action={action}>
              <BriefingGenerationButton label={actionLabel} />
            </form>
          )}
          {historicalFallback && (
            <Link
              className="mt-3 inline-flex min-h-11 items-center text-xs font-bold text-[var(--text-secondary)]"
              href={historicalFallback.href}
            >
              {historicalFallback.label}
            </Link>
          )}
        </div>
      </div>
    </Card>
  );

  if (!href) return content;

  return (
    <Link
      aria-label={`${title}: ${prompt}`}
      className="block"
      href={href}
    >
      {content}
    </Link>
  );
}

function formatRelativeDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  const today = new Date();
  const dateKey = date.toISOString().slice(0, 10);
  const todayKey = today.toISOString().slice(0, 10);

  if (dateKey === todayKey) return "Today";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

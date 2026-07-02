import Link from "next/link";
import { Activity, Compass, Dumbbell, ShieldCheck, Target } from "lucide-react";
import IconBadge from "../ui/IconBadge";
import ProgressBar from "../ui/ProgressBar";

const iconMap = {
  activity: Activity,
  compass: Compass,
  dumbbell: Dumbbell,
  shield: ShieldCheck,
  target: Target,
};

export default function GoalRow({
  title,
  current,
  target,
  unit = "",
  progress = 0,
  primary = false,
  icon = "target",
  color = "success",
  progressColor = "#3BC35B",
  presentation = { mode: "primary_goal" },
  href,
  className = "",
}) {
  const Icon = iconMap[icon] ?? Target;
  const isPrimaryGoal = primary || presentation.mode === "primary_goal";
  const Component = href ? Link : "div";

  return (
    <Component
      className={`grid ${
        isPrimaryGoal
          ? "grid-cols-[38px_minmax(0,1fr)_64px_42px]"
          : "grid-cols-[38px_minmax(0,1fr)_auto]"
      } items-center gap-2 rounded-[12px] transition hover:bg-[var(--surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] ${href ? "cursor-pointer" : ""} ${className}`}
      href={href}
    >
      <IconBadge icon={Icon} color={color} size="md" className="rounded-full" />

      <div className="min-w-0">
        {isPrimaryGoal && (
          <p className="mb-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[#4F46E5]">
            Primary Goal
          </p>
        )}

        <h3 className="truncate text-[15px] font-semibold leading-tight text-[#0B1020]">
          {title}
        </h3>

        <p className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap text-[12px] font-medium text-[#64748B]">
          <span>
            {current}
            {unit}
          </span>
          <span aria-hidden="true">-&gt;</span>
          <span>
            {target}
            {unit}
          </span>
        </p>
      </div>

      {isPrimaryGoal ? (
        <>
          <ProgressBar
            value={progress}
            color={progressColor}
            label={`${title} progress`}
          />

          <div className="text-right">
            <p className="text-[18px] font-bold leading-none" style={{ color: progressColor }}>
              {progress}%
            </p>
            <p className="mt-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-[#64748B]">
              Complete
            </p>
          </div>
        </>
      ) : (
        <div className="min-w-[92px] text-right">
          <p className="text-[13px] font-bold leading-tight text-[#0B1020]">
            {presentation.status ?? current}
          </p>
          <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[#64748B]">
            {presentation.detail ?? presentation.label ?? "Status"}
          </p>
        </div>
      )}
    </Component>
  );
}

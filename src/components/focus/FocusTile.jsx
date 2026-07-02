import {
  Activity,
  Camera,
  Check,
  Moon,
  Scale,
  Syringe,
  Target,
  Utensils,
} from "lucide-react";
import Link from "next/link";
import IconBadge from "../ui/IconBadge";

const iconMap = {
  activity: Activity,
  camera: Camera,
  moon: Moon,
  scale: Scale,
  syringe: Syringe,
  target: Target,
  utensils: Utensils,
};

export default function FocusTile({
  label,
  subtitle,
  metadata,
  completable = false,
  completeAction,
  completionId,
  density = "balanced",
  href,
  icon = "activity",
  color = "primary",
  completed = false,
  onClick,
}) {
  const Icon = iconMap[icon] ?? Activity;
  const showSubtitle = density !== "compact" && subtitle;
  const showMetadata = density === "expanded" && metadata;
  const tone = getToneClasses(color);
  const classes = `
    flex
    min-h-[68px]
    min-w-0
    flex-row
    items-center
    justify-start
    gap-2.5
    rounded-[14px]
    border
    ${tone.border}
    ${tone.background}
    px-2.5
    py-2
    text-left
    shadow-[var(--shadow-card)]
    transition
    duration-200
    ease-out
    ${tone.hover}
    focus-visible:outline
    focus-visible:outline-2
    focus-visible:outline-offset-2
    focus-visible:outline-[var(--primary)]
    active:scale-[0.99]
  `;
  const content = (
    <>
      <IconBadge icon={Icon} color={color} size="xs" className="rounded-full" />

      <span className="flex min-w-0 flex-1 flex-col justify-center">
        <span className="text-[10.5px] font-semibold leading-[1.15] text-[var(--text-primary)]">
          {label}
        </span>
        {showSubtitle && (
          <span className="mt-0.5 text-[10px] font-medium leading-[1.15] text-[var(--text-muted)]">
            {subtitle}
          </span>
        )}
        {showMetadata && (
          <span className="mt-0.5 text-[10px] font-semibold leading-[1.15] text-[var(--text-primary)]">
            {metadata}
          </span>
        )}
      </span>

      <CompletionIndicator
        aria-label={completed ? "Completed" : "Not completed"}
        completed={completed}
      />
    </>
  );

  if (href && completable && completeAction && completionId && !completed) {
    return (
      <div className={classes}>
        <Link className="contents" href={href}>
          <IconBadge icon={Icon} color={color} size="xs" className="rounded-full" />

          <span className="flex min-w-0 flex-1 flex-col justify-center">
            <span className="text-[10.5px] font-semibold leading-[1.15] text-[var(--text-primary)]">
              {label}
            </span>
            {showSubtitle && (
              <span className="mt-0.5 text-[10px] font-medium leading-[1.15] text-[var(--text-muted)]">
                {subtitle}
              </span>
            )}
            {showMetadata && (
              <span className="mt-0.5 text-[10px] font-semibold leading-[1.15] text-[var(--text-primary)]">
                {metadata}
              </span>
            )}
          </span>
        </Link>

        <form action={completeAction} className="shrink-0">
          <input name="priorityId" type="hidden" value={completionId} />
          <button
            aria-label={`Mark ${label} complete`}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--divider)] bg-[var(--surface)] text-transparent transition hover:border-[var(--confidence)] hover:text-[var(--confidence)]"
            type="submit"
          >
            <Check size={13} strokeWidth={2.5} aria-hidden="true" />
          </button>
        </form>
      </div>
    );
  }

  if (href) {
    return (
      <Link className={classes} href={href}>
        {content}
      </Link>
    );
  }

  return (
    <button
      className={classes}
      onClick={onClick}
      type="button"
    >
      {content}
    </button>
  );
}

function CompletionIndicator({ completed, ...props }) {
  return (
    <span
      className={`
        flex
        h-5
        w-5
        shrink-0
        items-center
        justify-center
        rounded-full
        border
        ${
          completed
            ? "border-[var(--confidence)] bg-[var(--confidence)] text-white"
            : "border-[var(--divider)] bg-[var(--surface)] text-transparent"
        }
      `}
      {...props}
    >
      <Check size={12} strokeWidth={2.5} aria-hidden="true" />
    </span>
  );
}

function getToneClasses(color) {
  const tones = {
    primary: {
      background: "bg-[var(--surface-elevated)]",
      border: "border-[color-mix(in_srgb,var(--primary)_22%,var(--divider))]",
      hover: "hover:bg-[var(--surface-muted)] hover:border-[color-mix(in_srgb,var(--primary)_42%,var(--divider))]",
    },
    success: {
      background: "bg-[var(--surface-elevated)]",
      border: "border-[color-mix(in_srgb,var(--chart-1)_24%,var(--divider))]",
      hover: "hover:bg-[var(--surface-muted)] hover:border-[color-mix(in_srgb,var(--chart-1)_45%,var(--divider))]",
    },
    warning: {
      background: "bg-[var(--surface-elevated)]",
      border: "border-[color-mix(in_srgb,var(--chart-3)_24%,var(--divider))]",
      hover: "hover:bg-[var(--surface-muted)] hover:border-[color-mix(in_srgb,var(--chart-3)_45%,var(--divider))]",
    },
    effort: {
      background: "bg-[var(--surface-elevated)]",
      border: "border-[color-mix(in_srgb,var(--chart-3)_24%,var(--divider))]",
      hover: "hover:bg-[var(--surface-muted)] hover:border-[color-mix(in_srgb,var(--chart-3)_45%,var(--divider))]",
    },
    evidence: {
      background: "bg-[var(--surface-elevated)]",
      border: "border-[color-mix(in_srgb,var(--chart-2)_24%,var(--divider))]",
      hover: "hover:bg-[var(--surface-muted)] hover:border-[color-mix(in_srgb,var(--chart-2)_45%,var(--divider))]",
    },
  };

  return tones[color] ?? tones.primary;
}

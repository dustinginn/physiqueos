import { ChevronRight } from "lucide-react";
import Link from "next/link";
import IconBadge from "./IconBadge";

export default function ActionButton({
  children,
  icon,
  endIcon: EndIcon = ChevronRight,
  href,
  onClick,
  type = "button",
  className = "",
  "aria-label": ariaLabel,
}) {
  const content = (
    <>
      <span className="flex min-w-0 items-center gap-3">
        {icon && <IconBadge icon={icon} color="surface" size="sm" />}

        <span className="min-w-0 text-[17px] font-semibold leading-tight text-white">
          {children}
        </span>
      </span>

      {EndIcon && (
        <EndIcon
          aria-hidden="true"
          className="shrink-0 text-white transition-transform duration-200 ease-out group-hover:translate-x-1"
          size={22}
          strokeWidth={2.4}
        />
      )}
    </>
  );

  const classes = `
    group
    flex
    min-h-12
    w-full
    items-center
    justify-between
    gap-4
    rounded-[14px]
    bg-[var(--primary)]
    bg-gradient-to-r
    from-[var(--primary)]
    to-[color-mix(in_srgb,var(--primary)_84%,#ffffff)]
    px-4
    py-3
    text-left
    shadow-[0_12px_28px_rgba(79,70,229,0.22)]
    transition
    duration-200
    ease-out
    hover:brightness-105
    focus-visible:outline
    focus-visible:outline-2
    focus-visible:outline-offset-2
    focus-visible:outline-[var(--primary)]
    active:scale-[0.99]
    ${className}
  `;

  if (href) {
    return (
      <Link
        aria-label={ariaLabel}
        className={classes}
        href={href}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      aria-label={ariaLabel}
      className={classes}
      onClick={onClick}
      type={type}
    >
      {content}
    </button>
  );
}

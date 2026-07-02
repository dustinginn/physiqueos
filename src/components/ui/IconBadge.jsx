export default function IconBadge({
  icon: Icon,
  color = "primary",
  size = "md",
  className = "",
}) {
  const colors = {
    primary: "bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] text-[var(--primary)]",
    success: "bg-[color-mix(in_srgb,var(--chart-1)_16%,transparent)] text-[var(--chart-1)]",
    evidence: "bg-[color-mix(in_srgb,var(--chart-2)_16%,transparent)] text-[var(--chart-2)]",
    effort: "bg-[color-mix(in_srgb,var(--chart-3)_16%,transparent)] text-[var(--chart-3)]",
    warning: "bg-[color-mix(in_srgb,var(--chart-3)_16%,transparent)] text-[var(--chart-3)]",
    danger: "bg-[color-mix(in_srgb,var(--destructive)_14%,transparent)] text-[var(--destructive)]",
    muted: "bg-[var(--surface-muted)] text-[var(--text-primary)]",
    surface: "bg-[var(--surface)] text-[var(--primary)]",
    plain: "bg-transparent text-[var(--text-primary)]",
  };

  const sizes = {
    xs: "h-7 w-7",
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-12 w-12",
  };

  const iconSizes = {
    xs: 14,
    sm: 16,
    md: 18,
    lg: 22,
  };
  const colorClass = colors[color] ?? colors.primary;
  const sizeClass = sizes[size] ?? sizes.md;
  const iconSize = iconSizes[size] ?? iconSizes.md;

  return (
    <span
      className={`
        inline-flex
        shrink-0
        items-center
        justify-center
        rounded-[10px]
        ${colorClass}
        ${sizeClass}
        ${className}
      `}
    >
      <Icon size={iconSize} strokeWidth={2.3} aria-hidden="true" />
    </span>
  );
}

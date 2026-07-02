export default function Card({
  children,
  className = "",
  padding = "md",
  as: Component = "div",
  variant = "elevated",
  ...props
}) {
  const paddings = {
    none: "",
    sm: "p-3.5",
    md: "p-4",
    lg: "p-5",
  };
  const variants = {
    accent: "bg-[var(--surface-accent)]",
    elevated: "bg-[var(--surface-elevated)]",
    inset: "bg-[var(--surface-inset)]",
    soft: "bg-[var(--surface-soft)]",
    success: "bg-[var(--surface-success)]",
    surface: "bg-[var(--surface)]",
    warning: "bg-[var(--surface-warning)]",
  };

  return (
    <Component
      {...props}
      className={`
        rounded-[14px]
        border
        border-[var(--divider)]
        text-[var(--text-primary)]
        shadow-[var(--shadow-card)]
        ${variants[variant] ?? variants.elevated}
        ${paddings[padding] ?? paddings.md}
        ${className}
      `}
    >
      {children}
    </Component>
  );
}

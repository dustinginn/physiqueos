import {
  BarChart3,
  Home,
  MessageCircle,
  MoreHorizontal,
  PlusCircle,
  Target,
  User,
} from "lucide-react";

const iconMap = {
  coach: MessageCircle,
  goals: Target,
  home: Home,
  log: PlusCircle,
  more: MoreHorizontal,
  profile: User,
  progress: BarChart3,
};

export default function BottomNavItem({
  active = false,
  badge,
  href,
  icon = "home",
  label,
  onClick,
  route,
}) {
  const Icon = iconMap[icon] ?? Home;
  const Component = href ? "a" : "button";

  return (
    <Component
      aria-current={active ? "page" : undefined}
      className={`
        relative
        flex
        min-h-10
        min-w-0
        flex-1
        flex-col
        items-center
        justify-center
        gap-1
        rounded-[12px]
        px-1
        text-center
        transition
        duration-200
        ease-out
        ${
          active
            ? "text-[var(--primary)]"
            : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        }
      `}
      data-route={route}
      href={href}
      onClick={onClick}
      type={href ? undefined : "button"}
    >
      <span className="relative">
        <Icon
          aria-hidden="true"
          fill={active ? "currentColor" : "none"}
          size={20}
          strokeWidth={2.4}
        />

        {badge && (
          <span className="absolute -right-2 -top-1 h-2 w-2 rounded-full bg-[#EF4444]" />
        )}
      </span>

      <span
        className={`
          truncate
          text-[11px]
          leading-none
          ${active ? "font-semibold" : "font-medium"}
        `}
      >
        {label}
      </span>
    </Component>
  );
}

import BottomNavItem from "./BottomNavItem";

export default function BottomNavigation({
  items = [],
  onNavigate,
}) {
  return (
    <nav
      aria-label="Primary navigation"
      className="
        rounded-[22px]
        border
        border-[var(--divider)]
        bg-[var(--nav-bg)]
        px-2.5
        py-2.5
        shadow-[var(--nav-shadow)]
        backdrop-blur
      "
    >
      <div className="flex items-center justify-between gap-1">
        {items.map((item) => (
          <BottomNavItem
            key={item.route}
            {...item}
            onClick={onNavigate ? () => onNavigate(item) : undefined}
          />
        ))}
      </div>
    </nav>
  );
}

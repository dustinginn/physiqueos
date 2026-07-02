import Card from "../ui/Card";
import SectionTitle from "../ui/SectionTitle";
import FocusTile from "../focus/FocusTile";

export default function TodaysFocusCard({
  completeAction,
  items = [],
  onItemClick,
}) {
  if (items.length === 0) return null;

  const gridClass = items.length === 1 ? "grid-cols-1" : "grid-cols-2";
  const density =
    items.length === 1 ? "expanded" : items.length === 2 ? "balanced" : "compact";

  return (
    <Card as="section" padding="sm">
      <SectionTitle title="Today's Priorities" />

      <div className={`mt-2.5 grid ${gridClass} gap-2`}>
        {items.map((item) => (
          <FocusTile
            key={item.id}
            {...item}
            completeAction={completeAction}
            density={density}
            onClick={onItemClick ? () => onItemClick(item) : undefined}
          />
        ))}
      </div>
    </Card>
  );
}

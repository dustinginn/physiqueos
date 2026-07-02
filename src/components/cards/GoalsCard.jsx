import Card from "../ui/Card";
import SectionTitle from "../ui/SectionTitle";
import GoalRow from "../goals/GoalRow";

export default function GoalsCard({ goals = [] }) {
  return (
    <Card as="section" padding="sm">
      <SectionTitle title="Your Goals" />

      <div className="mt-3 space-y-1">
        {goals.map((goal) => (
          <GoalRow
            key={goal.id}
            className="py-2"
            {...goal}
          />
        ))}
      </div>
    </Card>
  );
}

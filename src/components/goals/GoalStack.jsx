import GoalRow from "./GoalRow";
import Section from "../ui/Section";
import { goals } from "../../fixtures/goals";
import { GoalEngine } from "../../lib/GoalEngine";

export default function GoalStack() {
  return (
    <Section
      eyebrow="Goals"
      title="Your trajectory"
      action={
        <button className="text-sm font-medium text-indigo-600">
          View All
        </button>
      }
    >
      <div className="space-y-4">
        {goals.map((goal) => {
          const result = GoalEngine.evaluate(goal);

          return (
            <GoalRow
              key={goal.id}
              primary={goal.primary}
              title={goal.title}
              current={goal.current}
              target={goal.target}
              unit={goal.unit}
              progress={result.progress}
              projected={goal.projected}
            />
          );
        })}
      </div>
    </Section>
  );
}
export function calculateProgress(goal) {
  if (!goal.primary) return goal.progress;

  const total = Math.abs(goal.start - goal.target);
  const completed = Math.abs(goal.start - goal.current);

  if (total === 0) return 0;

  return Math.max(
    0,
    Math.min(100, Math.round((completed / total) * 100))
  );
}
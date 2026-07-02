export class GoalEngine {
  static evaluate(goal) {
    const progress = this.calculateProgress(goal);

    return {
      progress,
      trend: this.calculateTrend(goal),
      confidence: this.calculateConfidence(goal),
      pace: this.calculatePace(goal),
      recommendation: this.recommendation(goal, progress),
    };
  }

  static calculateProgress(goal) {
    if (goal.progress !== undefined) {
      return goal.progress;
    }

    const total = Math.abs(goal.start - goal.target);

    const completed = Math.abs(goal.start - goal.current);

    if (total === 0) return 0;

    return Math.round((completed / total) * 100);
  }

  static calculateTrend() {
    return "Improving";
  }

  static calculateConfidence() {
    return 94;
  }

  static calculatePace() {
    return "Ahead";
  }

  static recommendation(goal, progress) {
    if (progress > 80) {
      return "Stay consistent.";
    }

    if (progress > 50) {
      return "Keep doing what you're doing.";
    }

    return "Focus on today's habits.";
  }
}
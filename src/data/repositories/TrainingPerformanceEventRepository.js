export function createTrainingPerformanceEventRepository(events = []) {
  return {
    async listTrainingPerformanceEvents() {
      return structuredClone(events);
    },
    async getTrainingPerformanceEventById(eventId) {
      return structuredClone(events.find((event) => event.id === eventId) ?? null);
    },
    async listTrainingPerformanceEventsBySession(sourceSessionId) {
      return structuredClone(
        events.filter((event) => event.sourceSessionId === sourceSessionId)
      );
    },
  };
}

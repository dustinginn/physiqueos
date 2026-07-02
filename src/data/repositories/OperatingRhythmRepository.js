export function createOperatingRhythmRepository(operatingRhythm = null) {
  return {
    async getOperatingRhythm(userId) {
      if (!operatingRhythm || operatingRhythm.userId !== userId) return null;

      return operatingRhythm;
    },
  };
}

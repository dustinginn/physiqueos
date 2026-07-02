export function createAdaptiveTrustRepository(adaptiveTrustProfile = null) {
  return {
    async getAdaptiveTrustProfile(userId) {
      if (!adaptiveTrustProfile || adaptiveTrustProfile.userId !== userId) return null;

      return adaptiveTrustProfile;
    },
  };
}

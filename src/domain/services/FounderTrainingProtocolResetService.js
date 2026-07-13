import { TRAINING_PROTOCOL_ID, TRAINING_PROTOCOL_TYPE } from "./TrainingProtocolBuilderService";

export function createFounderTrainingProtocolResetService({ repositories }) {
  return {
    async resetBuilderTrainingProtocol({ userId, resetAt = new Date().toISOString() }) {
      const protocol = await repositories.protocols.getProtocolById(TRAINING_PROTOCOL_ID);
      if (!protocol) return { reset: false, reason: "not_found" };
      if (protocol.userId !== userId || protocol.protocolType !== TRAINING_PROTOCOL_TYPE) {
        throw new Error("Founder Training reset refused: protocol identity did not match.");
      }

      const versions = await repositories.protocolVersions.listVersions(protocol.id);
      const builderCreated = versions.length > 0 && versions.every((version) =>
        version.author?.id === userId &&
        version.author?.displayName === "Founder" &&
        version.change?.reason === "Define the training strategy for maintenance and long-term progression."
      );
      if (!builderCreated) {
        throw new Error("Founder Training reset refused: version provenance did not match the Training Builder.");
      }

      for (const version of versions) {
        await repositories.protocolVersions.supersedeVersion(version.id, { endedAt: resetAt });
      }
      const archived = await repositories.protocols.updateProtocol(protocol.id, {
        status: "archived",
        currentVersionId: null,
        updatedAt: resetAt,
      });

      return {
        reset: true,
        protocol: archived,
        versionIds: versions.map((version) => version.id),
      };
    },
  };
}

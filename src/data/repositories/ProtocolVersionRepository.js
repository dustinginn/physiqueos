import { ProtocolVersionStatus } from "../../domain/models/protocolVersion";

export function createProtocolVersionRepository(protocolVersions = [], options = {}) {
  return {
    async listVersions(protocolId) {
      return protocolVersions
        .filter((version) => version.protocolId === protocolId)
        .sort((left, right) => left.versionNumber - right.versionNumber)
        .map(clone);
    },

    async getVersionById(versionId) {
      return clone(protocolVersions.find((version) => version.id === versionId) ?? null);
    },

    async getCurrentVersion(protocolId) {
      return clone(
        protocolVersions.find(
          (version) =>
            version.protocolId === protocolId &&
            version.status === ProtocolVersionStatus.ACTIVE &&
            !version.endedAt
        ) ?? null
      );
    },

    async appendVersion(version) {
      if (protocolVersions.some((item) => item.id === version.id)) {
        throw new Error("Protocol version ids are immutable and must be unique.");
      }
      const record = clone(version);
      protocolVersions.push(record);
      options.onChange?.();
      return clone(record);
    },

    async supersedeVersion(versionId, { endedAt }) {
      const index = protocolVersions.findIndex((version) => version.id === versionId);
      if (index < 0) return null;
      if (protocolVersions[index].status !== ProtocolVersionStatus.ACTIVE) {
        return clone(protocolVersions[index]);
      }

      protocolVersions[index] = {
        ...protocolVersions[index],
        status: ProtocolVersionStatus.SUPERSEDED,
        endedAt,
      };
      options.onChange?.();
      return clone(protocolVersions[index]);
    },
  };
}

function clone(value) {
  return value === null || value === undefined
    ? value
    : structuredClone(value);
}

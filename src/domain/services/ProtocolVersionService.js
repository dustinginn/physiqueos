import { createProtocol, ProtocolStatus } from "../models/protocol";
import {
  createProtocolVersion,
  validateProtocolVersion,
} from "../models/protocolVersion";

export function createProtocolVersionService({ repositories }) {
  return {
    async activateInitialProtocol({ protocol: protocolInput, version: versionInput }) {
      const active = await repositories.protocols.getActiveProtocolByType(
        protocolInput.userId,
        protocolInput.protocolType
      );
      if (active) {
        throw new Error(`An active ${protocolInput.protocolType} protocol already exists.`);
      }

      const now = versionInput.createdAt || new Date().toISOString();
      const historicalVersions = await repositories.protocolVersions.listVersions(protocolInput.id);
      const previousVersion = historicalVersions.at(-1) ?? null;
      const nextVersionNumber = previousVersion ? previousVersion.versionNumber + 1 : 1;
      const root = createProtocol({
        ...protocolInput,
        status: ProtocolStatus.ACTIVE,
        createdAt: protocolInput.createdAt || now,
        updatedAt: now,
      });
      const version = createProtocolVersion({
        ...versionInput,
        id: previousVersion ? `${root.id}_v${nextVersionNumber}` : versionInput.id,
        protocolId: root.id,
        versionNumber: nextVersionNumber,
        status: "active",
        change: {
          ...versionInput.change,
          previousVersionId: previousVersion?.id ?? versionInput.change?.previousVersionId ?? null,
        },
        createdAt: now,
      });
      const validation = validateProtocolVersion(version);
      if (!validation.valid) throw new Error(validation.errors.join(" "));

      root.currentVersionId = version.id;
      await repositories.protocolVersions.appendVersion(version);
      await repositories.protocols.saveProtocol(root);

      return { protocol: root, version };
    },
  };
}

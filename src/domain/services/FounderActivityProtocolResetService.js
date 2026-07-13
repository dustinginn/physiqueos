import { ACTIVITY_PROTOCOL_ID, ACTIVITY_PROTOCOL_TYPE } from "./ActivityProtocolBuilderService";

export function createFounderActivityProtocolResetService({ repositories }) {
  return { async resetStandaloneActivityProtocol({ userId, resetAt = new Date().toISOString() }) {
    const protocol = await repositories.protocols.getProtocolById(ACTIVITY_PROTOCOL_ID);
    if (!protocol) return { reset: false, reason: "not_found" };
    if (protocol.userId !== userId || protocol.protocolType !== ACTIVITY_PROTOCOL_TYPE) throw new Error("Founder Activity reset refused: protocol identity did not match.");
    const versions = await repositories.protocolVersions.listVersions(protocol.id);
    if (!versions.length || !versions.every((version) => version.author?.id === userId && version.change?.reason === "Formalize the activity strategy supporting the current cut.")) throw new Error("Founder Activity reset refused: version provenance did not match the Activity Builder.");
    for (const version of versions) await repositories.protocolVersions.supersedeVersion(version.id, { endedAt: resetAt });
    const archived = await repositories.protocols.updateProtocol(protocol.id, { status: "archived", currentVersionId: null, updatedAt: resetAt });
    return { reset: true, protocol: archived, versionIds: versions.map((version) => version.id) };
  }};
}

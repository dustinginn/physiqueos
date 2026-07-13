import { ProtocolStatus } from "../../domain/models/protocol";
import { seedProtocols } from "../seed/protocols";
import { byUserId } from "./repositoryUtils";

export function createProtocolRepository(protocols = [], options = {}) {
  return {
    async listProtocols(userId) {
      return byUserId(protocols, userId);
    },

    async listActiveProtocols(userId) {
      return protocols.filter(
        (protocol) =>
          protocol.userId === userId && protocol.status === ProtocolStatus.ACTIVE
      );
    },

    async getProtocolById(protocolId) {
      return protocols.find((protocol) => protocol.id === protocolId) ?? null;
    },

    async getActiveProtocolByType(userId, protocolType) {
      return protocols.find(
        (protocol) =>
          protocol.userId === userId &&
          protocol.protocolType === protocolType &&
          protocol.status === ProtocolStatus.ACTIVE
      ) ?? null;
    },

    async saveProtocol(protocol) {
      const existingIndex = protocols.findIndex((item) => item.id === protocol.id);

      if (existingIndex >= 0) {
        protocols[existingIndex] = protocol;
      } else {
        protocols.push(protocol);
      }

      options.onChange?.();

      return protocol;
    },

    async updateProtocol(protocolId, patch) {
      const protocol = protocols.find((item) => item.id === protocolId);

      if (!protocol) return null;

      const updatedProtocol = { ...protocol, ...patch };
      const protocolIndex = protocols.findIndex((item) => item.id === protocolId);

      protocols[protocolIndex] = updatedProtocol;
      options.onChange?.();

      return updatedProtocol;
    },
  };
}

export const ProtocolRepository = createProtocolRepository(seedProtocols);

import Foundation

/// Bounded production roll-up for Recovery, Peptide, and Supplement
/// strategies. The server resolves protocol/execution/version relationships
/// and sends only presentation fields plus typed Native destinations.
protocol OperatingPlanProtocolDomainAPI: Sendable {
    func fetchDomain(protocolId: String) async throws -> OperatingPlanProtocolDomainReadModel?
}

struct ProductionOperatingPlanProtocolDomainAPI: OperatingPlanProtocolDomainAPI {
    let api: ProductionNativeAPI

    func fetchDomain(protocolId: String) async throws -> OperatingPlanProtocolDomainReadModel? {
        try await api.readResource(
            "operating-plan-protocol-domain",
            query: ["protocolId": protocolId],
            as: OperatingPlanProtocolDomainReadModel.self
        ).data
    }
}

struct NotAvailableOperatingPlanProtocolDomainAPI: OperatingPlanProtocolDomainAPI {
    struct NotAvailable: Error {}
    func fetchDomain(protocolId: String) async throws -> OperatingPlanProtocolDomainReadModel? {
        throw NotAvailable()
    }
}

import Foundation

/// Mirrors `HomeAPI`/`LogAPI`'s pattern: the seam `EvidenceView` depends on
/// instead of a concrete transport.
protocol EvidenceAPI: Sendable {
    func fetchEvidenceHub() async throws -> EvidenceHubReadModel
}

/// Fixture-backed conformance: decodes the same bundled JSON a live
/// implementation would eventually receive over the network, through the
/// same `EvidenceHubReadModel` decode path.
struct FixtureEvidenceAPI: EvidenceAPI {
    enum FixtureError: Error {
        case resourceNotFound
    }

    func fetchEvidenceHub() async throws -> EvidenceHubReadModel {
        guard let url = Bundle.main.url(forResource: "EvidenceFixture", withExtension: "json") else {
            throw FixtureError.resourceNotFound
        }
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(EvidenceHubReadModel.self, from: data)
    }
}

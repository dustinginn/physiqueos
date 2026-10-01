import Foundation

/// Mirrors `HomeAPI`'s pattern: the seam `LogView` depends on instead of a
/// concrete transport.
protocol LogAPI: Sendable {
    func fetchLog() async throws -> LogReadModel
    /// A fresh read (never the short read cache) for surfaces waiting on
    /// Server-side processing.
    func refreshLog() async throws -> LogReadModel
}

extension LogAPI {
    func refreshLog() async throws -> LogReadModel { try await fetchLog() }
}

/// Fixture-backed conformance: decodes the same bundled JSON a live
/// implementation would eventually receive over the network, through the
/// same `LogReadModel` decode path.
struct FixtureLogAPI: LogAPI {
    enum FixtureError: Error {
        case resourceNotFound
    }

    func fetchLog() async throws -> LogReadModel {
        guard let url = Bundle.main.url(forResource: "LogFixture", withExtension: "json") else {
            throw FixtureError.resourceNotFound
        }
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(LogReadModel.self, from: data)
    }
}

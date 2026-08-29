import Foundation

/// The seam a screen depends on instead of a concrete transport. Home only
/// needs a Home read today; later screens add their own methods here (or to
/// sibling protocols) as they're built — this file is not a place to
/// pre-declare methods no screen calls yet.
protocol HomeAPI: Sendable {
    func fetchHome() async throws -> HomeReadModel
}

/// Fixture-backed conformance: decodes the same bundled JSON a live
/// implementation would eventually receive over the network, through the
/// same `HomeReadModel` decode path. Swapping this for a live
/// `URLSession`-backed conformance later requires no change to
/// `HomeReadModel`, `HomeViewModel`, or any view — only a new type
/// satisfying `HomeAPI`, wired in `AppEnvironment`.
struct FixtureHomeAPI: HomeAPI {
    enum FixtureError: Error {
        case resourceNotFound
    }

    func fetchHome() async throws -> HomeReadModel {
        guard let url = Bundle.main.url(forResource: "HomeFixture", withExtension: "json") else {
            throw FixtureError.resourceNotFound
        }
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(HomeReadModel.self, from: data)
    }
}

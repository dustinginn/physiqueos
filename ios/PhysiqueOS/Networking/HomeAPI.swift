import Foundation

/// The seam a screen depends on instead of a concrete transport. Home only
/// needs a Home read today; later screens add their own methods here (or to
/// sibling protocols) as they're built — this file is not a place to
/// pre-declare methods no screen calls yet.
protocol HomeAPI: Sendable {
    func fetchHome() async throws -> HomeReadModel
    /// The last authoritative Home persisted on this device, for cold-launch
    /// display while `fetchHome()` runs. Nil when there is none.
    func lastKnownHome() async -> HomeLastKnownSnapshot?
}

extension HomeAPI {
    func lastKnownHome() async -> HomeLastKnownSnapshot? { nil }
}

/// A previously-authoritative Home, labelled with the Server's own
/// `generatedAt`. It is never canonical for writes or notifications.
struct HomeLastKnownSnapshot: Sendable {
    var home: HomeReadModel
    var generatedAt: String
    var generatedDate: Date
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
        let resourceName: String
#if DEBUG
        resourceName = ProcessInfo.processInfo.arguments.contains("-physiqueos.redesign-review")
            ? "HomeRedesignReviewFixture"
            : "HomeFixture"
#else
        resourceName = "HomeFixture"
#endif
        guard let url = Bundle.main.url(forResource: resourceName, withExtension: "json") else {
            throw FixtureError.resourceNotFound
        }
        let data = try Data(contentsOf: url)
        var home = try JSONDecoder().decode(HomeReadModel.self, from: data)
#if DEBUG
        // Layout-only stress seam for focused UI coverage. The normal review
        // fixture remains the exact two-briefing acceptance state; this adds
        // long copy and multiple secondary rails without changing shipping
        // data, ordering, or routing behavior.
        if ProcessInfo.processInfo.arguments.contains("-physiqueos.home-secondary-briefing-stress") {
            home.briefingCards.append(contentsOf: [
                HomeBriefingCard(
                    id: "briefing-secondary-long-copy",
                    sectionLabel: "Weekly Briefing",
                    title: "A longer briefing title that must wrap without truncation or crowding",
                    prompt: "Review the complete evidence window before deciding whether the current training and nutrition plan should change.",
                    createdAt: "2026-10-05T14:00:00.000Z",
                    destination: .briefingDetail(briefingId: "weekly_briefing_2026-10-26_2026-11-01")
                ),
                HomeBriefingCard(
                    id: "briefing-secondary-third",
                    sectionLabel: "Monthly Briefing",
                    title: "Monthly Briefing Ready",
                    prompt: "Review the full month in context.",
                    createdAt: "2026-10-01T14:00:00.000Z",
                    destination: .briefingDetail(briefingId: "monthly_briefing_2026-10")
                ),
            ])
        }
#endif
        return home
    }
}

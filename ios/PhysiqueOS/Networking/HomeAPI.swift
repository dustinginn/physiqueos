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
        // Source-shaped layout stress for the adaptive priority grid. It uses
        // decoded occurrences and changes presentation fields only; Release
        // builds and the normal redesign fixture remain untouched.
        if ProcessInfo.processInfo.arguments.contains("-physiqueos.home-priority-layout-stress"),
           home.todaysFocus.count >= 3 {
            var morning = home.todaysFocus[0]
            morning.id = "review-morning-weight"
            var supplement = home.todaysFocus[2]
            supplement.id = "review-supplement"
            supplement.executionItemId = "execution-fadogia"
            supplement.title = "Fadogia"
            supplement.subtitle = "Every other day"
            var dexa = home.todaysFocus[1]
            dexa.id = "dexa-appointment:2026-10-04:upload-results"
            dexa.title = "Upload the scheduled DEXA results"
            dexa.subtitle = "The scheduled scan time has passed"
            dexa.metadata = "Attach the BodySpec PDF to reconcile this appointment."
            dexa.changeLabel = "Results needed"
            dexa.actionLabel = "Upload DEXA Results"
            dexa.urgency = .available
            dexa.continueActionDestination = .dexaUpload
            dexa.notificationAction?.workflow = "dexa_evidence"
            var foam = home.todaysFocus[2]
            foam.id = "review-foam"
            foam.subtitle = "7:15 PM"
            var peptide = home.todaysFocus[2]
            peptide.id = "review-peptide"
            peptide.executionItemId = "execution-tesamorelin"
            peptide.title = "Tesamorelin"
            peptide.subtitle = "10:29 PM · 0.5 mg"
            var tail = home.todaysFocus[2]
            tail.id = "review-tail"
            tail.executionItemId = "execution-evening-walk"
            tail.title = "Evening Walk"
            tail.subtitle = "After dinner"
            home.todaysFocus = [morning, supplement, dexa, foam, peptide, tail]
        }
#endif
        return home
    }
}

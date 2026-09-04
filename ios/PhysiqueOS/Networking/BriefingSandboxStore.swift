import Foundation

struct BriefingSandboxError: Error, Equatable, LocalizedError {
    var message: String
    var errorDescription: String? { message }
}

/// The single fixture provider for the recurring-Briefing vertical —
/// mirrors `OperatingPlanSandboxStore`/`GoalsSandboxStore`/
/// `LoggingSandboxStore`'s established shape (`@Observable final class`,
/// `init(bundle:)`, `Result<_, BriefingSandboxError>`). Home, Briefing
/// History, and Briefing Detail all read through this ONE store — Home's
/// "latest Briefing" is a *projection* over the same published collection
/// History lists, never a second Home-only fixture. A future live
/// implementation replaces only this store's internals with an
/// authenticated `BriefingAPI`; Home/History/Detail views do not change.
@Observable
final class BriefingSandboxStore {
    private(set) var briefings: [BriefingReadModel]

    init(bundle: Bundle = .main) {
        guard let url = bundle.url(forResource: "BriefingsFixture", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let decoded = try? JSONDecoder().decode([BriefingReadModel].self, from: data)
        else {
            fatalError("BriefingsFixture.json is missing or malformed — it ships in the app bundle and must always decode.")
        }
        self.briefings = decoded
    }

    // MARK: - Identity

    func briefing(id: String) -> BriefingReadModel? {
        briefings.first { $0.id == id }
    }

    // MARK: - History
    // `artifacts.sort((left, right) => String(right.generatedAt).localeCompare(String(left.generatedAt)))`
    // (`src/app/briefings/review/page.js`) — plain descending string
    // comparison on `generatedAt`, not a fixture-array-position sort.
    // Superseded (in-place-revised) artifacts are excluded from the list
    // the same way the real repository excludes them from
    // `listDailyBriefings()` after a regeneration replaces them —
    // verified real behavior: the old version is hidden from History, not
    // deleted (it stays reachable as a nested `replacedHistory` entry on
    // its replacement).
    var history: [BriefingReadModel] {
        Self.historyOrdering(from: briefings)
    }

    /// Pure form of `history` above, factored out so its contract (exclude
    /// superseded, sort by `generatedAt` descending) is directly testable
    /// against synthetic artifacts without depending on what happens to be
    /// in the bundled fixture.
    static func historyOrdering(from briefings: [BriefingReadModel]) -> [BriefingReadModel] {
        briefings
            .filter { $0.lifecycleState != .superseded }
            .sorted { $0.generatedAt > $1.generatedAt }
    }

    // MARK: - Home latest-Briefing projection (collision precedence)

    /// `resolveHomeBriefingSelection` (`HomeBriefingRoutingService.js`) —
    /// verified real precedence: a Monthly Briefing whose delivery day is
    /// TODAY takes over Home's "current Briefing" card, short-circuiting
    /// before Weekly/Midweek are even considered (confirmed by source:
    /// "promotes Monthly on its delivery date... returns to routine
    /// cadence selection after Monthly delivery day" — i.e. the promotion
    /// window is exactly the delivery day itself). This is a
    /// PRESENTATION-ONLY rule: it changes nothing about generation or
    /// History, which lists every artifact independently regardless of
    /// this projection (see `history` above). DEXA/Photo Event Briefings
    /// would take precedence over all of this on the real product — not
    /// modeled here since Event Briefings are a later batch.
    func latestForHome(now: Date = Date()) -> BriefingReadModel? {
        Self.latestForHome(from: briefings, now: now)
    }

    /// Pure form of `latestForHome` above — the Monthly-collision-
    /// precedence contract, directly testable against synthetic artifacts
    /// (a same-delivery-day Monthly/Weekly pair, an unpublished/failed
    /// artifact that must never win, etc.) without depending on the
    /// bundled fixture's own dates lining up with `now`.
    static func latestForHome(from briefings: [BriefingReadModel], now: Date = Date()) -> BriefingReadModel? {
        let today = Self.dateKey(now)
        // On the real product `now` is always "the current moment," so the
        // published collection naturally contains only what has already
        // been generated. Native's fixture spans a full pre-authored
        // chronology (including entries after today, for History/collision
        // demonstration), so this candidate set must be bounded to
        // artifacts already generated as of `now` — otherwise a
        // not-yet-"reached" fixture entry could incorrectly win the
        // `.max(by: generatedAt)` comparisons below.
        let nowISO = Self.isoTimestamp(now)
        let published = briefings.filter { $0.lifecycleState == .published && $0.generatedAt <= nowISO }

        if let monthly = published.filter({ $0.cadence == .monthly }).max(by: { $0.generatedAt < $1.generatedAt }),
           monthly.evidenceWindow.briefingDate == today {
            return monthly
        }

        let weekly = published.filter { $0.cadence == .weekly }.max(by: { $0.generatedAt < $1.generatedAt })
        let midweek = published.filter { $0.cadence == .midweek }.max(by: { $0.generatedAt < $1.generatedAt })
        switch (weekly, midweek) {
        case (let w?, let m?): return w.generatedAt >= m.generatedAt ? w : m
        case (let w?, nil): return w
        case (nil, let m?): return m
        case (nil, nil): break
        }

        return published.filter { $0.cadence == .daily }.max(by: { $0.generatedAt < $1.generatedAt })
    }

    private static func dateKey(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "America/Los_Angeles")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    /// `generatedAt` is always encoded as an ISO-8601 UTC instant with
    /// fractional seconds (`"2026-09-01T14:00:00.000Z"`); lexicographic
    /// string comparison against a value in that same format is a valid
    /// chronological comparison, matching the exact technique the real
    /// repository's own History sort already uses.
    private static func isoTimestamp(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }
}

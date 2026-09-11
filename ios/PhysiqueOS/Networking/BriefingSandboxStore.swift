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
/// `@unchecked Sendable`: `briefings` is populated once from the bundled
/// fixture in `init` and never mutated afterward (`private(set)`, no
/// mutating methods below) — safe to hand across the `BriefingAPI`
/// protocol boundary the same way `KeychainFounderCredentialStore` is.
@Observable
final class BriefingSandboxStore: @unchecked Sendable {
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
    /// verified real precedence, checked in this exact order:
    ///
    /// 1. Select the single most-recently-generated, un-consumed `.event`
    ///    artifact — DEXA or Photo, whichever type — exactly mirroring
    ///    `getLatestActiveEventBriefing` (`DailyBriefingRepository.js`):
    ///    there is NO type-based precedence between DEXA and Photo events,
    ///    purely `generatedAt` recency among the un-consumed ones (verified
    ///    directly by a real test where a Photo event published an hour
    ///    before a DEXA event loses to it, then wins again once the DEXA
    ///    event is consumed).
    /// 2. Then, and ONLY on that single candidate, check whether it is
    ///    still "active" (`isEventActiveForHome`) — see
    ///    `isEventActiveForHome(_:today:nowISO:)` below. If it fails this
    ///    check, Home does **not** fall back to an older still-technically-
    ///    active event of the other type — it falls straight through to
    ///    Monthly/Weekly/Midweek, exactly matching verified real behavior
    ///    (the routing function only ever receives ONE `eventArtifact`).
    /// 3. Else, a Monthly Briefing whose delivery day is TODAY takes over
    ///    ("promotes Monthly on its delivery date... returns to routine
    ///    cadence selection after Monthly delivery day" — the promotion
    ///    window is exactly the delivery day itself).
    /// 4. Else, whichever of Weekly/Midweek has the more recent
    ///    `generatedAt` (Weekly breaks ties).
    ///
    /// This is a PRESENTATION-ONLY rule: it changes nothing about
    /// generation or History, which lists every artifact independently
    /// regardless of this projection (see `history` above).
    func latestForHome(now: Date = Date()) -> BriefingReadModel? {
        Self.latestForHome(from: briefings, now: now)
    }

    /// Pure form of `latestForHome` above — the Event/Monthly-collision-
    /// precedence contract, directly testable against synthetic artifacts
    /// (a DEXA-vs-Photo event recency collision, a Photo event outside its
    /// active window that must NOT fall back to an older active DEXA
    /// event, an active-event-vs-Monthly-delivery-day collision, a
    /// consumed event that must fall through, a same-delivery-day
    /// Monthly/Weekly pair, an unpublished/failed artifact that must never
    /// win, etc.) without depending on the bundled fixture's own dates
    /// lining up with `now`.
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

        // Same reasoning as the `generatedAt <= nowISO` bound above: a
        // fixture-authored `eventConsumedAt` in the future relative to
        // `now` hasn't happened yet from that moment's perspective (on the
        // real product `now` is always literally "the current moment," so
        // a set `consumedAt` there always already lies in the past) — an
        // event only counts as consumed once its own `eventConsumedAt` has
        // actually been reached.
        let latestUnconsumedEvent = published
            .filter { $0.cadence == .event && ($0.eventConsumedAt.map { $0 > nowISO } ?? true) }
            .max(by: { $0.generatedAt < $1.generatedAt })
        if let event = latestUnconsumedEvent, Self.isEventActiveForHome(event, today: today, nowISO: nowISO) {
            return event
        }

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

    /// `isEventActiveForHome` (`HomeBriefingRoutingService.js`) — verified
    /// exact real logic:
    /// - A non-photo event (DEXA) is active unconditionally — no date
    ///   window at all.
    /// - A photo event is active only if its own `eventDate` (date-only,
    ///   NOT `generatedAt`) equals `today`, OR its `eventDate` was
    ///   yesterday AND it was itself generated/published today (a late-
    ///   published photo session still gets one day of Home visibility).
    ///   Any other combination — including an ordinary previously-active
    ///   photo event from further in the past — is inactive.
    private static func isEventActiveForHome(_ event: BriefingReadModel, today: String, nowISO: String) -> Bool {
        guard let photo = event.photo else { return true }
        if photo.eventDate == today { return true }
        let publicationLocalDate = Self.dateKey(fromISO: event.generatedAt)
        return photo.eventDate == Self.shiftDate(today, byDays: -1) && publicationLocalDate == today
    }

    private static func dateKey(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "America/Los_Angeles")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    /// Converts a `generatedAt`-style ISO-8601 UTC instant string into its
    /// Pacific-local `"yyyy-MM-dd"` date key — used to compare a Photo
    /// event's real publication date against `today` for the late-publish
    /// window above. Falls back to the raw prefix for a malformed value.
    private static func dateKey(fromISO iso: String) -> String {
        guard let date = ISO8601DateFormatter.briefingTimestamp.date(from: iso) ?? Self.isoDateOnlyFormatter.date(from: iso) else {
            return String(iso.prefix(10))
        }
        return Self.dateKey(date)
    }

    // Only ever read after construction; safe to share across isolation
    // domains despite ISO8601DateFormatter not being marked Sendable.
    nonisolated(unsafe) private static let isoDateOnlyFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    /// Shifts a `"yyyy-MM-dd"` date key by `byDays` calendar days, staying
    /// in the same Pacific-anchored calendar `dateKey`/`isEventActiveForHome`
    /// already use.
    private static func shiftDate(_ dateKey: String, byDays: Int) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        let parser = DateFormatter()
        parser.calendar = calendar
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.timeZone = calendar.timeZone
        parser.dateFormat = "yyyy-MM-dd"
        guard let date = parser.date(from: dateKey),
              let shifted = calendar.date(byAdding: .day, value: byDays, to: date) else { return dateKey }
        return Self.dateKey(shifted)
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

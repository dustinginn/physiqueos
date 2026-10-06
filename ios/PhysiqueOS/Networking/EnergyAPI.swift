import Foundation

/// Mirrors `DEXAAPI`/`WeightEvidenceAPI`'s seam pattern. `/progress/energy`
/// is Energy's entire vertical — landing, history, and reporting all live
/// on this one page (confirmed by this port's audit: no separate detail/
/// reporting sub-routes exist) — so, like Weight and DEXA, there is exactly
/// one fetch method, not a landing/day split.
protocol EnergyAPI: Sendable {
    /// `scope` reshapes the whole report — summary, both charts, weekly and
    /// daily history all narrow, matching source's own
    /// `getEnergyEvidenceReport` (everything downstream of `scopedEvidenceDays`
    /// is derived from the already-scoped day list). No-`scope` overload
    /// below defaults to Energy's own real default context.
    func fetchEnergyReport(scope: EvidenceScopeSelection) async throws -> EnergyReportReadModel
}

extension EnergyAPI {
    func fetchEnergyReport() async throws -> EnergyReportReadModel {
        try await fetchEnergyReport(scope: EnergyScopeDefault.selection)
    }
}

/// Energy's own real default context is Build Lean Mass — verified
/// directly against source (`getEnergyEvidenceReport`'s own
/// `VALID_CONTEXTS.has(context) ? context : "build-lean-mass"`), matching
/// every other Evidence vertical's default except Training.
enum EnergyScopeDefault {
    static let selection: EvidenceScopeSelection = .goal(goalId: EvidenceCanonicalGoalID.buildLeanMass)
}

/// Fixture-backed conformance: decodes one bundled JSON file of raw,
/// chronologically-unordered canonical daily records + data sources, then
/// derives the entire scoped report through `EnergyEvidenceCalculator`.
struct FixtureEnergyAPI: EnergyAPI {
    enum FixtureError: Error {
        case resourceNotFound
    }

    private struct EnergyFixtureFile: Codable {
        var days: [EnergyDayFixture]
        var dataSources: [EnergyDataSource]
    }

    private func loadFixture() throws -> EnergyFixtureFile {
        guard let url = Bundle.main.url(forResource: "EnergyFixture", withExtension: "json") else {
            throw FixtureError.resourceNotFound
        }
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(EnergyFixtureFile.self, from: data)
    }

    func fetchEnergyReport(scope: EvidenceScopeSelection) async throws -> EnergyReportReadModel {
        let fixture = try loadFixture()
        return EnergyEvidenceCalculator.report(allDays: fixture.days, scope: scope, allLabel: "All Energy", dataSources: fixture.dataSources)
    }
}

#if DEBUG
/// Screenshot/UI-test-only state seam for the Energy and Recovery/Sleep
/// redesign review (Build 90 remaining-redesign lane). Enabled only by
/// `-physiqueos.energy-recovery-review.state <state>`; it wraps the Sandbox
/// fixture APIs, never Founder Production, and is absent from Release.
///
/// States: `loading` (reads never finish), `failed` (reads throw),
/// `empty` (Energy with no evidence days / Recovery with no synced night),
/// `not-available` (Recovery's calm unavailable state), `night-not-found`,
/// `scope-loading` / `scope-failed` / `scope-empty` (Goal dates).
/// `-physiqueos.energy-recovery-review.scope build-lean-mass|visible-abs`
/// preselects the shared Recovery Goal scope.
enum EnergyRecoveryRedesignReview {
    enum State: String {
        case loading, failed, empty
        case notAvailable = "not-available"
        case nightNotFound = "night-not-found"
        case scopeLoading = "scope-loading"
        case scopeFailed = "scope-failed"
        case scopeEmpty = "scope-empty"
        /// The Server's weekly granularity (>= 183-day spans), which the
        /// 3-month Sandbox fixture can never reach: the same nights grouped
        /// into Monday weeks, detail charts withheld (locked R3).
        case weekly
    }

    struct ReviewFailure: Error {}

    private static func argument(_ flag: String) -> String? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: flag), arguments.indices.contains(index + 1) else { return nil }
        return arguments[index + 1]
    }

    static var state: State? { argument("-physiqueos.energy-recovery-review.state").flatMap(State.init(rawValue:)) }

    /// `-physiqueos.energy-recovery-review.scroll-y <pt>`: opens an Evidence
    /// page scrolled to that content offset (re-applied as content loads).
    static var scrollY: CGFloat? { argument("-physiqueos.energy-recovery-review.scroll-y").flatMap(Double.init).map { CGFloat($0) } }

    /// `-physiqueos.energy-recovery-review.sheet-scroll-y <pt>` for an open sheet.
    static var sheetScrollY: CGFloat? { argument("-physiqueos.energy-recovery-review.sheet-scroll-y").flatMap(Double.init).map { CGFloat($0) } }

    /// `-physiqueos.energy-recovery-review.sheet energy-weekly|energy-daily|sleep-nights`.
    static var sheet: String? { argument("-physiqueos.energy-recovery-review.sheet") }

    /// `-physiqueos.energy-recovery-review.expand stage-mix,source`.
    static func expands(_ name: String) -> Bool {
        argument("-physiqueos.energy-recovery-review.expand")?.split(separator: ",").contains { $0 == name } ?? false
    }

    /// `-physiqueos.energy-recovery-review.select <week id | sleep day>`:
    /// the chart selection a tap or scrub would make.
    static var selection: String? { argument("-physiqueos.energy-recovery-review.select") }

    /// `-physiqueos.energy-recovery-review.range 2w|1m|3m|6m|all` for Sleep Trends.
    static var argumentRange: RecoverySleepTrendRange? {
        argument("-physiqueos.energy-recovery-review.range").flatMap(RecoverySleepTrendRange.init(rawValue:))
    }

    static var initialScope: RecoverySleepScope? {
        argument("-physiqueos.energy-recovery-review.scope").flatMap { RecoverySleepScope(rawValue: $0) }
    }

    static func energyAPI(wrapping base: EnergyAPI) -> EnergyAPI {
        guard let state else { return base }
        return ReviewEnergyAPI(base: base, state: state)
    }

    static func recoverySleepAPI(wrapping base: RecoverySleepAPI) -> RecoverySleepAPI {
        guard let state else { return base }
        return ReviewRecoverySleepAPI(base: base, state: state)
    }

    private static func hang() async throws -> Never {
        while true { try await Task.sleep(for: .seconds(3600)) }
    }

    private struct ReviewEnergyAPI: EnergyAPI {
        let base: EnergyAPI
        let state: State

        func fetchEnergyReport(scope: EvidenceScopeSelection) async throws -> EnergyReportReadModel {
            switch state {
            case .loading: try await hang()
            case .failed: throw ReviewFailure()
            case .empty: return EnergyEvidenceCalculator.report(allDays: [], scope: scope, allLabel: "All Energy", dataSources: [])
            default: return try await base.fetchEnergyReport(scope: scope)
            }
        }
    }

    private struct ReviewRecoverySleepAPI: RecoverySleepAPI {
        let base: RecoverySleepAPI
        let state: State

        func today() -> String { base.today() }

        func fetchGoalWindows() async throws -> [RecoverySleepScope: RecoverySleepGoalWindow] {
            switch state {
            case .scopeLoading: try await hang()
            case .scopeFailed: throw ReviewFailure()
            case .scopeEmpty:
                // Goals that ended before Sleep Evidence began.
                let window = RecoverySleepGoalWindow(startDate: "2026-01-05", endDate: "2026-03-01")
                return [.buildLeanMass: window, .visibleAbs: window]
            default: return try await base.fetchGoalWindows()
            }
        }

        private func gate() async throws {
            switch state {
            case .loading: try await hang()
            case .failed: throw ReviewFailure()
            case .notAvailable: throw RecoverySleepAPIError.notAvailable
            default: return
            }
        }

        func fetchLanding(range: RecoverySleepScopeRange, policy: RecoverySleepReadPolicy) async throws -> RecoverySleepLanding {
            try await gate()
            if state == .empty { return RecoverySleepAdapter.emptyLanding() }
            return try await base.fetchLanding(range: range, policy: policy)
        }

        func fetchTrends(selector: RecoverySleepTrendRange, range: RecoverySleepScopeRange) async throws -> RecoverySleepTrends {
            try await gate()
            let trends = try await base.fetchTrends(selector: selector, range: range)
            guard state == .weekly, selector == .sixMonths || selector == .all else { return trends }
            let groups = Dictionary(grouping: trends.totalSleep.filter { $0.asleepSeconds != nil }) { FixtureRecoverySleepAPI.monday($0.periodStart) }
            let weeks = groups.keys.sorted(by: >).map { week -> RecoverySleepTrends.TotalPoint in
                let values = (groups[week] ?? []).compactMap(\.asleepSeconds)
                return .init(periodStart: week, asleepSeconds: values.reduce(0, +) / max(1, values.count), nightCount: values.count, trailingAverageSeconds: nil)
            }
            return RecoverySleepTrends(startDate: trends.startDate, endDate: trends.endDate, granularity: .week,
                                       averageAsleepSeconds: trends.averageAsleepSeconds, nightsWithData: trends.nightsWithData,
                                       isTruncated: false, totalSleep: weeks, windowRows: nil, continuity: nil, stageMix: nil)
        }

        func fetchNights(cursor: String?, limit: Int, range: RecoverySleepScopeRange) async throws -> RecoverySleepNightsPage {
            try await gate()
            return try await base.fetchNights(cursor: cursor, limit: limit, range: range)
        }

        func fetchNight(sleepDay: String) async throws -> RecoverySleepNightDetail {
            try await gate()
            if state == .nightNotFound { throw RecoverySleepAPIError.nightNotFound }
            return try await base.fetchNight(sleepDay: sleepDay)
        }
    }
}
#endif

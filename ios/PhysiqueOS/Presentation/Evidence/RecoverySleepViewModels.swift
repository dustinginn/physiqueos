import Foundation

/// Shared load state for Recovery / Sleep screens. `notAvailable` is a calm
/// product state (the Server does not serve Sleep Evidence yet), distinct
/// from a transient failure.
enum RecoverySleepLoadState<Value: Equatable>: Equatable {
    case loading
    case loaded(Value)
    case notAvailable
    case failed(String)
}

@MainActor
private func loadState<Value: Equatable>(_ work: () async throws -> Value) async -> RecoverySleepLoadState<Value> {
    do {
        return .loaded(try await work())
    } catch RecoverySleepAPIError.notAvailable {
        return .notAvailable
    } catch {
        return .failed("Sleep Evidence could not be loaded.")
    }
}

@Observable
@MainActor
final class RecoverySleepLandingViewModel {
    private(set) var state: RecoverySleepLoadState<RecoverySleepLanding> = .loading
    private let api: RecoverySleepAPI

    init(api: RecoverySleepAPI) {
        self.api = api
    }

    /// One bounded read (`recovery-sleep`). A reload keeps the last shown
    /// landing on screen until the new one arrives.
    func load(policy: RecoverySleepReadPolicy = .cacheFirst) async {
        let next = await loadState { try await api.fetchLanding(policy: policy) }
        if case .failed = next, case .loaded = state { return }
        state = next
    }
}

@Observable
@MainActor
final class RecoverySleepTrendsViewModel {
    private(set) var range: RecoverySleepTrendRange = .oneMonth
    private(set) var state: RecoverySleepLoadState<RecoverySleepTrends> = .loading
    private var loaded: [RecoverySleepTrendRange: RecoverySleepTrends] = [:]
    private let api: RecoverySleepAPI

    init(api: RecoverySleepAPI) {
        self.api = api
    }

    func load() async {
        await select(range)
    }

    /// One bounded read per range; ranges already shown this visit are kept.
    func select(_ range: RecoverySleepTrendRange) async {
        self.range = range
        if let cached = loaded[range] {
            state = .loaded(cached)
            return
        }
        if case .loaded = state {} else { state = .loading }
        let next = await loadState { try await api.fetchTrends(range: range) }
        guard self.range == range else { return }
        if case .loaded(let trends) = next { loaded[range] = trends }
        state = next
    }
}

@Observable
@MainActor
final class RecoverySleepNightsViewModel {
    private(set) var items: [RecoverySleepNightSummary] = []
    private(set) var state: RecoverySleepLoadState<Bool> = .loading
    private(set) var isLoadingMore = false
    private var nextCursor: String?
    private var hasLoadedFirstPage = false
    private let api: RecoverySleepAPI
    private let pageSize: Int

    init(api: RecoverySleepAPI, pageSize: Int = RecoverySleepQuery.nightsPageLimit) {
        self.api = api
        self.pageSize = pageSize
    }

    var canLoadMore: Bool { nextCursor != nil && !isLoadingMore }

    func loadFirstPage() async {
        guard !hasLoadedFirstPage else { return }
        let next = await loadState { try await api.fetchNights(cursor: nil, limit: pageSize) }
        switch next {
        case .loaded(let page):
            items = page.items
            nextCursor = page.nextCursor
            hasLoadedFirstPage = true
            state = .loaded(true)
        case .loading: state = .loading
        case .notAvailable: state = .notAvailable
        case .failed(let message): state = .failed(message)
        }
    }

    /// Bounded pagination; never loads the full history at once.
    func loadMore() async {
        guard let cursor = nextCursor, !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        guard let page = try? await api.fetchNights(cursor: cursor, limit: pageSize) else { return }
        let known = Set(items.map(\.sleepDay))
        items += page.items.filter { !known.contains($0.sleepDay) }
        nextCursor = page.nextCursor
    }
}

@Observable
@MainActor
final class RecoverySleepNightViewModel {
    enum DetailState: Equatable {
        case loading
        case loaded(RecoverySleepNightDetail)
        case notFound
        case notAvailable
        case failed(String)
    }

    let sleepDay: String
    private(set) var state: DetailState = .loading
    private let api: RecoverySleepAPI

    init(sleepDay: String, api: RecoverySleepAPI) {
        self.sleepDay = sleepDay
        self.api = api
    }

    /// One scoped read (`recovery-sleep-night?sleepDay=`).
    func load() async {
        do {
            state = .loaded(try await api.fetchNight(sleepDay: sleepDay))
        } catch RecoverySleepAPIError.nightNotFound {
            state = .notFound
        } catch RecoverySleepAPIError.notAvailable {
            state = .notAvailable
        } catch {
            if case .loaded = state { return }
            state = .failed("This night could not be loaded.")
        }
    }
}

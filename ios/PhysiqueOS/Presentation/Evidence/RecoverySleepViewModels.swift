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
    private var loadedRange: RecoverySleepScopeRange?
    /// The scope the current `state` belongs to.
    private var stateRange: RecoverySleepScopeRange?
    private var requestedRange: RecoverySleepScopeRange?
    private let api: RecoverySleepAPI

    init(api: RecoverySleepAPI) {
        self.api = api
    }

    /// What to show for `range`: never another scope's nights, even for the
    /// frame before the reload for a freshly selected scope starts.
    func state(for range: RecoverySleepScopeRange?) -> RecoverySleepLoadState<RecoverySleepLanding> {
        guard let range, stateRange == range else { return .loading }
        return state
    }

    /// One bounded read inside the selected scope. Switching scope shows the
    /// loading state (never another scope's nights); a plain reload keeps the
    /// last shown landing on screen until the new one arrives.
    func load(range: RecoverySleepScopeRange, policy: RecoverySleepReadPolicy = .cacheFirst) async {
        requestedRange = range
        if loadedRange != range { state = .loading; stateRange = range }
        let next = await loadState { try await api.fetchLanding(range: range, policy: policy) }
        // A cancelled or superseded read must not overwrite a newer scope.
        guard !Task.isCancelled, requestedRange == range else { return }
        if case .failed = next, case .loaded = state, loadedRange == range { return }
        loadedRange = range
        stateRange = range
        state = next
    }
}

@Observable
@MainActor
final class RecoverySleepTrendsViewModel {
    private struct CacheKey: Hashable {
        let selector: RecoverySleepTrendRange
        let range: RecoverySleepScopeRange
    }

    private(set) var selector: RecoverySleepTrendRange = .oneMonth
    private(set) var state: RecoverySleepLoadState<RecoverySleepTrends> = .loading
    private var loaded: [CacheKey: RecoverySleepTrends] = [:]
    private var stateRange: RecoverySleepScopeRange?
    private var requestedKey: CacheKey?
    private let api: RecoverySleepAPI

    init(api: RecoverySleepAPI) {
        self.api = api
    }

    func state(for range: RecoverySleepScopeRange?) -> RecoverySleepLoadState<RecoverySleepTrends> {
        guard let range, stateRange == range else { return .loading }
        return state
    }

    func load(range: RecoverySleepScopeRange) async {
        await select(selector, range: range)
    }

    /// One bounded read per selector and scope; combinations already shown
    /// this visit are kept.
    func select(_ selector: RecoverySleepTrendRange, range: RecoverySleepScopeRange) async {
        self.selector = selector
        let key = CacheKey(selector: selector, range: range)
        requestedKey = key
        stateRange = range
        if let cached = loaded[key] {
            state = .loaded(cached)
            return
        }
        state = .loading
        let next = await loadState { try await api.fetchTrends(selector: selector, range: range) }
        if case .loaded(let trends) = next { loaded[key] = trends }
        // A cancelled or superseded read must not overwrite a newer scope or range.
        guard !Task.isCancelled, requestedKey == key else { return }
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
    private let range: RecoverySleepScopeRange
    private let pageSize: Int

    init(api: RecoverySleepAPI, range: RecoverySleepScopeRange, pageSize: Int = RecoverySleepQuery.nightsPageLimit) {
        self.api = api
        self.range = range
        self.pageSize = pageSize
    }

    var canLoadMore: Bool { nextCursor != nil && !isLoadingMore }

    func loadFirstPage() async {
        guard !hasLoadedFirstPage else { return }
        let next = await loadState { try await api.fetchNights(cursor: nil, limit: pageSize, range: range) }
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
        guard let page = try? await api.fetchNights(cursor: cursor, limit: pageSize, range: range) else { return }
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

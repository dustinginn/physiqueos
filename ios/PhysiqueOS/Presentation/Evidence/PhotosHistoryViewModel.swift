import Foundation

@Observable
@MainActor
final class PhotosHistoryViewModel {
    enum LoadState: Equatable {
        case loading
        case loaded(PhotosLandingReadModel)
        case failed(String)
    }

    private(set) var state: LoadState = .loading
    private(set) var scope: EvidenceScopeSelection = PhotosScopeDefault.selection
    /// Availability of the latest set's Photo Briefing, from the Server. The
    /// existence of a PhotoSession alone never makes the briefing readable.
    private(set) var briefingAvailability: PhotoBriefingAvailability = .unknown
    private let api: PhotosAPI
    private let briefingAPI: BriefingAPI?
    private let refreshSchedule: ProcessingRefreshSchedule
    private let sleep: (Duration) async throws -> Void

    init(
        api: PhotosAPI,
        briefingAPI: BriefingAPI? = nil,
        refreshSchedule: ProcessingRefreshSchedule = .standard,
        sleep: @escaping (Duration) async throws -> Void = { try await Task.sleep(for: $0) }
    ) {
        self.api = api
        self.briefingAPI = briefingAPI
        self.refreshSchedule = refreshSchedule
        self.sleep = sleep
    }

    var latestSetId: String? {
        guard case .loaded(let landing) = state else { return nil }
        return landing.latestSet?.id
    }

    /// Probes once, then (only while the Server reports it pending) refreshes on the
    /// bounded cadence. Ends when published, exhausted, or cancelled with the view.
    func watchPhotoBriefing(sessionId: String) async {
        guard let briefingAPI else { return }
        briefingAvailability = await briefingAPI.photoBriefingAvailability(sessionId: sessionId)
        guard briefingAvailability == .pending else { return }
        await ProcessingRefresh.run(schedule: refreshSchedule, sleep: sleep) {
            briefingAvailability = await briefingAPI.photoBriefingAvailability(sessionId: sessionId)
            return briefingAvailability == .pending ? .waiting : .finished
        }
    }

    func load() async {
        do {
            state = .loaded(try await api.fetchPhotosLanding(scope: scope))
        } catch {
            state = .failed("Progress Photos could not be loaded.")
        }
    }

    func selectScope(pillID: String) async {
        guard let selection = EvidenceScopeSelection(pillID: pillID), selection != scope else { return }
        scope = selection
        await load()
    }
}

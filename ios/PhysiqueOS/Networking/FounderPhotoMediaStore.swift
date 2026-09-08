import Foundation
import UIKit

/// One process-local cache for both Progress Photos Evidence and Photo Event
/// Briefings. It has no disk persistence and keys exclusively by the
/// server-owned view identity, preventing pose/index drift after filtering.
@Observable
@MainActor
final class FounderPhotoMediaStore {
    enum ManifestState: Equatable { case idle, loading, ready, unavailable }
    enum ImageState: Equatable { case idle, loading, loaded(UIImage), failed }

    private(set) var manifestState: ManifestState = .idle
    private(set) var sessions: [FounderPhotoAcceptanceSession] = []
    private(set) var projectedSetsByID: [String: PhotoSetRecord] = [:]
    private(set) var itemsByViewIdentity: [String: FounderPhotoAcceptanceItem] = [:]
    private(set) var imageStates: [String: ImageState] = [:]
    private let api: FounderServerAPI

    nonisolated init(api: FounderServerAPI) { self.api = api }

    func loadManifestIfNeeded() async {
        guard manifestState == .idle else { return }
        manifestState = .loading
        do {
            let manifest = try await api.readPhotoAcceptanceManifest()
            guard manifest.schemaVersion == "native-founder-photo-media-v1",
                  manifest.authority.kind == "sandbox-founder-photo-acceptance"
            else { throw FounderServerError.invalidResponse }
            let items = manifest.sessions.flatMap(\.photos)
            guard Set(items.map(\.viewIdentity)).count == items.count,
                  items.allSatisfy({ $0.viewIdentity == "\($0.photoSessionId)-\($0.poseId.rawValue)" })
            else { throw FounderServerError.invalidResponse }
            sessions = manifest.sessions.sorted { $0.captureDate < $1.captureDate }
            itemsByViewIdentity = Dictionary(uniqueKeysWithValues: items.map { ($0.viewIdentity, $0) })
            projectedSetsByID = Dictionary(uniqueKeysWithValues: Self.makeProjectedSets(from: sessions).map { ($0.id, $0) })
            manifestState = .ready
        } catch {
            manifestState = .unavailable
        }
    }

    func source(viewIdentity: String) -> PhotoMediaSource {
        guard let item = itemsByViewIdentity[viewIdentity] else { return .placeholder }
        return .authenticatedSandbox(viewIdentity: viewIdentity, mediaId: item.mediaId)
    }

    func source(setId: String, poseId: PhotoPoseID) -> PhotoMediaSource {
        source(viewIdentity: "\(setId)-\(poseId.rawValue)")
    }

    /// Resolves an existing fixture artifact onto the allowlisted manifest
    /// without trusting array position as photo identity. Exact date wins;
    /// a newer fixture event may intentionally use the newest acceptance
    /// session so the existing fixture narrative can be visually reviewed
    /// with the authorized media without rewriting that narrative.
    func resolvedItem(setId: String, captureDate: String, poseId: PhotoPoseID) -> FounderPhotoAcceptanceItem? {
        if let exactIdentity = itemsByViewIdentity["\(setId)-\(poseId.rawValue)"] { return exactIdentity }
        if let exactDate = sessions.first(where: { $0.captureDate == captureDate })?.photos.first(where: { $0.poseId == poseId }) {
            return exactDate
        }
        guard let latest = sessions.last, captureDate > latest.captureDate else { return nil }
        return latest.photos.first(where: { $0.poseId == poseId })
    }

    func source(setId: String, captureDate: String, poseId: PhotoPoseID) -> PhotoMediaSource {
        guard let item = resolvedItem(setId: setId, captureDate: captureDate, poseId: poseId) else { return .placeholder }
        return source(viewIdentity: item.viewIdentity)
    }

    func projectedLanding(from fixture: PhotosLandingReadModel, scope: EvidenceScopeSelection) -> PhotosLandingReadModel? {
        guard manifestState == .ready else { return nil }
        let history = projectedSetsByID.values
            .filter { EvidenceChronology.matches($0.date, scope: scope) }
            .sorted { $0.date > $1.date }
        var result = fixture
        result.subtitle = "Authenticated Founder photos for visual acceptance. No new interpretation was generated."
        result.latestSet = history.first
        result.history = history
        return result
    }

    private static func makeProjectedSets(from sessions: [FounderPhotoAcceptanceSession]) -> [PhotoSetRecord] {
        var previousDateByPose: [PhotoPoseID: String] = [:]
        return sessions.map { session in
            let views = session.photos.sorted { $0.poseId.order < $1.poseId.order }.map { item in
                let previousDate = previousDateByPose[item.poseId]
                return PhotoViewRecord(
                    id: item.viewIdentity,
                    poseId: item.poseId,
                    setId: session.photoSessionId,
                    captureDate: session.captureDate,
                    comparedAgainst: previousDate.map(TrainingDateFormatting.short) ?? "No prior matching pose",
                    comparisonStatus: previousDate == nil ? "no_prior_matching_pose" : "comparable",
                    conditionSummary: "Capture conditions are not exposed by the visual-acceptance bridge.",
                    sourceHistory: "Authenticated Sandbox photo-acceptance media for this captured pose.",
                    interpretationSummary: "Image available for Founder visual review. No new interpretation was generated.",
                    comparisonBullets: [],
                    hasComparisonImage: previousDate != nil
                )
            }
            for photo in session.photos { previousDateByPose[photo.poseId] = session.captureDate }
            return PhotoSetRecord(
                id: session.photoSessionId,
                date: session.captureDate,
                weightLabel: "Weight not exposed",
                comparisonAvailability: "\(views.filter(\.hasComparisonImage).count)/\(views.count) poses have prior comparisons",
                views: views,
                attributedScope: EvidenceChronology.attribution(forOccurrenceDate: session.captureDate)
            )
        }
    }

    func loadImage(viewIdentity: String, mediaId: String) async {
        if case .loaded = imageStates[viewIdentity] { return }
        guard itemsByViewIdentity[viewIdentity]?.mediaId == mediaId else {
            imageStates[viewIdentity] = .failed
            return
        }
        imageStates[viewIdentity] = .loading
        do {
            let data = try await api.readPhotoAcceptanceMedia(mediaId: mediaId)
            guard let image = UIImage(data: data) else { throw FounderServerError.invalidResponse }
            imageStates[viewIdentity] = .loaded(image)
        } catch {
            imageStates[viewIdentity] = .failed
        }
    }
}

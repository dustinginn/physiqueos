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
        // `unavailable` is deliberately retryable. A common first-run path
        // opens Photos before pairing has completed; making that transient
        // auth failure terminal left every later photo as a placeholder for
        // the lifetime of the app process.
        guard manifestState != .loading, manifestState != .ready else { return }
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

    /// Resolves a comparison as a pair so the prior photo cannot collapse
    /// onto the same acceptance session as the current photo when fixture
    /// dates and allowlisted Founder-session dates use different calendars.
    /// Exact stable identity/date still wins. Otherwise the current view
    /// uses the newest authorized session and the prior view uses the
    /// closest earlier authorized session carrying that same pose.
    func resolvedComparisonItems(
        priorSetId: String?,
        priorDate: String?,
        currentSetId: String,
        currentDate: String,
        poseId: PhotoPoseID
    ) -> (prior: FounderPhotoAcceptanceItem?, current: FounderPhotoAcceptanceItem?) {
        let current = resolvedItem(setId: currentSetId, captureDate: currentDate, poseId: poseId)
        let priorExact = priorSetId.flatMap { setId in
            resolvedItemExact(setId: setId, captureDate: priorDate ?? "", poseId: poseId)
        }
        guard priorExact == nil, let current else { return (priorExact, current) }
        let earlier = sessions
            .filter { $0.captureDate < current.captureDate }
            .reversed()
            .lazy
            .compactMap { $0.photos.first(where: { $0.poseId == poseId }) }
            .first
        return (earlier, current)
    }

    private func resolvedItemExact(setId: String, captureDate: String, poseId: PhotoPoseID) -> FounderPhotoAcceptanceItem? {
        if let exactIdentity = itemsByViewIdentity["\(setId)-\(poseId.rawValue)"] { return exactIdentity }
        return sessions.first(where: { $0.captureDate == captureDate })?.photos.first(where: { $0.poseId == poseId })
    }

    func projectedLanding(from fixture: PhotosLandingReadModel, scope: EvidenceScopeSelection) -> PhotosLandingReadModel? {
        guard manifestState == .ready else { return nil }
        let fixtureSets = ([fixture.latestSet].compactMap { $0 } + fixture.history)
        let weightByExactDate = Dictionary(
            fixtureSets.map { ($0.date, $0.weightLabel) },
            uniquingKeysWith: { first, _ in first }
        )
        let history = projectedSetsByID.values
            .filter { EvidenceChronology.matches($0.date, scope: scope) }
            .map { set in
                guard let weight = weightByExactDate[set.date] else { return set }
                var enriched = set
                enriched.weightLabel = weight
                return enriched
            }
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
            let priorComparisonDate = views.first(where: \.hasComparisonImage)?.comparedAgainst
            return PhotoSetRecord(
                id: session.photoSessionId,
                date: session.captureDate,
                weightLabel: "Weight not exposed",
                comparisonAvailability: priorComparisonDate ?? "No prior matching session",
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

    func retryImage(viewIdentity: String, mediaId: String) async {
        imageStates[viewIdentity] = .idle
        await loadImage(viewIdentity: viewIdentity, mediaId: mediaId)
    }
}

import Foundation

/// Mirrors `TrainingAPI`/`ActivityAPI`/`NutritionAPI`'s seam pattern.
protocol PhotosAPI: Sendable {
    /// `scope` narrows `history` — same shared mechanism as every other
    /// vertical. No-`scope` overload defaults to Photos' own real default
    /// context (`PhotosEvidenceContextService.js` — confirmed
    /// Build Lean Mass, matching Weight/Nutrition/Activity/DEXA, unlike
    /// Training's "all").
    func fetchPhotosLanding(scope: EvidenceScopeSelection) async throws -> PhotosLandingReadModel
    /// `nil` for an id with no matching photo set.
    func fetchPhotoSet(setId: String) async throws -> PhotoSetRecord?
}

extension PhotosAPI {
    func fetchPhotosLanding() async throws -> PhotosLandingReadModel {
        try await fetchPhotosLanding(scope: PhotosScopeDefault.selection)
    }
}

enum PhotosScopeDefault {
    static let selection: EvidenceScopeSelection = .goal(goalId: EvidenceCanonicalGoalID.buildLeanMass)
}

/// The `photos` native resource strips `poseId`/`comparisonStatus` from
/// every reachable per-view field before it reaches the wire — both exist
/// on the server's own in-memory session objects, but are discarded by
/// `toGalleryEvidenceRecord`/`getPhotoReportExtras`
/// (`ProgressReportingService.js:1022-1063`) — so `PhotoSetRecord.views`
/// cannot be built correctly from what Founder Production actually sends
/// today (see this task's final report). Until that's fixed server-side,
/// this conformance throws rather than silently falling back to
/// `FixturePhotosAPI`'s bundled Sandbox data, which would misrepresent
/// stale fixture photos as Founder Production truth — the same class of
/// defect already corrected for Evidence Hub/Log/Goal chronology.
struct NotYetAvailablePhotosAPI: PhotosAPI {
    struct NotYetAvailable: Error {}

    func fetchPhotosLanding(scope: EvidenceScopeSelection) async throws -> PhotosLandingReadModel {
        throw NotYetAvailable()
    }

    func fetchPhotoSet(setId: String) async throws -> PhotoSetRecord? {
        throw NotYetAvailable()
    }
}

/// Fixture-backed conformance: decodes one bundled JSON file of raw,
/// chronologically-ascending photo sets, then derives the entire scoped
/// report (with comparisons attached) through `PhotosEvidenceCalculator`.
struct FixturePhotosAPI: PhotosAPI {
    enum FixtureError: Error {
        case resourceNotFound
    }

    private struct PhotosFixtureFile: Codable {
        var sets: [PhotoSetFixture]
        var dataSources: [PhotoDataSource]
    }

    private func loadFixture() throws -> PhotosFixtureFile {
        guard let url = Bundle.main.url(forResource: "PhotosFixture", withExtension: "json") else {
            throw FixtureError.resourceNotFound
        }
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(PhotosFixtureFile.self, from: data)
    }

    func fetchPhotosLanding(scope: EvidenceScopeSelection) async throws -> PhotosLandingReadModel {
        let fixture = try loadFixture()
        return PhotosEvidenceCalculator.report(allSets: fixture.sets, scope: scope, allLabel: "All Photos", dataSources: fixture.dataSources)
    }

    /// Looks the set up within the full, unscoped `.all` report so a
    /// pushed detail screen always resolves regardless of which scope was
    /// selected when the row was tapped — matching every other vertical's
    /// day/session detail fetch, which is never itself scope-filtered.
    func fetchPhotoSet(setId: String) async throws -> PhotoSetRecord? {
        let landing = try await fetchPhotosLanding(scope: .all)
        return landing.history.first { $0.id == setId }
    }
}

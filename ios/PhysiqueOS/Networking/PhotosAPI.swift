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

/// Founder Production adapter for the completed Package 7 `photos`
/// resource (Patch 3 continuation, `getNativePhotosTimeline`/
/// `projectNativePhotosRead`). A prior revision found `poseId`/
/// `comparisonStatus` stripped from the wire and left this vertical
/// throwing rather than leaking Sandbox fixture data — the server now
/// sends canonical pose identity, comparison status, and opaque
/// current/prior media descriptors directly on each session's `photos[]`
/// array. Native decodes and formats this already-final identity/
/// comparison data; same-pose comparison selection, session/revision
/// identity, and Goal/Phase attribution all remain entirely server-owned.
struct ProductionPhotosAPI: PhotosAPI {
    let api: ProductionNativeAPI

    func fetchPhotosLanding(scope: EvidenceScopeSelection) async throws -> PhotosLandingReadModel {
        let context = try ProductionContext.value(for: scope)
        let envelope = try await api.readResource("photos", query: ["context": context], as: Payload.self)
        return Self.landing(from: envelope.data)
    }

    /// The `photos` resource returns every bounded session in one list —
    /// there is no separate per-session detail resource — so detail just
    /// re-fetches the same landing payload (unscoped, matching every
    /// other vertical's day/session detail fetch) and finds the match.
    func fetchPhotoSet(setId: String) async throws -> PhotoSetRecord? {
        try await fetchPhotosLanding(scope: .all).history.first { $0.id == setId }
    }

    private static func landing(from payload: Payload) -> PhotosLandingReadModel {
        let sets = payload.sessions.map(\.readModel)
        return PhotosLandingReadModel(
            title: "Progress Photos",
            subtitle: nil,
            tone: .primary,
            scope: payload.context.scope(allLabel: "All Photos"),
            latestSet: sets.first,
            history: sets,
            dataSources: [PhotoDataSource(name: "PhysiqueOS", status: "Founder Production")]
        )
    }

    private struct Payload: Decodable, @unchecked Sendable {
        var context: NativeGoalPhaseContext
        var sessions: [Session]
    }

    private struct Session: Decodable {
        var sessionId: String
        var intendedCaptureDate: String
        /// Confusingly named on the wire: the SESSION-level `comparisonStatus`
        /// key is actually the server's own pre-formatted "N/M poses have
        /// prior comparisons" rollup string (`session.comparisonAvailability`
        /// server-side) — a completely different concept from each PHOTO's
        /// own `comparisonStatus` enum below. Decoded and used verbatim,
        /// never re-derived from a local count.
        var comparisonStatus: String?
        var photos: [Photo]

        var readModel: PhotoSetRecord {
            let views = photos.map { $0.readModel(sessionId: sessionId, sessionDate: intendedCaptureDate) }
                .sorted { $0.poseId.order < $1.poseId.order }
            return PhotoSetRecord(
                id: sessionId,
                date: intendedCaptureDate,
                weightLabel: nil,
                comparisonAvailability: comparisonStatus ?? "No prior matching session",
                views: views,
                attributedScope: nil
            )
        }
    }

    private struct Photo: Decodable {
        var photoId: String
        var poseId: String
        var pose: Pose
        var intendedCaptureDate: String
        var comparisonStatus: String
        var media: MediaDescriptor?
        var prior: Prior?
        var galleryInterpretation: GalleryInterpretation?
        var sourceHistory: String?

        func readModel(sessionId: String, sessionDate: String) -> PhotoViewRecord {
            PhotoViewRecord(
                id: photoId,
                poseId: PhotoPoseID(rawValue: poseId) ?? .frontRelaxed,
                setId: sessionId,
                captureDate: intendedCaptureDate,
                comparedAgainst: Self.comparedAgainstLabel(status: comparisonStatus, priorDate: prior?.intendedCaptureDate),
                comparisonStatus: comparisonStatus,
                conditionSummary: galleryInterpretation?.conditionSummary,
                sourceHistory: sourceHistory,
                interpretationSummary: galleryInterpretation?.summary,
                comparisonBullets: galleryInterpretation?.comparisonBullets,
                hasComparisonImage: prior?.media != nil,
                mediaId: media?.mediaId,
                priorMediaId: prior?.media?.mediaId
            )
        }

        /// Human-readable text built from the server's own `comparisonStatus`
        /// enum and `prior.intendedCaptureDate` — a presentation-formatting
        /// step only (the comparison decision itself is entirely server-
        /// owned), matching the vocabulary `PhotoViewRecord.comparedAgainst`
        /// already documents.
        private static func comparedAgainstLabel(status: String, priorDate: String?) -> String {
            switch status {
            case "comparable", "comparable_with_condition_differences":
                return priorDate.map(TrainingDateFormatting.short) ?? "Prior matching photo pending"
            case "prior_image_unavailable":
                return "Prior image unavailable"
            case "insufficient_canonical_data":
                return "Prior matching photo pending"
            default:
                return "No prior matching pose"
            }
        }
    }

    private struct GalleryInterpretation: Decodable {
        var summary: String?
        var comparisonBullets: [String]?
        var conditionSummary: String?
    }

    private struct Pose: Decodable {
        var id: String?
        var label: String?
    }

    private struct Prior: Decodable {
        var intendedCaptureDate: String?
        var media: MediaDescriptor?
    }

    private struct MediaDescriptor: Decodable {
        var mediaId: String
        var deliveryPath: String
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

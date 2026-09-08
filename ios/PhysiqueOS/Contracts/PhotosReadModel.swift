import Foundation

/// Native transport mirror of the web's live Progress Photos Evidence
/// experience (`/progress/photos`, `ProgressPlaceholderScreen.jsx`'s
/// `report.id === "photos"` render path →
/// `PhotosEvidenceContextService.getPhotosTimelineReport` →
/// `ProgressPhotoGallery.jsx`). One canonical concept: a **photo set**
/// (one capture session, one date) contains multiple pose **views**
/// (`photo_session.views[]`) — never independent single photos.
///
/// The web has **no per-set detail route at all** — set detail is a
/// client-side `PhotoModal`, confirmed by this port's audit (no URL to
/// mirror). This port therefore pushes a real screen
/// (`.photoSetDetail(setId:)`) where the web opens a modal — the Detail
/// Navigation requirement over a literal web-modal port, the same kind of
/// touch/SwiftUI adaptation already applied elsewhere in this codebase
/// (Activity's own history rows push to a screen where the web expands
/// inline).
///
/// A second, richer live surface exists on web —
/// `/briefings/photo/[sessionId]`, the "Photo Event" narrative briefing —
/// and is built separately in the Briefings vertical
/// (`PhotoBriefingContent`, `Presentation/Briefings/PhotoBriefingSections.swift`).
/// That surface shares this exact same canonical photo-set/pose identity
/// (`PhotoViewRecord.id`/`setId`/`captureDate` below) rather than inventing
/// a parallel photo universe — verified real behavior: both the Evidence
/// page and the Photo Event Briefing build their photo sessions through
/// the identical `createPhotoSessionReadModels` read-model service on the
/// real product.
struct PhotosLandingReadModel: Equatable {
    var title: String
    var subtitle: String?
    var tone: HomeColorToken
    var scope: TrainingScopeContext
    /// `nil` when no photo sets exist yet — matching the web's own
    /// `{latestPhotoSet && (...)}` guard.
    var latestSet: PhotoSetRecord?
    /// Newest-first, matching the web's own history ordering.
    var history: [PhotoSetRecord]
    var dataSources: [PhotoDataSource]
}

/// The 7 canonical pose ids (`CanonicalProgressPhotoCategories`,
/// `progressPhotoPoseVocabulary.js`), in the web's own `POSE_ORDER`
/// display order.
enum PhotoPoseID: String, Codable, Equatable, CaseIterable, Identifiable {
    case frontRelaxed = "front-relaxed"
    case backRelaxed = "back-relaxed"
    case backFlexed = "back-flexed"
    case sideRelaxed = "side-relaxed"
    case leftSideRelaxed = "left-side-relaxed"
    case rightSideRelaxed = "right-side-relaxed"
    case frontFlexed = "front-flexed"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .frontRelaxed: "Front Relaxed"
        case .backRelaxed: "Back Relaxed"
        case .backFlexed: "Back Flexed"
        case .sideRelaxed: "Side Relaxed"
        case .leftSideRelaxed: "Left Side Relaxed"
        case .rightSideRelaxed: "Right Side Relaxed"
        case .frontFlexed: "Front Flexed"
        }
    }

    /// `POSE_ORDER` — front-relaxed, back-relaxed, back-flexed,
    /// side-relaxed, left/right-side-relaxed, front-flexed.
    var order: Int {
        switch self {
        case .frontRelaxed: 0
        case .backRelaxed: 1
        case .backFlexed: 2
        case .sideRelaxed: 3
        case .leftSideRelaxed: 4
        case .rightSideRelaxed: 5
        case .frontFlexed: 6
        }
    }
}

/// One capture session — `PhotoSetCard`/history row shape.
/// `comparisonAvailability` mirrors the web's own `"N/M poses have prior
/// comparisons"` session-level rollup string.
struct PhotoSetRecord: Codable, Equatable, Identifiable {
    var id: String
    var date: String
    /// `"179.4 lb"` or `"No same-day weight"`, matching the web's own
    /// fallback text exactly.
    var weightLabel: String
    var comparisonAvailability: String
    /// Ordered per `PhotoPoseID.order`.
    var views: [PhotoViewRecord]
    var attributedScope: EvidenceScopeAttribution? = nil

    var destination: AppDestination { .photoSetDetail(setId: id) }
}

/// One pose view within a set — the `PhotoModal`'s per-view content.
/// `interpretationSummary`/`comparisonBullets`/`conditionSummary`/
/// `sourceHistory` are server-owned presentation copy
/// (`GalleryInterpretationService.composeGalleryInterpretation`) —
/// fixtured verbatim here, never locally generated or recomputed, per
/// this task's explicit OpenAI/intelligence boundary.
struct PhotoViewRecord: Codable, Equatable, Identifiable {
    /// `"<setId>-<poseId>"` — the stable canonical identity for ONE
    /// captured pose-photo, shared verbatim with the Photo Event Briefing
    /// (`PhotoBriefingView.id`) so both surfaces reference the exact same
    /// underlying media, never independent fixture universes. Never
    /// reassigned by array position or reordering.
    var id: String
    var poseId: PhotoPoseID
    /// The capture session this view belongs to — `PhotoSetRecord.id`.
    /// Carried directly on the view (not just implied by its parent) so a
    /// Photo Briefing artifact can reference a specific pose-photo by id
    /// alone and still resolve which session/date it came from.
    var setId: String
    var captureDate: String
    /// `"Jul 11"` | `"No prior matching pose"` | `"Prior image unavailable"`
    /// | `"Prior matching photo pending"` — the web's own exact empty-state
    /// vocabulary for `comparedAgainst`.
    var comparedAgainst: String
    /// `"comparable"` | `"comparable_with_condition_differences"` |
    /// `"no_prior_matching_pose"` | `"prior_image_unavailable"` |
    /// `"insufficient_canonical_data"` — real `comparisonStatus` values.
    var comparisonStatus: String
    var conditionSummary: String
    var sourceHistory: String
    var interpretationSummary: String
    var comparisonBullets: [String]
    /// Whether a side-by-side Previous/Current comparison image pair is
    /// available (`comparisonStatus == "comparable" |
    /// "comparable_with_condition_differences"`). This gates the paired
    /// comparison layout independently of whether media is a fixture
    /// placeholder or authenticated acceptance image.
    var hasComparisonImage: Bool
}

struct PhotoDataSource: Codable, Equatable, Identifiable {
    var name: String
    var status: String

    var id: String { name }
}

// MARK: - Raw canonical fixture shape

/// The raw, unscoped canonical photo set — the fixture's source of truth
/// `PhotosEvidenceCalculator` derives every scoped `PhotosLandingReadModel`
/// from (mirrors `WeightEntryFixture`/`DEXAScanFixture`'s own "raw entries
/// in, scoped+derived report out" convention).
struct PhotoSetFixture: Codable, Equatable, Identifiable {
    var id: String
    var date: String
    var weightLb: Double?
    var poses: [PhotoPoseID]
    /// Per-pose capture condition summary — fixtured presentation text,
    /// not recomputed.
    var conditionSummary: String
}

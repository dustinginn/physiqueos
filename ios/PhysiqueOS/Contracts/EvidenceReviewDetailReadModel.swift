import Foundation

/// Founder Production Evidence Review detail
/// (`evidence-review` native resource, `EvidenceReviewReadService.getReview`).
///
/// The server runs the review through its shared
/// `createEvidenceReviewPresentation` projection, so Native receives the
/// same human-readable titles, summaries, inclusion decisions, metrics,
/// meals/training detail, and source labels as web. Swift only renders that
/// finished presentation; it does not recreate evidence interpretation.
/// DEXA also retains the raw measurement object needed by the existing
/// full-replacement correction command.
struct EvidenceReviewDetailReadModel: Equatable {
    var id: String
    var status: String
    var createdAt: String?
    var version: Int?
    var items: [EvidenceReviewDetailItem]
    var summary: String? = nil
    var excludedSummary: String? = nil
}

struct EvidenceReviewDetailItem: Equatable, Identifiable {
    var id: String
    var type: String
    var date: String?
    var title: String? = nil
    var noun: String? = nil
    var sourceLabel: String? = nil
    var included: Bool = true
    var metrics: [EvidenceReviewMetric] = []
    var exercises: [EvidenceReviewDetailExercise] = []
    var meals: [EvidenceReviewDetailMeal] = []
    var sourceFiles: [String] = []
    var typedEvidence: String? = nil
    var reconciliation: String? = nil
    /// Non-nil only for a DEXA scan object — the exact fields
    /// `dexa-review.measurements.v1` requires Native to resend in full on
    /// every edit (the server replaces, never merges).
    var dexaMeasurements: DEXAScanMeasurements? = nil
}

struct EvidenceReviewMetric: Equatable, Identifiable {
    var id: String { label }
    var label: String
    var value: String
}

struct EvidenceReviewDetailExercise: Equatable, Identifiable {
    var id: String { name }
    var name: String
    var sets: [String]
    var occurrenceLabel: String? = nil
    var variantLabel: String? = nil
    var proposedNewExercise: Bool = false
    var supersetWith: [String] = []
}

struct EvidenceReviewDetailMeal: Equatable, Identifiable {
    var id: String
    var name: String
    var summary: String
    var foods: [EvidenceReviewDetailFood]
}

struct EvidenceReviewDetailFood: Equatable, Identifiable {
    var id: String
    var name: String
    var brand: String?
    var serving: String?
    var calories: String?
}

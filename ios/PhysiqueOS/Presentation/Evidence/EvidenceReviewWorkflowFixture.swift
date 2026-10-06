import Foundation

#if DEBUG
// MARK: - Review-only fixtures (`evidence:review=<id>`), never in Release

enum EvidenceReviewWorkflowFixture {
    enum Load { case review(EvidenceReviewDetailReadModel, EvidenceReviewDetailView.ActionState), loading, failed, notFound }

    static func review(for reviewId: String) -> Load? {
        guard reviewId.hasPrefix("fixture-") else { return nil }
        let key = String(reviewId.dropFirst("fixture-".count))
        switch key {
        case "loading": return .loading
        case "failed": return .failed
        case "notfound": return .notFound
        case "mixed": return .review(mixed(status: "pending"), .idle)
        case "photo": return .review(photo, .idle)
        case "dexa": return .review(dexa, .idle)
        case "dexa-correction": return .review(dexa, .editingMeasurements)
        case "workout": return .review(workout, .idle)
        default:
            if key.hasPrefix("status-") { return .review(mixed(status: String(key.dropFirst("status-".count))), .idle) }
            if key.hasPrefix("state-") {
                let state: EvidenceReviewDetailView.ActionState = switch key.dropFirst("state-".count) {
                case "saving": .savingMeasurements
                case "confirming": .confirming("Confirming…")
                case "dismissing": .dismissing
                case "dismissed": .dismissed
                case "accepted": .accepted
                case "confirmed": .confirmed
                case "still": .stillProcessing
                case "refresh": .refreshRequired("The correction may have been accepted, but its final state could not be verified. Refresh before making another change.")
                default: .failed("This review could not be updated.")
                }
                return .review(mixed(status: "pending"), state)
            }
            return nil
        }
    }

    static func mixed(status: String) -> EvidenceReviewDetailReadModel {
        EvidenceReviewDetailReadModel(
            id: "fixture-mixed", status: status, createdAt: nil, version: 4,
            items: [
                EvidenceReviewDetailItem(id: "n1", type: "nutrition", date: "2026-09-23", title: "Nutrition", sourceLabel: "Screenshot", included: true,
                    metrics: [.init(label: "Calories", value: "2,300 cal"), .init(label: "Protein", value: "198 g"), .init(label: "Carbs", value: "244 g"), .init(label: "Fat", value: "73 g")],
                    meals: [.init(id: "m1", name: "Daily totals", summary: "Meal totals match the daily total.", foods: [])]),
                EvidenceReviewDetailItem(id: "a1", type: "activity", date: "2026-09-23", title: "Activity", sourceLabel: "Screenshot", included: false,
                    metrics: [.init(label: "Active calories", value: "650 cal"), .init(label: "Exercise", value: "45 min")]),
            ],
            summary: "1 nutrition entry and 1 activity entry",
            excludedSummary: "1 activity entry excluded"
        )
    }

    static let photo = EvidenceReviewDetailReadModel(
        id: "fixture-photo", status: "pending", createdAt: nil, version: 4,
        items: [EvidenceReviewDetailItem(id: "p1", type: "photo_session", date: "2026-09-23", title: "Progress Photos", sourceLabel: "Progress photos", included: true,
            metrics: [.init(label: "Poses", value: "1 photo · Rear Relaxed"), .init(label: "Time of day", value: "Afternoon"), .init(label: "Goal relationship", value: "Build Lean Mass"), .init(label: "Source", value: "Progress photos")],
            photoSession: EvidenceReviewPhotoSession(sessionId: "photo_session_20260923", timeOfDay: "afternoon", goalRelationship: "Build Lean Mass", photos: [EvidenceReviewPhotoIdentity(id: "ph1", poseId: nil, label: "Rear Relaxed", orientation: nil, contractionState: nil, poseVariant: nil)]))]
    )

    static let dexa = EvidenceReviewDetailReadModel(
        id: "fixture-dexa", status: "pending", createdAt: nil, version: 4,
        items: [EvidenceReviewDetailItem(id: "d1", type: "dexa_scan", date: "2026-09-23", title: "DEXA", sourceLabel: "Submitted evidence", included: true,
            metrics: [.init(label: "Total mass", value: "172.9 lb"), .init(label: "Body fat", value: "8.1%"), .init(label: "Fat tissue", value: "14.0 lb"), .init(label: "Lean tissue", value: "152.3 lb"), .init(label: "Bone mineral", value: "6.6 lb"), .init(label: "RMR", value: "1,774 kcal/day"), .init(label: "VAT mass", value: "0.24 lb"), .init(label: "VAT volume", value: "7.1 in³"), .init(label: "PDF", value: "BodySpec_DXA_2026-09-23.pdf")],
            dexaMeasurements: DEXAScanMeasurements(measuredAt: "2026-09-23", totalMassLb: 172.9, bodyFatPercentage: 8.1, fatMassLb: 14.0, leanMassLb: 152.3, boneMineralContentLb: 6.6, restingMetabolicRateKcal: 1774, visceralAdiposeTissueMassLb: 0.24, visceralAdiposeTissueVolumeIn3: 7.1))]
    )

    static let workout = EvidenceReviewDetailReadModel(
        id: "fixture-workout", status: "pending", createdAt: nil, version: 2,
        items: [],
        workoutReconciliation: WorkoutReconciliationDetail(
            localDate: "2026-09-23", title: "Apple Health strength workout", summary: "Choose the Logger session this workout belongs to.",
            workout: .init(family: "strength", canonicalType: "traditional_strength_training", startedAt: "2026-09-23T17:02:00-07:00", endedAt: "2026-09-23T18:05:00-07:00"),
            candidates: [.init(loggerSessionCanonicalId: "logger-1", confidence: 92, basis: "logger_session_window", activityType: "traditional_strength_training", startedAt: "2026-09-23T17:00:00-07:00", endedAt: "2026-09-23T18:04:00-07:00")]
        )
    )
}
#endif

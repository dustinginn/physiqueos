import Foundation

/// Reproduces `attachBestComparison`/`finalizeComparisons`
/// (`CanonicalPhotoSessionReadService.js:202-287`) — pure functions
/// deriving a scoped `PhotosLandingReadModel` from raw canonical sets.
///
/// Simplification from the full web algorithm, documented rather than
/// hidden: the web prefers a prior view whose recorded conditions are
/// "broadly comparable" (≤2 material differences) over the plain-nearest
/// one when both exist (`getConditionComparison`). This port always
/// matches the plain-nearest prior view with the same pose — the
/// condition-aware tie-break is not implemented in this fixture-only
/// pass. Every other comparison semantic (same-pose-only matching, scope-
/// respecting — a comparison can never reach outside the selected Goal/
/// Phase window — and the exact `comparedAgainst`/`comparisonStatus`
/// empty-state vocabulary) is faithful.
enum PhotosEvidenceCalculator {
    private static func formatWeight(_ value: Double?) -> String {
        guard let value, value.isFinite else { return "No same-day weight" }
        return String(format: "%.1f lb", value)
    }

    /// Scope is applied FIRST (narrowing which sets exist at all), then
    /// comparisons are computed only among the already-scoped sets — this
    /// is what guarantees a comparison never reaches outside the selected
    /// Goal/Phase window, mirroring `reconcilePhotoSessionComparisons`'s
    /// own out-of-window stripping by construction rather than a separate
    /// reconciliation pass.
    static func report(
        allSets: [PhotoSetFixture], scope: EvidenceScopeSelection, allLabel: String, dataSources: [PhotoDataSource]
    ) -> PhotosLandingReadModel {
        let scopedAscending = EvidenceChronology.filter(allSets, scope: scope, date: \.date).sorted { $0.date < $1.date }
        let withComparisons = attachComparisons(sortedAscending: scopedAscending)
        let attributed = withComparisons.map { set -> PhotoSetRecord in
            var set = set
            set.attributedScope = EvidenceChronology.attribution(forOccurrenceDate: set.date)
            return set
        }

        return PhotosLandingReadModel(
            title: "Progress Photos", subtitle: nil, tone: .primary,
            scope: EvidenceChronology.scopeContext(selected: scope, allLabel: allLabel),
            latestSet: attributed.last,
            history: attributed.reversed(),
            dataSources: dataSources
        )
    }

    /// For each set (ascending), each pose view compares against the most
    /// recent EARLIER set carrying the same pose.
    private static func attachComparisons(sortedAscending sets: [PhotoSetFixture]) -> [PhotoSetRecord] {
        var priorDateByPose: [PhotoPoseID: String] = [:]
        var records: [PhotoSetRecord] = []

        for set in sets {
            let views = set.poses.sorted { $0.order < $1.order }.map { pose -> PhotoViewRecord in
                let priorDate = priorDateByPose[pose]
                if let priorDate {
                    return PhotoViewRecord(
                        id: "\(set.id)-\(pose.rawValue)", poseId: pose, setId: set.id, captureDate: set.date,
                        comparedAgainst: TrainingDateFormatting.short(priorDate),
                        comparisonStatus: "comparable",
                        conditionSummary: set.conditionSummary,
                        sourceHistory: "This comparison uses your \(pose.label) photos from \(TrainingDateFormatting.short(priorDate)) and \(TrainingDateFormatting.short(set.date)).",
                        interpretationSummary: "Visual comparison available for \(pose.label.lowercased()).",
                        comparisonBullets: ["Same pose matched against \(TrainingDateFormatting.short(priorDate))."],
                        hasComparisonImage: true
                    )
                } else {
                    return PhotoViewRecord(
                        id: "\(set.id)-\(pose.rawValue)", poseId: pose, setId: set.id, captureDate: set.date,
                        comparedAgainst: "No prior matching pose",
                        comparisonStatus: "no_prior_matching_pose",
                        conditionSummary: set.conditionSummary,
                        sourceHistory: "This is the first \(pose.label.lowercased()) photo in the selected period.",
                        interpretationSummary: "Baseline \(pose.label.lowercased()) photo — no earlier matching pose to compare against in this period.",
                        comparisonBullets: [],
                        hasComparisonImage: false
                    )
                }
            }
            for pose in set.poses { priorDateByPose[pose] = set.date }

            let comparableCount = views.filter { $0.hasComparisonImage }.count
            records.append(PhotoSetRecord(
                id: set.id, date: set.date, weightLabel: formatWeight(set.weightLb),
                comparisonAvailability: "\(comparableCount)/\(views.count) poses have prior comparisons",
                views: views
            ))
        }
        return records
    }
}

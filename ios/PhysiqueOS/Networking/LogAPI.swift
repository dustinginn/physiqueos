import Foundation

/// Mirrors `HomeAPI`'s pattern: the seam `LogView` depends on instead of a
/// concrete transport.
protocol LogAPI: Sendable {
    func fetchLog() async throws -> LogReadModel
    /// A fresh read (never the short read cache) for surfaces waiting on
    /// Server-side processing.
    func refreshLog() async throws -> LogReadModel
}

extension LogAPI {
    func refreshLog() async throws -> LogReadModel { try await fetchLog() }
}

/// Fixture-backed conformance: decodes the same bundled JSON a live
/// implementation would eventually receive over the network, through the
/// same `LogReadModel` decode path.
struct FixtureLogAPI: LogAPI {
    enum FixtureError: Error {
        case resourceNotFound
    }

    func fetchLog() async throws -> LogReadModel {
#if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-physiqueos.redesign-review") {
            return try await LogRedesignReviewFixture.read(state: LogReviewLaunchConfiguration.state ?? "loaded")
        }
#endif
        guard let url = Bundle.main.url(forResource: "LogFixture", withExtension: "json") else {
            throw FixtureError.resourceNotFound
        }
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(LogReadModel.self, from: data)
    }
}

#if DEBUG
/// DEBUG-only deterministic Log states for the Batch 2 visual parity
/// captures. "loaded" reproduces the locked realistic-density reference
/// (`LOG-DENSE-FIXTURE.json`) through the production read-model shape,
/// including typed provenance; it never reaches Release builds.
enum LogRedesignReviewFixture {
    enum ReviewError: Error { case requested }

    static func read(state: String) async throws -> LogReadModel {
        switch state {
        case "loading":
            try await Task.sleep(for: .seconds(3_600))
            throw ReviewError.requested
        case "error":
            throw ReviewError.requested
        case "empty":
            return LogReadModel(
                localDate: "2026-10-03",
                loggedToday: LoggedTodayRowKind.allReviewKinds.map {
                    LoggedTodayRow(kind: $0, summary: "Nothing logged yet", context: nil,
                                   destination: $0 == .weight ? .progressStream(streamId: "weight") : nil)
                },
                pendingEvidenceReviews: [],
                typedProvenance: true
            )
        case "duplicate":
            var log = loaded
            log.pendingEvidenceReviews = [
                review(id: "review-weight-2026-10-03", title: "Check-in ready to review", summary: "1 weight entry", duplicate: true),
                review(id: "review-nutrition-2026-10-03", title: "Nutrition ready to review", summary: "1 meal", duplicate: false),
            ]
            return log
        case "workout-match":
            var log = loaded
            log.pendingEvidenceReviews = [
                PendingEvidenceReview(id: "review-workout-match-fixture", title: "Possible duplicate workout",
                                      date: "Saturday, October 3", summary: "2 possible Logger sessions",
                                      likelyDuplicate: false, destination: .evidenceReview(reviewId: "review-workout-match-fixture"),
                                      kind: "healthkit_workout_reconciliation"),
            ]
            return log
        case "processing":
            var log = loaded
            log.pendingEvidenceReviews = []
            log.loggedToday[1] = LoggedTodayRow(
                kind: .nutrition, summary: "Nutrition processing",
                context: "Confirmation accepted · No action required",
                contextDetail: "Confirmation accepted · No action required",
                destination: nil, processing: true
            )
            log.processingEvidenceReviews = [
                ProcessingEvidenceReview(id: "review-nutrition-processing", localDate: "2026-10-03", domain: "nutrition", label: "Nutrition", status: "accepted_processing"),
                ProcessingEvidenceReview(id: "review-dexa-processing", localDate: "2026-10-03", domain: "dexa", label: "DEXA", status: "accepted_processing"),
            ]
            return log
        default:
            return loaded
        }
    }

    private static let appleHealth = LoggedTodaySource(kind: "apple_health", label: "Apple Health")
    private static let logger = LoggedTodaySource(kind: "physiqueos_logger", label: "PhysiqueOS Logger")

    static var loaded: LogReadModel {
        LogReadModel(
            localDate: "2026-10-03",
            loggedToday: [
                LoggedTodayRow(
                    kind: .training,
                    summary: "Strength Training · 64 min, Stair Stepper · 13 min",
                    context: nil, contextDetail: nil, provenance: nil,
                    destination: .trainingDay(date: "2026-10-03"),
                    lines: [
                        LoggedTodayLine(id: "training:logger", kind: "logger", summary: "Strength Training · 64 min",
                                        provenance: LoggedTodayProvenance(scope: "Strength Training", sources: [logger])),
                        LoggedTodayLine(id: "training:cardio:stair-stepper", kind: "cardio", summary: "Stair Stepper · 13 min",
                                        provenance: LoggedTodayProvenance(scope: "Stair Stepper", sources: [appleHealth])),
                    ]
                ),
                LoggedTodayRow(
                    kind: .nutrition, summary: "2,516 calories",
                    context: "215P · 161C · 111F · Apple Health", contextDetail: "215P · 161C · 111F",
                    provenance: LoggedTodayProvenance(scope: "Nutrition", sources: [appleHealth]),
                    destination: .nutritionDay(dayId: "nutrition-day-2026-10-03")
                ),
                LoggedTodayRow(
                    kind: .activity, summary: "771 active calories so far",
                    context: "Apple Health", contextDetail: nil,
                    provenance: LoggedTodayProvenance(scope: "Activity", sources: [appleHealth]),
                    destination: .activityDay(date: "2026-10-03")
                ),
                LoggedTodayRow(
                    kind: .weight, summary: "176.7 lb", context: nil,
                    provenance: LoggedTodayProvenance(scope: "Weight", sources: [.unavailable]),
                    destination: .progressStream(streamId: "weight")
                ),
            ],
            pendingEvidenceReviews: [
                review(id: "review-weight-2026-10-03", title: "Check-in ready to review", summary: "1 weight entry", duplicate: false),
            ],
            typedProvenance: true
        )
    }

    private static func review(id: String, title: String, summary: String, duplicate: Bool) -> PendingEvidenceReview {
        PendingEvidenceReview(id: id, title: title, date: "Saturday, October 3", summary: summary,
                              likelyDuplicate: duplicate, destination: .evidenceReview(reviewId: id))
    }
}

private extension LoggedTodayRowKind {
    static let allReviewKinds: [LoggedTodayRowKind] = [.training, .nutrition, .activity, .weight]
}
#endif

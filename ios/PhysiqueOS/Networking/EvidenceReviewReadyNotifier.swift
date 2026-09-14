import UserNotifications

/// The fallback path for Finding 5's "upload should flow directly into
/// review when fast": when the upload flow's own brief in-flow look
/// doesn't catch interpretation finishing in time, this continues polling
/// and posts a local "ready to review" notification the moment it does —
/// reusing the exact same notification delegate/routing infrastructure
/// `PriorityNotificationDelegate` already provides (its default-action
/// handling already decodes a `destination` from `userInfo` generically,
/// regardless of category, so nothing there needed to change for this).
///
/// This only survives while the app stays active in the foreground/
/// background-suspended-but-not-terminated window a plain `Task` gets — no
/// `BGTaskScheduler` registration exists here. An app that gets fully
/// terminated before this resolves simply won't receive the fallback
/// notification; the review remains safely reachable later via Evidence
/// Hub regardless, so nothing is lost, only the proactive nudge.
enum EvidenceReviewReadyNotifier {
    @MainActor
    static func pollAndNotify(
        pipeline: ProductionEvidenceIntakePipeline,
        reviewAPI: EvidenceReviewAPI,
        intakeId: String,
        domainLabel: String,
        effectiveDate: String,
        environment: AppEnvironment,
        pollInterval: Duration = .seconds(5),
        maxPolls: Int = 60,
        center: UNUserNotificationCenter = .current()
    ) async {
        guard let reviewId = try? await pipeline.awaitReadyIntake(
            intakeId: intakeId, pollInterval: pollInterval, maxPolls: maxPolls
        ) else { return }
        // Suppress rather than notify when: the Founder is already looking
        // at this exact review, or it has since been confirmed/dismissed/
        // superseded through some other path (e.g. found manually via
        // Evidence Hub before this poll caught up).
        guard environment.currentlyViewingReviewId != reviewId else { return }
        guard let review = try? await reviewAPI.fetchReview(reviewId: reviewId), review.status == "pending" else { return }

        let content = UNMutableNotificationContent()
        content.title = "\(domainLabel) ready to review"
        content.body = "Your \(Self.shortDate(effectiveDate)) \(domainLabel.lowercased()) is ready to confirm."
        content.sound = .default
        content.categoryIdentifier = PriorityNotificationCategory.evidenceReviewReady
        if let destinationData = try? JSONEncoder().encode(AppDestination.evidenceReview(reviewId: reviewId)) {
            content.userInfo = ["destination": destinationData]
        }
        let request = UNNotificationRequest(identifier: "evidence.reviewReady.\(reviewId)", content: content, trigger: nil)
        try? await center.add(request)
    }

    private static func shortDate(_ isoDate: String) -> String {
        let parts = isoDate.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return isoDate }
        var components = DateComponents()
        components.year = parts[0]
        components.month = parts[1]
        components.day = parts[2]
        guard let date = Calendar(identifier: .gregorian).date(from: components) else { return isoDate }
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        return formatter.string(from: date)
    }
}

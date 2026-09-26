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
    @MainActor private static var observations: [String: Task<Void, Never>] = [:]

    /// Process-owned observation rather than a view-owned fire-and-forget
    /// task. Navigating away from the upload screen must not orphan the
    /// accepted running-app Review-ready promise.
    @MainActor
    static func beginObservation(
        pipeline: ProductionEvidenceIntakePipeline,
        reviewAPI: EvidenceReviewAPI,
        intakeId: String,
        domainLabel: String,
        effectiveDate: String,
        environment: AppEnvironment
    ) {
        guard observations[intakeId] == nil else { return }
        NotificationDiagnostics.record(.init(
            capturedAt: Date(), identifier: "evidence.intake.\(intakeId)",
            operation: "review-ready observation started",
            reason: "The running app owns polling until publication or the bounded deadline.",
            fireDate: nil, timeZoneIdentifier: TimeZone.current.identifier
        ))
        observations[intakeId] = Task { @MainActor in
            await pollAndNotify(
                pipeline: pipeline, reviewAPI: reviewAPI, intakeId: intakeId,
                domainLabel: domainLabel, effectiveDate: effectiveDate,
                environment: environment
            )
            observations[intakeId] = nil
        }
    }

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
        guard let reviewId = try? await pipeline.awaitReadyIntakeResilient(
            intakeId: intakeId, pollInterval: pollInterval, maxPolls: maxPolls
        ) else {
            NotificationDiagnostics.record(.init(
                capturedAt: Date(), identifier: "evidence.intake.\(intakeId)",
                operation: "review-ready observation ended",
                reason: "No ready publication was observed before the bounded running-app deadline.",
                fireDate: nil, timeZoneIdentifier: TimeZone.current.identifier
            ))
            return
        }
        // Suppress rather than notify when: the Founder is already looking
        // at this exact review, or it has since been confirmed/dismissed/
        // superseded through some other path (e.g. found manually via
        // Evidence Hub before this poll caught up).
        guard environment.currentlyViewingReviewId != reviewId else {
            recordSuppression(reviewId: reviewId, reason: "The exact review is already open.")
            return
        }
        guard let review = try? await reviewAPI.fetchReview(reviewId: reviewId), review.status == "pending" else {
            recordSuppression(reviewId: reviewId, reason: "The review is no longer pending.")
            return
        }

        let request = request(
            reviewId: reviewId, domainLabel: domainLabel, effectiveDate: effectiveDate
        )
        do {
            try await center.add(request)
            NotificationDiagnostics.record(.init(
                capturedAt: Date(), identifier: request.identifier,
                operation: "review-ready scheduled",
                reason: "iOS accepted the immediate canonical Review-ready publication request.",
                fireDate: Date(), timeZoneIdentifier: TimeZone.current.identifier,
                categoryIdentifier: request.content.categoryIdentifier,
                triggerDescription: "immediate (no trigger)"
            ))
        } catch {
            NotificationDiagnostics.record(.init(
                capturedAt: Date(), identifier: request.identifier,
                operation: "review-ready rejected",
                reason: "iOS rejected the local Review-ready request.",
                fireDate: nil, timeZoneIdentifier: TimeZone.current.identifier,
                categoryIdentifier: request.content.categoryIdentifier,
                triggerDescription: "immediate (no trigger)"
            ))
        }
    }

    static func request(
        reviewId: String, domainLabel: String, effectiveDate: String
    ) -> UNNotificationRequest {
        let content = UNMutableNotificationContent()
        content.title = "\(domainLabel) ready to review"
        content.body = "Your \(Self.shortDate(effectiveDate)) \(domainLabel.lowercased()) is ready to confirm."
        content.sound = .default
        content.categoryIdentifier = PriorityNotificationCategory.evidenceReviewReady
        if let destinationData = try? JSONEncoder().encode(AppDestination.evidenceReview(reviewId: reviewId)),
           let destinationJSON = String(data: destinationData, encoding: .utf8) {
            // A property-list String is safe for the notification daemon and
            // the delegate's synchronous Sendable snapshot boundary. The
            // decoder still accepts Build 36-38 Data payloads for already-
            // scheduled notifications.
            content.userInfo = ["destinationJSON": destinationJSON]
        }
        return UNNotificationRequest(
            identifier: "evidence.reviewReady.\(reviewId)", content: content, trigger: nil
        )
    }

    @MainActor
    private static func recordSuppression(reviewId: String, reason: String) {
        NotificationDiagnostics.record(.init(
            capturedAt: Date(), identifier: "evidence.reviewReady.\(reviewId)",
            operation: "review-ready suppressed", reason: reason,
            fireDate: nil, timeZoneIdentifier: TimeZone.current.identifier,
            categoryIdentifier: PriorityNotificationCategory.evidenceReviewReady,
            triggerDescription: "immediate (no trigger)"
        ))
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

/// A canonical-publication notifier for Midweek, Weekly, Monthly, DEXA,
/// and Photo Event briefings. Home cards exist only for already-published
/// briefing artifacts, so this never guesses from a scheduled generation
/// time. The first production read establishes a baseline without alerting
/// for old history; each later unseen artifact produces exactly one local
/// notification and deep-links to that artifact.
///
/// This uses the same running-app local delivery boundary as the accepted
/// Evidence Review-ready notifier. A future remote/background publication
/// architecture can replace the observation transport without changing the
/// canonical artifact identity or deep link encoded here.
enum BriefingReadyNotifier {
    private static let observedKey = "physiqueos.briefing-publications-observed.v1"

    @MainActor
    static func reconcile(
        cards: [HomeBriefingCard],
        center: UNUserNotificationCenter = .current(),
        defaults: UserDefaults = .standard
    ) async {
        let currentIDs = Set(cards.map(\.id))
        guard defaults.object(forKey: observedKey) != nil else {
            defaults.set(Array(currentIDs).sorted(), forKey: observedKey)
            return
        }
        let observed = Set(defaults.stringArray(forKey: observedKey) ?? [])
        let requests = requestsForNewPublications(cards: cards, observedIDs: observed)
        for request in requests {
            try? await center.add(request)
        }
        defaults.set(Array(observed.union(currentIDs)).sorted(), forKey: observedKey)
    }

    static func requestsForNewPublications(
        cards: [HomeBriefingCard], observedIDs: Set<String>
    ) -> [UNNotificationRequest] {
        cards.compactMap { card in
            guard !observedIDs.contains(card.id),
                  let destination = card.destination,
                  let destinationData = try? JSONEncoder().encode(destination),
                  let destinationJSON = String(data: destinationData, encoding: .utf8)
            else { return nil }
            let content = UNMutableNotificationContent()
            content.title = card.title
            content.body = "Your \(card.sectionLabel.lowercased()) is ready."
            content.sound = .default
            content.categoryIdentifier = PriorityNotificationCategory.briefingReady
            // A JSON string is a stable property-list value across the
            // notification daemon/process-launch boundary. Seal the artifact
            // id separately so the response handler can reject a mismatched
            // or generic destination without losing the exact target.
            content.userInfo = [
                "destinationJSON": destinationJSON,
                "briefingArtifactId": card.id,
            ]
            return UNNotificationRequest(
                identifier: "briefing.ready.\(card.id)", content: content, trigger: nil
            )
        }
    }
}

/// Notifies the Founder when automatic HealthKit sync/reassessment creates a
/// new Founder-facing Strength workout-reconciliation review to act on,
/// instead of relying on discovering it in Pending Review manually. Exactly
/// `BriefingReadyNotifier`'s pattern (diff the just-loaded list against a
/// persisted "already observed" id set, notify once per genuinely new id,
/// deep-link, no server push involved) applied to Log's own
/// `pendingEvidenceReviews`, scoped to exactly the reconciliation kind:
///  - deduplicated/idempotent: a repeated reassessment that produces no NEW
///    review id notifies nothing (the id is already in the observed set);
///  - never fires for automatically canonicalized Cardio: Cardio never
///    creates a reconciliation review at all (only an ambiguous/possible
///    Strength match does), so it can never appear in the list being diffed;
///  - never fires merely because a candidate was recomputed without a new
///    review: the diff is against review IDENTITY, not assessment content;
///  - a resolved review produces no stale repeat notification: Log's
///    `pendingEvidenceReviews` only ever contains reviews the server itself
///    still considers pending, so a resolved review drops out of the list
///    (and therefore out of any future diff) the moment it resolves.
enum WorkoutReconciliationReviewReadyNotifier {
    private static let observedKey = "physiqueos.workout-reconciliation-reviews-observed.v1"
    private static let reconciliationKind = "healthkit_workout_reconciliation"

    @MainActor
    static func reconcile(
        reviews: [PendingEvidenceReview],
        center: UNUserNotificationCenter = .current(),
        defaults: UserDefaults = .standard
    ) async {
        let reconciliationReviews = reviews.filter { $0.kind == reconciliationKind }
        let currentIDs = Set(reconciliationReviews.map(\.id))
        guard defaults.object(forKey: observedKey) != nil else {
            defaults.set(Array(currentIDs).sorted(), forKey: observedKey)
            return
        }
        let observed = Set(defaults.stringArray(forKey: observedKey) ?? [])
        let requests = requestsForNewReviews(reviews: reconciliationReviews, observedIDs: observed)
        for request in requests {
            try? await center.add(request)
        }
        defaults.set(Array(observed.union(currentIDs)).sorted(), forKey: observedKey)
    }

    static func requestsForNewReviews(
        reviews: [PendingEvidenceReview], observedIDs: Set<String>
    ) -> [UNNotificationRequest] {
        reviews.compactMap { review in
            guard review.kind == reconciliationKind, !observedIDs.contains(review.id),
                  let destinationData = try? JSONEncoder().encode(review.destination),
                  let destinationJSON = String(data: destinationData, encoding: .utf8)
            else { return nil }
            let content = UNMutableNotificationContent()
            content.title = "Workout needs review"
            content.body = "\(review.title) (\(review.date)) — \(review.summary)."
            content.sound = .default
            content.categoryIdentifier = PriorityNotificationCategory.evidenceReviewReady
            content.userInfo = ["destinationJSON": destinationJSON]
            return UNNotificationRequest(
                identifier: "evidence.reviewReady.\(review.id)", content: content, trigger: nil
            )
        }
    }
}

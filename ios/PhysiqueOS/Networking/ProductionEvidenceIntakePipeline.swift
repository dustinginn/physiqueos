import CryptoKit
import Foundation

/// Drives the shared async evidence-intake → interpret → confirm pipeline
/// (`POST /api/v1/native/evidence/intakes` → `GET .../evidence/intakes/{id}`
/// → `evidence-review.commit.v1` → `GET native/read/evidence-review`) used
/// by Nutrition, Activity, and DEXA screenshot/PDF evidence alike. Native
/// never re-implements interpretation, canonical commit, Goal/Phase
/// attribution, or Briefing/Event generation — all of that happens
/// server-side, driven to completion by a durable outbox worker once
/// `commitReview` kicks off confirmation. This type only submits, polls,
/// and reports progress; it never fabricates a "done" state early.
struct ProductionEvidenceIntakePipeline {
    let api: ProductionNativeAPI
    let idempotencyStore: ProductionIdempotencyKeyStore

    enum Error: Swift.Error, Equatable {
        case interpretationFailed
        case stillProcessing
        case commitFailed
        case timedOut
    }

    /// A POST may reach canonical authority even when its response is lost
    /// or a synchronous continuation fails afterward. These errors mean
    /// “acceptance unknown”; callers must refresh/poll with the same
    /// idempotency identity and must not offer a blind mutation retry.
    static func acceptanceIsUncertain(after error: Swift.Error) -> Bool {
        guard let error = error as? ProductionNativeError else { return false }
        switch error {
        case .networkFailure, .invalidResponse, .temporaryServer, .server:
            return true
        default:
            return false
        }
    }

    /// Step 1 — upload the file(s). `scope` should uniquely identify this
    /// logical submission (e.g. `"dexa-intake.\(effectiveDate)"`) so a
    /// retry after a dropped response reuses the same `submissionIdentity`
    /// rather than creating a second intake for the same evidence.
    func submitIntake(
        scope: String,
        effectiveDate: String,
        expectedEvidenceType: String,
        clientExtractedText: String? = nil,
        files: [(filename: String, contentType: String, data: Data)],
        onUploadProgress: @escaping @Sendable (Double) -> Void = { _ in }
    ) async throws -> ProductionEvidenceIntakeStatus {
        let domain: NativeProductWriteDomain
        switch expectedEvidenceType {
        case "nutrition": domain = .nutrition
        case "activity", "activity_day": domain = .activityEvidence
        case "training": domain = .workoutLogger
        case "dexa", "dexa_scan": domain = .dexa
        default: domain = .evidenceReview
        }
        try NativeProductWriteGuard.authorize(domain, in: .founderProduction)
        let signature = ProductionIdempotentSubmission.signature([
            expectedEvidenceType,
            effectiveDate,
            files.map { file in
                let digest = SHA256.hash(data: file.data).map { String(format: "%02x", $0) }.joined()
                return "\(file.filename)|\(file.contentType)|\(digest)"
            }.joined(separator: ","),
            clientExtractedText.map {
                SHA256.hash(data: Data($0.utf8)).map { String(format: "%02x", $0) }.joined()
            } ?? "-",
        ])
        let submissionIdentity = idempotencyStore.resolvedKey(scope: scope, signature: signature)
        return try await api.submitEvidenceIntake(
            submissionIdentity: submissionIdentity,
            effectiveDate: effectiveDate,
            expectedEvidenceType: expectedEvidenceType,
            clientExtractedText: clientExtractedText,
            files: files,
            onUploadProgress: onUploadProgress
        )
    }

    /// Step 2 — poll until interpretation finishes. `onProgress` fires
    /// once per poll so a caller can update UI copy; polling stops the
    /// moment `status` is `"ready"` or `"processing_failed"`.
    func awaitReadyIntake(
        intakeId: String,
        pollInterval: Duration = .seconds(2),
        maxPolls: Int = 30,
        onProgress: (@Sendable (ProductionEvidenceIntakeStatus) -> Void)? = nil
    ) async throws -> String {
        var status = try await api.fetchEvidenceIntakeStatus(intakeId: intakeId)
        var attempts = 0
        while !status.isReady, !status.isFailed, attempts < maxPolls {
            onProgress?(status)
            try await Task.sleep(for: pollInterval)
            status = try await api.fetchEvidenceIntakeStatus(intakeId: intakeId)
            attempts += 1
        }
        if status.isFailed { throw Error.interpretationFailed }
        guard status.isReady, let reviewId = status.reviewId else { throw Error.stillProcessing }
        EvidenceLifecycleDiagnostics.recordReady(status)
        return reviewId
    }

    /// The upload response may already carry canonical review-ready
    /// publication. Do not add a network round trip in that ordinary case.
    /// A review identity alone is not proof that publication completed.
    func readyReview(
        for intake: ProductionEvidenceIntakeStatus,
        pollInterval: Duration = .seconds(1),
        maxPolls: Int = 3
    ) async throws -> String {
        if intake.isFailed { throw Error.interpretationFailed }
        if intake.isReady, let reviewId = intake.reviewId {
            EvidenceLifecycleDiagnostics.recordReady(intake)
            return reviewId
        }
        return try await awaitReadyIntake(intakeId: intake.intakeId, pollInterval: pollInterval, maxPolls: maxPolls)
    }

    /// Running-app publication observation must not disappear because one
    /// status poll hit a transient transport interruption. Unlike the brief
    /// in-flow wait above, this owns a longer bounded deadline and retries
    /// only ambiguity-class transport failures; explicit server rejection
    /// and a published processing failure still stop immediately.
    func awaitReadyIntakeResilient(
        intakeId: String,
        pollInterval: Duration = .seconds(5),
        maxPolls: Int = 60
    ) async throws -> String {
        for attempt in 0..<maxPolls {
            do {
                let status = try await api.fetchEvidenceIntakeStatus(intakeId: intakeId)
                if status.isFailed { throw Error.interpretationFailed }
                if status.isReady, let reviewId = status.reviewId {
                    EvidenceLifecycleDiagnostics.recordReady(status)
                    return reviewId
                }
            } catch {
                guard Self.acceptanceIsUncertain(after: error) else { throw error }
            }
            if attempt + 1 < maxPolls { try await Task.sleep(for: pollInterval) }
        }
        throw Error.stillProcessing
    }

    /// Step 3 — kick off confirmation. A durable outbox worker drives the
    /// remaining orchestration steps automatically; Native never needs to
    /// re-POST this command to make progress (per confirmed server
    /// behavior — see `ProductionEvidenceReviewConfirmation`'s doc
    /// comment). `expectedVersion` is the review's current `version`
    /// (read fresh via `EvidenceReviewAPI.fetchReview` immediately before
    /// calling, same discipline as Weight's same-day correction).
    func commitReview(
        domain: NativeProductWriteDomain,
        reviewId: String,
        expectedVersion: String,
        targetTrainingSessionCanonicalId: String? = nil
    ) async throws -> ProductionEvidenceReviewConfirmation? {
        try NativeProductWriteGuard.authorize(domain, in: .founderProduction)
        let scope = "evidence-review.commit.\(reviewId)"
        let signature = ProductionIdempotentSubmission.signature([
            ProductionCommandType.commitEvidenceReview, reviewId, expectedVersion,
            targetTrainingSessionCanonicalId ?? "-",
        ])
        var payload = ["reviewId": reviewId]
        if let targetTrainingSessionCanonicalId {
            payload["targetTrainingSessionCanonicalId"] = targetTrainingSessionCanonicalId
        }
        let outcome: ProductionCommandOutcome<ProductionJSONValue> = try await api.submitCommand(
            ProductionCommandType.commitEvidenceReview,
            idempotencyKey: idempotencyStore.resolvedKey(scope: scope, signature: signature),
            expectedVersion: expectedVersion,
            payload: payload
        )
        return outcome.confirmation
    }

    /// Canonically discards an approved pending review. The same review
    /// version used by Confirm is required, so a stale screen cannot
    /// dismiss evidence that changed after it was loaded. Disposition is
    /// deliberately fixed rather than accepted from presentation code.
    func dismissReview(
        domain: NativeProductWriteDomain,
        reviewId: String,
        expectedVersion: String
    ) async throws {
        try NativeProductWriteGuard.authorize(.evidenceReviewDismissal, in: .founderProduction)
        let scope = "evidence-review.dispose.\(reviewId)"
        let signature = ProductionIdempotentSubmission.signature([
            ProductionCommandType.disposeEvidenceReview, reviewId, expectedVersion, "discarded",
        ])
        let outcome: ProductionCommandOutcome<ProductionJSONValue> = try await api.submitCommand(
            ProductionCommandType.disposeEvidenceReview,
            idempotencyKey: idempotencyStore.resolvedKey(scope: scope, signature: signature),
            expectedVersion: expectedVersion,
            payload: ["reviewId": reviewId, "disposition": "discarded"]
        )
        guard outcome.outcome != .pending else { throw Error.stillProcessing }
    }

    /// Step 4 — poll the review's own read resource until canonical commit
    /// completes. This is the ONLY reliable way to learn the outcome —
    /// the command response never carries the resulting canonical
    /// identity (Goal/Phase attribution and any DEXA/Training Event
    /// Briefing are already generated by the time `status == "confirmed"`,
    /// entirely server-side).
    func awaitConfirmation(
        reviewAPI: EvidenceReviewAPI,
        reviewId: String,
        pollInterval: Duration = .seconds(2),
        maxPolls: Int = 30,
        onProgress: (@Sendable (String) -> Void)? = nil
    ) async throws {
        var attempts = 0
        while attempts < maxPolls {
            guard let review = try await reviewAPI.fetchReview(reviewId: reviewId) else { throw Error.stillProcessing }
            switch review.status {
            case "confirmed": return
            case "commit_failed": throw Error.commitFailed
            default: onProgress?(review.status)
            }
            try await Task.sleep(for: pollInterval)
            attempts += 1
        }
        throw Error.timedOut
    }
}

import CryptoKit
import Foundation
import os

/// What Native could safely learn about a photo it refused: the selected
/// ordinal, the picker's type label, the byte length, and the bytes'
/// signature family. Never the pixels, never the file name.
struct UnsupportedPhotoDiagnostic: Equatable, Sendable {
    var ordinal: Int
    var reportedContentType: String?
    var byteLength: Int
    var classification: String
}

enum StagedPhotoIntakeError: Error, Equatable, LocalizedError {
    case photoUnavailable(attachmentId: String)
    case unsupportedPhoto(attachmentId: String, diagnostic: UnsupportedPhotoDiagnostic)
    case photoTooLarge(attachmentId: String, ordinal: Int, bytes: Int, limit: Int)
    case derivativeUnavailable(attachmentId: String)
    case tooManyPhotos(count: Int)
    case noPendingIntake
    case rejected(code: String)
    case incompleteAfterTransfer

    var errorDescription: String? {
        switch self {
        case .photoUnavailable: "One of the selected photos could not be read. Remove it and choose it again."
        case .unsupportedPhoto(_, let diagnostic):
            "Photo \(diagnostic.ordinal) is \(EvidenceAttachmentLoader.unsupportedPhotoDescription(diagnostic.classification)), which PhysiqueOS can't accept. Progress Photos can be \(EvidenceAttachmentLoader.supportedPhotoContainerSummary)."
        case .photoTooLarge(_, let ordinal, let bytes, let limit):
            "Photo \(ordinal) is \(bytes / 1_048_576) MB, larger than the \(limit / 1_048_576) MB PhysiqueOS accepts for this kind of photo."
        case .derivativeUnavailable: "One HEIC or ProRAW photo could not be prepared for review. Choose it again."
        case .tooManyPhotos(let count): "\(count) photos were selected; PhysiqueOS accepts up to \(StagedPhotoIntakePlan.maximumOriginals) per session."
        case .noPendingIntake: "There is no photo upload waiting to resume."
        case .rejected(let code): "PhysiqueOS did not accept this photo set (\(code)). Discard it and upload again."
        case .incompleteAfterTransfer: "Every photo was sent, but PhysiqueOS has not confirmed the full set yet. Resume to check again."
        }
    }
}

/// Drives one staged Progress Photos intake to durable Server acceptance.
///
/// Lifecycle: `prepare` stages the exact bytes and the deterministic plan on
/// disk; `submit` declares the intake (idempotently), transfers each
/// artifact the Server does not already hold, and returns the Server's
/// receipt once media is complete; `resume` re-enters `submit` for a plan
/// left pending by a lost response, a suspension, or a relaunch. Server
/// progress always wins over local memory, so a lost acknowledgement never
/// causes a duplicate transfer and a duplicate transfer never duplicates an
/// object. Nothing here completes a priority, creates a review, or touches
/// canonical state: the Server's interpretation worker and the existing
/// Evidence Review lifecycle do that after media is complete.
struct StagedPhotoIntakeCoordinator: Sendable {
    let api: ProductionNativeAPI
    let store: any StagedPhotoIntakeStore
    let idempotencyStore: ProductionIdempotencyKeyStore
    var now: @Sendable () -> Date = Date.init
    var derivative: @Sendable (Data) -> Data? = { PhotoAnalysisDerivativeGenerator.jpegDerivative(from: $0) }

    func pendingPlan() async -> StagedPhotoIntakePlan? {
        (try? await store.loadPlan()).flatMap { $0.mediaComplete ? nil : $0 }
    }

    func discardPending() async {
        try? await store.discard()
    }

    private static let logger = Logger(subsystem: "com.physiqueos.native", category: "ProgressPhotos")

    /// Stages the set: originals verbatim (HEIC/HEIF and ProRAW DNG included,
    /// never re-encoded or resized), one bounded JPEG derivative per original
    /// whose container analysis cannot read directly, and the plan whose
    /// identity every retry will reuse.
    func prepare(
        scope: String,
        effectiveDate: String,
        attachments: [SandboxAttachment],
        photoIdentitiesJSON: String,
        session: ProgressPhotoSessionDraft
    ) async throws -> StagedPhotoIntakePlan {
        try NativeProductWriteGuard.authorize(.progressPhotos, in: .founderProduction)
        let images = attachments.filter(\.isImage)
        guard images.count <= StagedPhotoIntakePlan.maximumOriginals else { throw StagedPhotoIntakeError.tooManyPhotos(count: images.count) }
        struct Staged { var attachment: SandboxAttachment; var original: EvidenceAttachmentLoader.StagedPhotoRepresentation; var derivative: Data? }
        var staged: [Staged] = []
        for (index, attachment) in images.enumerated() {
            let ordinal = index + 1
            guard let data = attachment.data, !data.isEmpty else { throw StagedPhotoIntakeError.photoUnavailable(attachmentId: attachment.id) }
            guard let representation = EvidenceAttachmentLoader.stagedPhotoRepresentation(data: data) else {
                let diagnostic = UnsupportedPhotoDiagnostic(
                    ordinal: ordinal, reportedContentType: attachment.contentType, byteLength: data.count,
                    classification: EvidenceAttachmentLoader.describeUnsupportedImageBytes(data)
                )
                // Self-identifying without device-log extraction: ordinal, the
                // picker's label, length, and signature family — never bytes.
                Self.logger.error("progressPhotos.unsupported ordinal=\(diagnostic.ordinal, privacy: .public) reportedType=\(diagnostic.reportedContentType ?? "nil", privacy: .public) bytes=\(diagnostic.byteLength, privacy: .public) classification=\(diagnostic.classification, privacy: .public)")
                throw StagedPhotoIntakeError.unsupportedPhoto(attachmentId: attachment.id, diagnostic: diagnostic)
            }
            let limit = StagedPhotoIntakePlan.originalMaximumBytes(for: representation.contentType)
            guard representation.data.count <= limit else {
                Self.logger.error("progressPhotos.tooLarge ordinal=\(ordinal, privacy: .public) type=\(representation.contentType, privacy: .public) bytes=\(representation.data.count, privacy: .public) limit=\(limit, privacy: .public)")
                throw StagedPhotoIntakeError.photoTooLarge(attachmentId: attachment.id, ordinal: ordinal, bytes: representation.data.count, limit: limit)
            }
            var derivativeData: Data? = nil
            if representation.requiresAnalysisDerivative {
                guard let rendition = derivative(representation.data), rendition.count <= StagedPhotoIntakePlan.derivativeMaximumBytes else {
                    throw StagedPhotoIntakeError.derivativeUnavailable(attachmentId: attachment.id)
                }
                derivativeData = rendition
            }
            staged.append(Staged(attachment: attachment, original: representation, derivative: derivativeData))
        }
        let fileSignature = staged.enumerated().map { index, item in
            "progress-photo-\(index + 1).\(item.original.fileExtension)|\(item.original.contentType)|\(Self.sha256(item.original.data))"
        }.joined(separator: ",")
        let signature = ProductionIdempotentSubmission.signature([
            StagedPhotoIntakePlan.expectedEvidenceType, "staged-media-v1", effectiveDate, fileSignature, photoIdentitiesJSON,
            session.timeOfDay?.rawValue ?? "-", session.fasted.map(String.init) ?? "-", session.postWorkout.map(String.init) ?? "-",
            session.pump.map(String.init) ?? "-", String(session.originalUnedited),
        ])
        let submissionIdentity = idempotencyStore.resolvedKey(scope: scope, signature: signature)
        let replacementPredecessor = idempotencyStore.replacementPredecessor(scope: scope, signature: signature, currentKey: submissionIdentity)

        var artifacts: [StagedPhotoArtifactPlan] = []
        var derivatives: [(ordinalOfOriginal: Int, data: Data, attachmentId: String)] = []
        for (index, item) in staged.enumerated() {
            let ordinal = index + 1
            artifacts.append(StagedPhotoArtifactPlan(
                artifactId: StagedPhotoIntakePlan.artifactId(submissionIdentity: submissionIdentity, ordinal: ordinal),
                ordinal: ordinal, role: .original, derivativeOf: nil,
                fileName: "progress-photo-\(ordinal).\(item.original.fileExtension)", mimeType: item.original.contentType,
                byteLength: item.original.data.count, sha256: Self.sha256(item.original.data), sourceAttachmentId: item.attachment.id
            ))
            if let derivativeData = item.derivative { derivatives.append((ordinal, derivativeData, item.attachment.id)) }
        }
        for derivativeItem in derivatives {
            let ordinal = artifacts.count + 1
            artifacts.append(StagedPhotoArtifactPlan(
                artifactId: StagedPhotoIntakePlan.artifactId(submissionIdentity: submissionIdentity, ordinal: ordinal),
                ordinal: ordinal, role: .analysisDerivative,
                derivativeOf: StagedPhotoIntakePlan.artifactId(submissionIdentity: submissionIdentity, ordinal: derivativeItem.ordinalOfOriginal),
                fileName: "progress-photo-\(derivativeItem.ordinalOfOriginal)-analysis.jpg", mimeType: "image/jpeg",
                byteLength: derivativeItem.data.count, sha256: Self.sha256(derivativeItem.data), sourceAttachmentId: derivativeItem.attachmentId
            ))
        }
        let plan = StagedPhotoIntakePlan(
            submissionIdentity: submissionIdentity, scope: scope, signature: signature, effectiveDate: effectiveDate,
            session: StagedPhotoSessionDeclaration(
                originalUnedited: session.originalUnedited, timeOfDay: session.timeOfDay?.rawValue ?? "",
                fasted: session.fasted, postWorkout: session.postWorkout, pump: session.pump, photoIdentitiesJSON: photoIdentitiesJSON
            ),
            artifacts: artifacts, replacementForSubmissionIdentity: replacementPredecessor, createdAt: now()
        )
        // A previous plan for a different set is superseded; the Founder
        // flow stages one set at a time.
        try await store.discard()
        for (index, item) in staged.enumerated() {
            try await store.writeArtifact(artifacts[index].artifactId, data: item.original.data)
        }
        for (offset, derivativeItem) in derivatives.enumerated() {
            try await store.writeArtifact(artifacts[staged.count + offset].artifactId, data: derivativeItem.data)
        }
        try await store.savePlan(plan)
        return plan
    }

    func resume(onProgress: @escaping @Sendable (StagedPhotoIntakeProgress) -> Void = { _ in }) async throws -> ProductionEvidenceIntakeStatus {
        guard let plan = await pendingPlan() else { throw StagedPhotoIntakeError.noPendingIntake }
        return try await submit(plan: plan, onProgress: onProgress)
    }

    func submit(
        plan initial: StagedPhotoIntakePlan,
        onProgress: @escaping @Sendable (StagedPhotoIntakeProgress) -> Void = { _ in }
    ) async throws -> ProductionEvidenceIntakeStatus {
        try NativeProductWriteGuard.authorize(.progressPhotos, in: .founderProduction)
        var plan = initial
        if let rejected = plan.rejectedArtifacts.first, case .rejected(let code) = rejected.state {
            throw StagedPhotoIntakeError.rejected(code: code)
        }
        var status = try await declare(&plan)
        onProgress(progress(of: plan, inFlight: 0))
        if plan.mediaComplete {
            try? await store.discard()
            return status
        }
        for artifact in plan.pendingArtifacts {
            let data = try await store.readArtifact(artifact.artifactId)
            guard let index = plan.artifacts.firstIndex(where: { $0.artifactId == artifact.artifactId }) else { continue }
            plan.artifacts[index].attemptCount += 1
            try await store.savePlan(plan)
            let snapshot = plan
            do {
                status = try await api.uploadStagedEvidenceArtifact(
                    intakeId: plan.intakeId ?? status.intakeId, artifactId: artifact.artifactId,
                    contentType: artifact.mimeType, data: data,
                    onUploadProgress: { fraction in onProgress(Self.progress(of: snapshot, inFlight: fraction)) }
                )
            } catch let error as ProductionNativeError {
                switch error {
                case .conflict(let problem) where problem.code == "EVIDENCE_INTAKE_MEDIA_ALREADY_COMPLETE":
                    status = try await api.fetchEvidenceIntakeStatus(intakeId: plan.intakeId ?? status.intakeId)
                case .validation(let problem), .conflict(let problem), .failedPrecondition(let problem), .preconditionRequired(let problem):
                    plan.artifacts[index].state = .rejected(code: problem.code)
                    plan.lastErrorCode = problem.code
                    try await store.savePlan(plan)
                    throw StagedPhotoIntakeError.rejected(code: problem.code)
                case .notFound(let problem):
                    let code = problem?.code ?? "EVIDENCE_INTAKE_NOT_FOUND"
                    plan.artifacts[index].state = .rejected(code: code)
                    plan.lastErrorCode = code
                    try await store.savePlan(plan)
                    throw StagedPhotoIntakeError.rejected(code: code)
                default:
                    // Acceptance unknown (network, 5xx, malformed reply): keep the
                    // artifact pending; the next attempt asks the Server first.
                    try await store.savePlan(plan)
                    throw error
                }
            }
            plan.apply(status, at: now())
            if !plan.artifacts[index].state.isStored, status.artifacts == nil { plan.artifacts[index].state = .stored(at: now()) }
            try await store.savePlan(plan)
            onProgress(progress(of: plan, inFlight: 0))
        }
        if !plan.mediaComplete {
            status = try await api.fetchEvidenceIntakeStatus(intakeId: plan.intakeId ?? status.intakeId)
            plan.apply(status, at: now())
            try await store.savePlan(plan)
        }
        guard plan.mediaComplete else { throw StagedPhotoIntakeError.incompleteAfterTransfer }
        onProgress(progress(of: plan, inFlight: 1))
        try? await store.discard()
        return status
    }

    private func declare(_ plan: inout StagedPhotoIntakePlan) async throws -> ProductionEvidenceIntakeStatus {
        var status: ProductionEvidenceIntakeStatus
        do {
            status = try await api.declareStagedEvidenceIntake(try plan.wireDeclaration(), idempotencyKey: plan.submissionIdentity)
        } catch ProductionNativeError.conflict(let problem) where problem.code == "EVIDENCE_INTAKE_REPLACEMENT_REQUIRED" {
            // A dismissed review keeps its intake immutable. Rotate exactly once
            // to a linked replacement identity; every artifact keeps its bytes.
            let predecessor = plan.submissionIdentity
            let rotated = idempotencyStore.rotatedKey(scope: plan.scope, signature: plan.signature, replacing: predecessor)
            let rekeyed = plan.rekeyed(to: rotated, replacing: predecessor)
            for (old, new) in zip(plan.artifacts, rekeyed.artifacts) where old.artifactId != new.artifactId {
                try await store.renameArtifact(old.artifactId, to: new.artifactId)
            }
            plan = rekeyed
            try await store.savePlan(plan)
            status = try await api.declareStagedEvidenceIntake(try plan.wireDeclaration(), idempotencyKey: plan.submissionIdentity)
        } catch let error as ProductionNativeError {
            switch error {
            case .validation(let problem), .conflict(let problem), .failedPrecondition(let problem), .preconditionRequired(let problem):
                plan.lastErrorCode = problem.code
                try await store.savePlan(plan)
                throw StagedPhotoIntakeError.rejected(code: problem.code)
            default:
                throw error
            }
        }
        plan.apply(status, at: now())
        try await store.savePlan(plan)
        return status
    }

    private func progress(of plan: StagedPhotoIntakePlan, inFlight: Double) -> StagedPhotoIntakeProgress {
        Self.progress(of: plan, inFlight: inFlight)
    }

    private static func progress(of plan: StagedPhotoIntakePlan, inFlight: Double) -> StagedPhotoIntakeProgress {
        StagedPhotoIntakeProgress(
            transferredArtifacts: plan.storedCount, totalArtifacts: plan.artifacts.count,
            transferredOriginals: plan.storedOriginalCount, totalOriginals: plan.originals.count,
            currentArtifactFraction: inFlight, mediaComplete: plan.mediaComplete
        )
    }

    static func sha256(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }
}

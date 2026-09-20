import Foundation

/// Staged-media Progress Photos transport (`POST .../evidence/intakes/staged`
/// + `PUT .../evidence/intakes/{intakeId}/artifacts/{artifactId}`).
///
/// One durable plan describes one intake: the deterministic submission
/// identity, the Founder's confirmed session details, and the expected
/// artifact set. Every photo travels in its own bounded request; the plan
/// records which artifacts the Server has durably acknowledged so a retry
/// after a lost response, a suspension, or a relaunch transfers only what is
/// still missing. Nothing here is canonical: the Server's receipt is the
/// only truth about what was stored, and the plan is discarded once media
/// is complete.
enum StagedPhotoArtifactRole: String, Codable, Sendable {
    case original
    case analysisDerivative = "analysis_derivative"
}

enum StagedPhotoArtifactState: Codable, Equatable, Sendable {
    case pending
    case stored(at: Date)
    case rejected(code: String)

    var isStored: Bool { if case .stored = self { return true } else { return false } }
    var isRejected: Bool { if case .rejected = self { return true } else { return false } }
}

struct StagedPhotoArtifactPlan: Codable, Equatable, Sendable {
    var artifactId: String
    var ordinal: Int
    var role: StagedPhotoArtifactRole
    var derivativeOf: String?
    var fileName: String
    var mimeType: String
    var byteLength: Int
    var sha256: String
    var sourceAttachmentId: String
    var state: StagedPhotoArtifactState = .pending
    var attemptCount = 0
}

struct StagedPhotoSessionDeclaration: Codable, Equatable, Sendable {
    var originalUnedited: Bool
    var timeOfDay: String
    var fasted: Bool?
    var postWorkout: Bool?
    var pump: Bool?
    /// The exact `photoIdentitiesJson` payload the multipart transport sends,
    /// preserved as text so both transports carry identical identities.
    var photoIdentitiesJSON: String
}

struct StagedPhotoIntakePlan: Codable, Equatable, Sendable {
    static let currentSchemaVersion = 1
    static let expectedEvidenceType = "photo_session"
    /// Mirrors the Server contract (`StagedEvidenceArtifactManifest.js`).
    static let originalMaximumBytes = 32 * 1024 * 1024
    static let derivativeMaximumBytes = 8 * 1024 * 1024
    static let maximumOriginals = 24
    static let derivativeMaximumPixelSize = 2_048
    static let derivativeJPEGQuality = 0.9

    var schemaVersion = Self.currentSchemaVersion
    var submissionIdentity: String
    var scope: String
    var signature: String
    var effectiveDate: String
    var session: StagedPhotoSessionDeclaration
    var artifacts: [StagedPhotoArtifactPlan]
    var intakeId: String?
    var replacementForSubmissionIdentity: String?
    var createdAt: Date
    var mediaComplete = false
    var lastErrorCode: String?

    var originals: [StagedPhotoArtifactPlan] { artifacts.filter { $0.role == .original } }
    var storedCount: Int { artifacts.filter(\.state.isStored).count }
    var storedOriginalCount: Int { originals.filter(\.state.isStored).count }
    var pendingArtifacts: [StagedPhotoArtifactPlan] { artifacts.filter { !$0.state.isStored }.sorted { $0.ordinal < $1.ordinal } }
    var rejectedArtifacts: [StagedPhotoArtifactPlan] { artifacts.filter(\.state.isRejected) }

    static func artifactId(submissionIdentity: String, ordinal: Int) -> String {
        "artifact_\(submissionIdentity.replacingOccurrences(of: "-", with: "").lowercased())_\(ordinal)"
    }

    /// Re-derives every artifact identity for a rotated submission identity
    /// (the dismissed-review replacement path), keeping stored/pending state.
    func rekeyed(to submissionIdentity: String, replacing predecessor: String) -> StagedPhotoIntakePlan {
        var plan = self
        plan.submissionIdentity = submissionIdentity
        plan.replacementForSubmissionIdentity = predecessor
        plan.intakeId = nil
        plan.mediaComplete = false
        plan.lastErrorCode = nil
        let rename = Dictionary(uniqueKeysWithValues: artifacts.map {
            ($0.artifactId, Self.artifactId(submissionIdentity: submissionIdentity, ordinal: $0.ordinal))
        })
        plan.artifacts = artifacts.map { artifact in
            var next = artifact
            next.artifactId = rename[artifact.artifactId] ?? artifact.artifactId
            next.derivativeOf = artifact.derivativeOf.flatMap { rename[$0] }
            next.state = .pending
            next.attemptCount = 0
            return next
        }
        return plan
    }

    /// Applies the Server's durable progress: an artifact the Server reports
    /// as stored is stored, whatever this device remembered.
    mutating func apply(_ status: ProductionEvidenceIntakeStatus, at date: Date) {
        intakeId = status.intakeId
        mediaComplete = status.mediaComplete ?? mediaComplete
        if let code = status.lastErrorCode { lastErrorCode = code }
        guard let progress = status.artifacts else { return }
        let stored = Set(progress.filter { $0.state == "stored" }.map(\.artifactId))
        for index in artifacts.indices where stored.contains(artifacts[index].artifactId) && !artifacts[index].state.isStored {
            artifacts[index].state = .stored(at: date)
        }
    }

    func wireDeclaration() throws -> StagedPhotoIntakeWireDeclaration {
        let identities = try JSONDecoder().decode([ProductionJSONValue].self, from: Data(session.photoIdentitiesJSON.utf8))
        return StagedPhotoIntakeWireDeclaration(
            submissionIdentity: submissionIdentity,
            effectiveDate: effectiveDate,
            expectedEvidenceType: Self.expectedEvidenceType,
            replacementForSubmissionIdentity: replacementForSubmissionIdentity,
            photoSession: .init(
                originalUnedited: session.originalUnedited,
                timeOfDay: session.timeOfDay,
                fasted: session.fasted,
                postWorkout: session.postWorkout,
                pump: session.pump,
                photoIdentities: identities
            ),
            artifacts: artifacts.sorted { $0.ordinal < $1.ordinal }.map {
                .init(artifactId: $0.artifactId, ordinal: $0.ordinal, role: $0.role.rawValue, derivativeOf: $0.derivativeOf,
                      fileName: $0.fileName, mimeType: $0.mimeType, byteLength: $0.byteLength, sha256: $0.sha256)
            }
        )
    }
}

/// Exact JSON body of the declaration request.
struct StagedPhotoIntakeWireDeclaration: Encodable, Equatable, Sendable {
    struct PhotoSession: Encodable, Equatable, Sendable {
        var originalUnedited: Bool
        var timeOfDay: String
        var fasted: Bool?
        var postWorkout: Bool?
        var pump: Bool?
        var photoIdentities: [ProductionJSONValue]

        // Tri-state conditions are sent explicitly as null when unknown, the
        // way the Server contract documents them.
        enum CodingKeys: String, CodingKey { case originalUnedited, timeOfDay, fasted, postWorkout, pump, photoIdentities }
        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(originalUnedited, forKey: .originalUnedited)
            try container.encode(timeOfDay, forKey: .timeOfDay)
            try container.encode(fasted, forKey: .fasted)
            try container.encode(postWorkout, forKey: .postWorkout)
            try container.encode(pump, forKey: .pump)
            try container.encode(photoIdentities, forKey: .photoIdentities)
        }
    }
    struct Artifact: Encodable, Equatable, Sendable {
        var artifactId: String
        var ordinal: Int
        var role: String
        var derivativeOf: String?
        var fileName: String
        var mimeType: String
        var byteLength: Int
        var sha256: String
    }

    var submissionIdentity: String
    var effectiveDate: String
    var expectedEvidenceType: String
    var replacementForSubmissionIdentity: String?
    var photoSession: PhotoSession
    var artifacts: [Artifact]
}

/// Per-artifact progress the Server reports on every staged response.
struct ProductionEvidenceIntakeArtifactProgress: Decodable, Equatable, Sendable {
    var artifactId: String
    var ordinal: Int
    var role: String
    var derivativeOf: String?
    var state: String
}

struct StagedPhotoIntakeProgress: Equatable, Sendable {
    var transferredArtifacts: Int
    var totalArtifacts: Int
    var transferredOriginals: Int
    var totalOriginals: Int
    /// Fraction of the artifact currently in flight, 0...1.
    var currentArtifactFraction: Double
    var mediaComplete: Bool

    /// Overall 0...1, weighting every artifact equally.
    var fraction: Double {
        guard totalArtifacts > 0 else { return mediaComplete ? 1 : 0 }
        let value = (Double(transferredArtifacts) + max(0, min(1, currentArtifactFraction))) / Double(totalArtifacts)
        return mediaComplete ? 1 : max(0, min(1, value))
    }
}

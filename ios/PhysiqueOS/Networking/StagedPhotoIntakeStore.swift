import Foundation

/// Durable local state for one in-flight staged Progress Photos intake.
///
/// Correctness of the staged transport must not depend on SwiftUI view
/// memory: the plan (identity, expected artifact set, acknowledgements) and
/// the exact bytes of every artifact survive navigation, suspension,
/// process termination, and reboot. Bytes are written once at staging time
/// and re-read for each transfer, so a retry always sends the identical
/// bytes whose SHA-256 the declaration already committed to. The whole
/// directory is discarded the moment the Server reports complete media.
protocol StagedPhotoIntakeStore: Sendable {
    func loadPlan() async throws -> StagedPhotoIntakePlan?
    func savePlan(_ plan: StagedPhotoIntakePlan) async throws
    func writeArtifact(_ artifactId: String, data: Data) async throws
    func readArtifact(_ artifactId: String) async throws -> Data
    func renameArtifact(_ artifactId: String, to newArtifactId: String) async throws
    func discard() async throws
}

enum StagedPhotoIntakeStoreError: Error, Equatable {
    case artifactUnavailable(String)
    case artifactIdentityInvalid(String)
}

/// File-backed store under Application Support, matching the HealthKit
/// synchronization store's discipline: atomic writes, complete file
/// protection, no UserDefaults. Foreground-only transfers never need to
/// read these files while the device is locked.
actor FileStagedPhotoIntakeStore: StagedPhotoIntakeStore {
    private static let planFileName = "plan.json"
    private static let artifactIdentity = try! NSRegularExpression(pattern: "^artifact_[0-9a-f]{32}_[1-9][0-9]{0,2}$")

    private let root: URL
    private let fileManager: FileManager
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(root: URL? = nil, fileManager: FileManager = .default) {
        self.fileManager = fileManager
        if let root {
            self.root = root
        } else {
            let base = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            self.root = base.appendingPathComponent("PhysiqueOS/StagedPhotoIntake", isDirectory: true)
        }
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        self.encoder = encoder
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        self.decoder = decoder
    }

    func loadPlan() throws -> StagedPhotoIntakePlan? {
        let url = planURL
        guard fileManager.fileExists(atPath: url.path) else { return nil }
        let plan = try decoder.decode(StagedPhotoIntakePlan.self, from: Data(contentsOf: url))
        guard plan.schemaVersion == StagedPhotoIntakePlan.currentSchemaVersion else { return nil }
        return plan
    }

    func savePlan(_ plan: StagedPhotoIntakePlan) throws {
        try fileManager.createDirectory(at: artifactsURL, withIntermediateDirectories: true)
        try encoder.encode(plan).write(to: planURL, options: [.atomic, .completeFileProtection])
    }

    func writeArtifact(_ artifactId: String, data: Data) throws {
        try fileManager.createDirectory(at: artifactsURL, withIntermediateDirectories: true)
        try data.write(to: try artifactURL(artifactId), options: [.atomic, .completeFileProtection])
    }

    func readArtifact(_ artifactId: String) throws -> Data {
        let url = try artifactURL(artifactId)
        guard fileManager.fileExists(atPath: url.path) else { throw StagedPhotoIntakeStoreError.artifactUnavailable(artifactId) }
        return try Data(contentsOf: url, options: [.mappedIfSafe])
    }

    func renameArtifact(_ artifactId: String, to newArtifactId: String) throws {
        let source = try artifactURL(artifactId)
        let destination = try artifactURL(newArtifactId)
        guard fileManager.fileExists(atPath: source.path) else { throw StagedPhotoIntakeStoreError.artifactUnavailable(artifactId) }
        if fileManager.fileExists(atPath: destination.path) { try fileManager.removeItem(at: destination) }
        try fileManager.moveItem(at: source, to: destination)
    }

    func discard() throws {
        guard fileManager.fileExists(atPath: root.path) else { return }
        try fileManager.removeItem(at: root)
    }

    private var planURL: URL { root.appendingPathComponent(Self.planFileName) }
    private var artifactsURL: URL { root.appendingPathComponent("artifacts", isDirectory: true) }

    private func artifactURL(_ artifactId: String) throws -> URL {
        let range = NSRange(artifactId.startIndex..., in: artifactId)
        guard Self.artifactIdentity.firstMatch(in: artifactId, range: range) != nil else {
            throw StagedPhotoIntakeStoreError.artifactIdentityInvalid(artifactId)
        }
        return artifactsURL.appendingPathComponent("\(artifactId).bin")
    }
}

import CryptoKit
import Foundation

protocol HealthKitSynchronizationStore: Sendable {
    func authoritativeCursor(for scope: HealthKitCursorScope) async throws -> HealthKitAuthoritativeCursor?
    func stage(_ batch: HealthKitStagedBatch) async throws
    func pendingBatches(for scope: HealthKitCursorScope) async throws -> [HealthKitStagedBatch]
    func markUploadAttempt(batchID: String, partitionID: String, at: Date) async throws
    func markTransientFailure(batchID: String, partitionID: String, code: String) async throws
    func markRejected(batchID: String, partitionID: String, code: String) async throws
    func acknowledge(
        batchID: String,
        partitionID: String,
        acknowledgedBatchID: String,
        receiptIdentity: String,
        at: Date
    ) async throws
    func recordObserverWakeup(for scope: HealthKitCursorScope, at: Date) async throws
    func recordSuccessfulQuery(for scope: HealthKitCursorScope, at: Date) async throws
    func recordOperationalError(for scope: HealthKitCursorScope, code: String) async throws
    func resetCursorForBoundedRecovery(for scope: HealthKitCursorScope) async throws
    func diagnostics(for scope: HealthKitCursorScope) async throws -> HealthKitStreamDiagnostics
    func deferredChanges(for scope: HealthKitCursorScope) async throws -> [HealthKitDeferredChange]
}

/// Protected Application Support storage is the authority for device-owned
/// anchors and replayable batches. Every mutation rewrites one owner/device/
/// stream envelope atomically; UserDefaults is intentionally not involved.
actor FileHealthKitSynchronizationStore: HealthKitSynchronizationStore {
    private struct Envelope: Codable {
        var schemaVersion: Int
        var scope: HealthKitCursorScope
        var authoritativeCursor: HealthKitAuthoritativeCursor?
        var pendingBatches: [HealthKitStagedBatch]
        var deferredChanges: [HealthKitDeferredChange]
        var diagnostics: HealthKitStreamDiagnostics
    }

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
            self.root = base.appendingPathComponent("PhysiqueOS/HealthKitSync", isDirectory: true)
        }
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        self.encoder = encoder
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        self.decoder = decoder
    }

    func authoritativeCursor(for scope: HealthKitCursorScope) throws -> HealthKitAuthoritativeCursor? {
        try load(scope).authoritativeCursor
    }

    func stage(_ batch: HealthKitStagedBatch) throws {
        var envelope = try load(batch.scope)
        guard envelope.scope == batch.scope else { throw HealthKitSyncError.ownerOrDeviceMismatch }
        if envelope.pendingBatches.contains(where: { $0.identity == batch.identity }) { return }
        guard envelope.pendingBatches.isEmpty else { throw HealthKitSyncError.pendingBatchMustResolve }
        envelope.pendingBatches.append(batch)
        try finalizeIfReady(&envelope, batchID: batch.identity)
        try save(envelope)
    }

    func pendingBatches(for scope: HealthKitCursorScope) throws -> [HealthKitStagedBatch] {
        try load(scope).pendingBatches
    }

    func markUploadAttempt(batchID: String, partitionID: String, at: Date) throws {
        try updateBatch(batchID: batchID, partitionID: partitionID) { envelope, batchIndex, partitionIndex in
            envelope.pendingBatches[batchIndex].partitions[partitionIndex].attemptState = .uploading
            envelope.pendingBatches[batchIndex].partitions[partitionIndex].attemptCount += 1
            envelope.pendingBatches[batchIndex].partitions[partitionIndex].lastAttemptAt = at
            envelope.diagnostics.lastUploadAttempt = at
            envelope.diagnostics.lastErrorCode = nil
        }
    }

    func markTransientFailure(batchID: String, partitionID: String, code: String) throws {
        try updateBatch(batchID: batchID, partitionID: partitionID) { envelope, batchIndex, partitionIndex in
            envelope.pendingBatches[batchIndex].partitions[partitionIndex].attemptState = .transientFailure(code: code)
            envelope.diagnostics.lastErrorCode = code
        }
    }

    func markRejected(batchID: String, partitionID: String, code: String) throws {
        try updateBatch(batchID: batchID, partitionID: partitionID) { envelope, batchIndex, partitionIndex in
            envelope.pendingBatches[batchIndex].partitions[partitionIndex].attemptState = .rejected(code: code)
            envelope.diagnostics.lastErrorCode = code
        }
    }

    func acknowledge(
        batchID: String,
        partitionID: String,
        acknowledgedBatchID: String,
        receiptIdentity: String,
        at: Date
    ) throws {
        guard partitionID == acknowledgedBatchID else { throw HealthKitSyncError.invalidAcknowledgement }
        let scope = try scopeContaining(batchID: batchID)
        var envelope = try load(scope)
        guard let batchIndex = envelope.pendingBatches.firstIndex(where: { $0.identity == batchID }),
              let partitionIndex = envelope.pendingBatches[batchIndex].partitions.firstIndex(where: { $0.identity == partitionID })
        else { throw HealthKitSyncError.invalidAcknowledgement }
        envelope.pendingBatches[batchIndex].partitions[partitionIndex].attemptState = .acknowledged(
            receiptIdentity: receiptIdentity,
            at: at
        )
        envelope.diagnostics.lastDurableAcknowledgement = at
        envelope.diagnostics.lastErrorCode = nil
        try finalizeIfReady(&envelope, batchID: batchID)
        try save(envelope)
    }

    func recordObserverWakeup(for scope: HealthKitCursorScope, at: Date) throws {
        try updateDiagnostics(scope) { $0.lastObserverWakeup = at }
    }

    func recordSuccessfulQuery(for scope: HealthKitCursorScope, at: Date) throws {
        try updateDiagnostics(scope) {
            $0.lastSuccessfulAnchoredQuery = at
            $0.lastErrorCode = nil
        }
    }

    func recordOperationalError(for scope: HealthKitCursorScope, code: String) throws {
        try updateDiagnostics(scope) { $0.lastErrorCode = code }
    }

    func resetCursorForBoundedRecovery(for scope: HealthKitCursorScope) throws {
        var envelope = try load(scope)
        guard envelope.diagnostics.boundedRecoveryCount < 1 else {
            throw HealthKitSyncError.corruptCursor
        }
        guard envelope.pendingBatches.isEmpty else {
            throw HealthKitSyncError.pendingBatchMustResolve
        }
        envelope.authoritativeCursor = nil
        envelope.diagnostics.cursorGeneration = nil
        envelope.diagnostics.cursorDigest = nil
        envelope.diagnostics.boundedRecoveryCount += 1
        envelope.diagnostics.lastErrorCode = "healthkit_cursor_corrupt_full_rescan_required"
        try save(envelope)
    }

    func diagnostics(for scope: HealthKitCursorScope) throws -> HealthKitStreamDiagnostics {
        var envelope = try load(scope)
        envelope.diagnostics.pendingBatchCount = envelope.pendingBatches.count
        envelope.diagnostics.cursorGeneration = envelope.authoritativeCursor?.generation
        envelope.diagnostics.cursorDigest = envelope.authoritativeCursor?.digest
        return envelope.diagnostics
    }

    func deferredChanges(for scope: HealthKitCursorScope) throws -> [HealthKitDeferredChange] {
        try load(scope).deferredChanges
    }

    func stateFileURL(for scope: HealthKitCursorScope) -> URL {
        let scopeDigest = HealthKitStableDigest.hex([
            scope.ownerIdentity,
            scope.enrolledDeviceIdentity,
            scope.stream.rawValue,
            scope.predicateVersion,
        ].joined(separator: "\u{0}"))
        return root.appendingPathComponent("state-\(scopeDigest).json", isDirectory: false)
    }

    private func load(_ scope: HealthKitCursorScope) throws -> Envelope {
        let url = stateFileURL(for: scope)
        guard fileManager.fileExists(atPath: url.path) else { return emptyEnvelope(scope) }
        do {
            let envelope = try decoder.decode(Envelope.self, from: Data(contentsOf: url))
            guard envelope.schemaVersion == 1, envelope.scope == scope else {
                throw HealthKitSyncError.ownerOrDeviceMismatch
            }
            return envelope
        } catch HealthKitSyncError.ownerOrDeviceMismatch {
            throw HealthKitSyncError.ownerOrDeviceMismatch
        } catch {
            // A corrupt anchor can never be trusted. Preserve one quarantined
            // copy, reset to a nil anchor, and force a bounded full rescan.
            let quarantine = url.appendingPathExtension("corrupt")
            if fileManager.fileExists(atPath: quarantine.path) {
                try? fileManager.removeItem(at: quarantine)
            }
            try? fileManager.moveItem(at: url, to: quarantine)
            var recovered = emptyEnvelope(scope)
            recovered.diagnostics.boundedRecoveryCount = 1
            recovered.diagnostics.lastErrorCode = "healthkit_cursor_corrupt_full_rescan_required"
            try save(recovered)
            return recovered
        }
    }

    private func save(_ envelope: Envelope) throws {
        try fileManager.createDirectory(at: root, withIntermediateDirectories: true)
        var directory = URLResourceValues()
        directory.isExcludedFromBackup = true
        var mutableRoot = root
        try? mutableRoot.setResourceValues(directory)
        let data = try encoder.encode(envelope)
        try data.write(to: stateFileURL(for: envelope.scope), options: [.atomic, .completeFileProtection])
    }

    private func emptyEnvelope(_ scope: HealthKitCursorScope) -> Envelope {
        Envelope(
            schemaVersion: 1,
            scope: scope,
            authoritativeCursor: nil,
            pendingBatches: [],
            deferredChanges: [],
            diagnostics: HealthKitStreamDiagnostics(
                enabled: false,
                availability: .availableAuthorizationNotRequested,
                authorizationState: "not_requested",
                lastObserverWakeup: nil,
                lastSuccessfulAnchoredQuery: nil,
                cursorGeneration: nil,
                cursorDigest: nil,
                pendingBatchCount: 0,
                lastUploadAttempt: nil,
                lastDurableAcknowledgement: nil,
                lastErrorCode: nil,
                boundedRecoveryCount: 0
            )
        )
    }

    private func scopeContaining(batchID: String) throws -> HealthKitCursorScope {
        guard let files = try? fileManager.contentsOfDirectory(at: root, includingPropertiesForKeys: nil) else {
            throw HealthKitSyncError.invalidAcknowledgement
        }
        for file in files where file.pathExtension == "json" {
            guard let envelope = try? decoder.decode(Envelope.self, from: Data(contentsOf: file)) else { continue }
            if envelope.pendingBatches.contains(where: { $0.identity == batchID }) { return envelope.scope }
        }
        throw HealthKitSyncError.invalidAcknowledgement
    }

    private func updateBatch(
        batchID: String,
        partitionID: String,
        _ change: (inout Envelope, Int, Int) -> Void
    ) throws {
        let scope = try scopeContaining(batchID: batchID)
        var envelope = try load(scope)
        guard let batchIndex = envelope.pendingBatches.firstIndex(where: { $0.identity == batchID }),
              let partitionIndex = envelope.pendingBatches[batchIndex].partitions.firstIndex(where: { $0.identity == partitionID })
        else { throw HealthKitSyncError.invalidAcknowledgement }
        change(&envelope, batchIndex, partitionIndex)
        try save(envelope)
    }

    private func updateDiagnostics(
        _ scope: HealthKitCursorScope,
        _ change: (inout HealthKitStreamDiagnostics) -> Void
    ) throws {
        var envelope = try load(scope)
        change(&envelope.diagnostics)
        try save(envelope)
    }

    private func finalizeIfReady(_ envelope: inout Envelope, batchID: String) throws {
        guard let index = envelope.pendingBatches.firstIndex(where: { $0.identity == batchID }) else { return }
        let batch = envelope.pendingBatches[index]
        guard batch.partitions.allSatisfy({ $0.attemptState.permitsCursorAdvance }) else { return }
        for partition in batch.partitions {
            if case let .localDeferred(reason) = partition.disposition {
                envelope.deferredChanges.append(HealthKitDeferredChange(
                    batchIdentity: batch.identity,
                    partitionIdentity: partition.identity,
                    reason: reason,
                    additions: partition.additions,
                    deletions: partition.deletions,
                    stagedAt: batch.createdAt
                ))
            }
        }
        envelope.authoritativeCursor = batch.proposedCursor
        envelope.pendingBatches.remove(at: index)
        envelope.diagnostics.cursorGeneration = batch.proposedCursor.generation
        envelope.diagnostics.cursorDigest = batch.proposedCursor.digest
        envelope.diagnostics.pendingBatchCount = envelope.pendingBatches.count
    }
}

enum HealthKitStableDigest {
    static func hex(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    static func hex(_ value: String) -> String {
        hex(Data(value.utf8))
    }
}

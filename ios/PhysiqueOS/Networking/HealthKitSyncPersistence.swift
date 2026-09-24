import CryptoKit
import Foundation

protocol HealthKitSynchronizationStore: Sendable {
    func authoritativeCursor(for scope: HealthKitCursorScope) async throws -> HealthKitAuthoritativeCursor?
    func stage(_ batch: HealthKitStagedBatch) async throws
    func pendingBatches(for scope: HealthKitCursorScope) async throws -> [HealthKitStagedBatch]
    func markUploadAttempt(batchID: String, partitionID: String, at: Date) async throws
    func markTransientFailure(batchID: String, partitionID: String, code: String) async throws
    func markRejected(batchID: String, partitionID: String, code: String) async throws
    /// Retires an entire batch whose rejection can never be resolved by
    /// retrying the identical request (a permanent per-identity/per-purpose
    /// rejection, e.g. `HEALTHKIT_INGESTION_PURPOSE_IMMUTABLE`), so that
    /// scope's automatic sync stops being permanently blocked by it.
    /// Deliberately does NOT advance `authoritativeCursor`: this batch's
    /// additions were never durably delivered, so the cursor must stay
    /// exactly where it was before this attempt -- otherwise the abandoned
    /// day's fingerprint would be remembered as "already seen" and its
    /// real HealthKit data would never resurface on the next query. A
    /// no-op if the batch is already gone (idempotent under retry/relaunch).
    func abandonPendingBatch(batchID: String, code: String, at: Date) async throws
    /// Atomically retires the rejected batch and raises the device-owned
    /// revision floor for exactly one daily aggregate. The next query is
    /// therefore rebuilt with a fresh identity; a crash can observe either
    /// the old pending batch or the durable floor, never neither.
    func rebaseDailyRevisionAndAbandonPendingBatch(
        batchID: String,
        partitionID: String,
        observationType: HealthKitS1ObservationType,
        localDate: String,
        receivedSourceRevision: UInt64,
        nextExpectedRevision: UInt64,
        code: String,
        at: Date
    ) async throws
    func dailyRevisionFloors(for scope: HealthKitCursorScope) async throws -> [String: UInt64]
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
        /// Keyed only by local date because each envelope is already scoped
        /// to one owner, enrolled device, stream, and predicate version.
        var dailyRevisionFloors: [String: UInt64]?
    }

    private let root: URL
    private let fileManager: FileManager
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    private let dataReader: @Sendable (URL) throws -> Data

    init(
        root: URL? = nil,
        fileManager: FileManager = .default,
        dataReader: @escaping @Sendable (URL) throws -> Data = { try Data(contentsOf: $0) }
    ) {
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
        self.dataReader = dataReader
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

    func abandonPendingBatch(batchID: String, code: String, at: Date) throws {
        // Look up the scope the ordinary way first; a batch already
        // abandoned by a concurrent/prior call (or one that was somehow
        // never staged under this exact id) simply has nothing to do.
        let scope: HealthKitCursorScope
        do { scope = try scopeContaining(batchID: batchID) }
        catch HealthKitSyncError.invalidAcknowledgement { return }
        catch { throw error }
        var envelope = try load(scope)
        guard let index = envelope.pendingBatches.firstIndex(where: { $0.identity == batchID }) else { return }
        envelope.pendingBatches.remove(at: index)
        envelope.diagnostics.lastAbandonedBatchCode = code
        envelope.diagnostics.lastAbandonedAt = at
        envelope.diagnostics.abandonedBatchCount = (envelope.diagnostics.abandonedBatchCount ?? 0) + 1
        envelope.diagnostics.lastErrorCode = code
        envelope.diagnostics.pendingBatchCount = envelope.pendingBatches.count
        try save(envelope)
    }

    func rebaseDailyRevisionAndAbandonPendingBatch(
        batchID: String,
        partitionID: String,
        observationType: HealthKitS1ObservationType,
        localDate: String,
        receivedSourceRevision: UInt64,
        nextExpectedRevision: UInt64,
        code: String,
        at: Date
    ) throws {
        guard nextExpectedRevision > receivedSourceRevision else {
            throw HealthKitSyncError.operational(code: "healthkit_daily_revision_recovery_invalid")
        }
        let scope = try scopeContaining(batchID: batchID)
        guard Self.observationType(for: scope.stream) == observationType else {
            throw HealthKitSyncError.operational(code: "healthkit_daily_revision_recovery_scope_mismatch")
        }
        var envelope = try load(scope)
        guard let batchIndex = envelope.pendingBatches.firstIndex(where: { $0.identity == batchID }),
              let partition = envelope.pendingBatches[batchIndex].partitions.first(where: { $0.identity == partitionID }),
              partition.additions.contains(where: {
                  $0.occurrence.localDate == localDate &&
                  Self.dailyRevision(of: $0.payload, expectedType: observationType) == receivedSourceRevision
              })
        else {
            throw HealthKitSyncError.operational(code: "healthkit_daily_revision_recovery_fact_mismatch")
        }
        var floors = envelope.dailyRevisionFloors ?? [:]
        floors[localDate] = max(floors[localDate] ?? 0, nextExpectedRevision)
        envelope.dailyRevisionFloors = floors
        envelope.pendingBatches.remove(at: batchIndex)
        envelope.diagnostics.lastAbandonedBatchCode = code
        envelope.diagnostics.lastAbandonedAt = at
        envelope.diagnostics.abandonedBatchCount = (envelope.diagnostics.abandonedBatchCount ?? 0) + 1
        envelope.diagnostics.lastErrorCode = code
        envelope.diagnostics.pendingBatchCount = envelope.pendingBatches.count
        envelope.diagnostics.dailyRevisionFloorCount = floors.count
        envelope.diagnostics.lastDailyRevisionRecoveryAt = at
        envelope.diagnostics.lastDailyRevisionRecoveryCode = code
        envelope.diagnostics.lastDailyRevisionRecoveryLocalDate = localDate
        envelope.diagnostics.lastDailyRevisionNextExpected = nextExpectedRevision
        try save(envelope)
    }

    func dailyRevisionFloors(for scope: HealthKitCursorScope) throws -> [String: UInt64] {
        try load(scope).dailyRevisionFloors ?? [:]
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
        envelope.diagnostics.dailyRevisionFloorCount = envelope.dailyRevisionFloors?.count ?? 0
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
            let envelope = try decoder.decode(Envelope.self, from: dataReader(url))
            guard envelope.schemaVersion == 1, envelope.scope == scope else {
                throw HealthKitSyncError.ownerOrDeviceMismatch
            }
            return envelope
        } catch HealthKitSyncError.ownerOrDeviceMismatch {
            throw HealthKitSyncError.ownerOrDeviceMismatch
        } catch {
            if Self.isProtectedDataUnavailable(error) {
                throw HealthKitSyncError.operational(code: "healthkit_state_protected_data_unavailable")
            }
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
        try data.write(to: stateFileURL(for: envelope.scope), options: [.atomic, .completeFileProtectionUnlessOpen])
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
                boundedRecoveryCount: 0,
                lastAbandonedBatchCode: nil,
                lastAbandonedAt: nil,
                abandonedBatchCount: nil
            ),
            dailyRevisionFloors: nil
        )
    }

    private func scopeContaining(batchID: String) throws -> HealthKitCursorScope {
        let files: [URL]
        do { files = try fileManager.contentsOfDirectory(at: root, includingPropertiesForKeys: nil) }
        catch {
            if Self.isProtectedDataUnavailable(error) {
                throw HealthKitSyncError.operational(code: "healthkit_state_protected_data_unavailable")
            }
            throw HealthKitSyncError.invalidAcknowledgement
        }
        for file in files where file.pathExtension == "json" {
            let data: Data
            do { data = try dataReader(file) }
            catch {
                if Self.isProtectedDataUnavailable(error) {
                    throw HealthKitSyncError.operational(code: "healthkit_state_protected_data_unavailable")
                }
                continue
            }
            guard let envelope = try? decoder.decode(Envelope.self, from: data) else { continue }
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
                let deferred = HealthKitDeferredChange(
                    batchIdentity: batch.identity,
                    partitionIdentity: partition.identity,
                    reason: reason,
                    additions: partition.additions,
                    deletions: partition.deletions,
                    stagedAt: batch.createdAt
                )
                // A retained daily Activity revision can intentionally yield
                // the same local-only tombstone on later foreground queries.
                // Partition identity binds the exact content, scope, cursor,
                // purpose, and disposition, so persisting it once is enough;
                // repeated absence must not grow the protected state file.
                if !envelope.deferredChanges.contains(where: {
                    $0.partitionIdentity == deferred.partitionIdentity
                }) {
                    envelope.deferredChanges.append(deferred)
                }
            }
        }
        envelope.authoritativeCursor = batch.proposedCursor
        var floors = envelope.dailyRevisionFloors ?? [:]
        for addition in batch.partitions.flatMap(\.additions) {
            guard let expectedType = Self.observationType(for: batch.scope.stream),
                  let revision = Self.dailyRevision(of: addition.payload, expectedType: expectedType),
                  let floor = floors[addition.occurrence.localDate], revision >= floor
            else { continue }
            floors.removeValue(forKey: addition.occurrence.localDate)
        }
        envelope.dailyRevisionFloors = floors.isEmpty ? nil : floors
        envelope.pendingBatches.remove(at: index)
        envelope.diagnostics.cursorGeneration = batch.proposedCursor.generation
        envelope.diagnostics.cursorDigest = batch.proposedCursor.digest
        envelope.diagnostics.pendingBatchCount = envelope.pendingBatches.count
        envelope.diagnostics.dailyRevisionFloorCount = floors.count
    }

    private static func observationType(for stream: HealthKitSynchronizationStream) -> HealthKitS1ObservationType? {
        switch stream {
        case .activitySummary: .activitySummary
        case .nutritionDailyTotal: .nutritionDailyTotal
        default: nil
        }
    }

    private static func dailyRevision(
        of payload: HealthKitQueryPayload,
        expectedType: HealthKitS1ObservationType
    ) -> UInt64? {
        switch (expectedType, payload) {
        case let (.activitySummary, .activitySummary(summary)): summary.sourceRevision
        case let (.nutritionDailyTotal, .nutritionDailyTotal(summary)): summary.sourceRevision
        default: nil
        }
    }

    private static func isProtectedDataUnavailable(_ error: Error) -> Bool {
        let cocoa = error as NSError
        return cocoa.domain == NSCocoaErrorDomain && cocoa.code == NSFileReadNoPermissionError
    }
}

/// Applies a persisted Server floor without treating rejected content as an
/// accepted cursor. A sentinel fingerprint forces the daily query builder to
/// emit current HealthKit content at exactly the requested next revision.
enum HealthKitDailyRevisionCursorOverlay {
    private struct Cursor: Codable {
        struct Entry: Codable {
            var fingerprint: String
            var revision: UInt64
        }
        var entries: [String: Entry]
    }

    static func applying(
        floors: [String: UInt64],
        to cursorData: Data?,
        stream: HealthKitSynchronizationStream
    ) throws -> Data? {
        guard !floors.isEmpty else { return cursorData }
        guard stream == .activitySummary || stream == .nutritionDailyTotal else {
            throw HealthKitSyncError.operational(code: "healthkit_daily_revision_recovery_scope_mismatch")
        }
        let cursor: Cursor
        do {
            cursor = try cursorData.map { try JSONDecoder().decode(Cursor.self, from: $0) } ?? Cursor(entries: [:])
        } catch {
            throw HealthKitSyncError.corruptCursor
        }
        var rebased = cursor
        for (localDate, nextExpectedRevision) in floors {
            guard nextExpectedRevision > 0 else {
                throw HealthKitSyncError.operational(code: "healthkit_daily_revision_recovery_invalid")
            }
            rebased.entries[localDate] = Cursor.Entry(
                fingerprint: "server-revision-recovery-v1:\(nextExpectedRevision)",
                revision: nextExpectedRevision - 1
            )
        }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return try encoder.encode(rebased)
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

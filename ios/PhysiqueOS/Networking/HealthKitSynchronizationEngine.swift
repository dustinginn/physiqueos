import Foundation

actor HealthKitSynchronizationEngine {
    private let queryClient: any HealthKitAnchoredQueryClient
    private let observerClient: any HealthKitObserverClient
    private let store: any HealthKitSynchronizationStore
    private let uploader: any HealthKitObservationUploader
    private let featureGate: HealthKitFeatureGate
    private let batchBuilder: HealthKitBatchBuilder
    private let availability: @Sendable () -> HealthKitAvailability
    private let now: @Sendable () -> Date
    private var registrations: [HealthKitCursorScope: HealthKitObserverRegistration] = [:]

    init(
        queryClient: any HealthKitAnchoredQueryClient,
        observerClient: any HealthKitObserverClient,
        store: any HealthKitSynchronizationStore,
        uploader: any HealthKitObservationUploader,
        featureGate: HealthKitFeatureGate = .n0Disabled,
        batchBuilder: HealthKitBatchBuilder = HealthKitBatchBuilder(),
        availability: @escaping @Sendable () -> HealthKitAvailability = { .availableAuthorizationNotRequested },
        now: @escaping @Sendable () -> Date = Date.init
    ) {
        self.queryClient = queryClient
        self.observerClient = observerClient
        self.store = store
        self.uploader = uploader
        self.featureGate = featureGate
        self.batchBuilder = batchBuilder
        self.availability = availability
        self.now = now
    }

    /// Explicit activation seam. App launch never calls this in N1.
    func startObserving(scope: HealthKitCursorScope) throws {
        guard featureGate.allows(.backgroundDelivery), featureGate.allows(.observationQuery) else {
            throw HealthKitSyncError.featureDisabled
        }
        guard registrations[scope] == nil else { return }
        let registration = try observerClient.register(stream: scope.stream) { [weak self] errorCode, completion in
            guard let self else { completion(); return }
            Task { await self.handleObserverWake(scope: scope, errorCode: errorCode, completion: completion) }
        }
        registrations[scope] = registration
    }

    func stopObserving(scope: HealthKitCursorScope) {
        guard let registration = registrations.removeValue(forKey: scope) else { return }
        observerClient.unregister(registration)
    }

    /// Registration architecture only. Default N1 behavior cannot reach it
    /// because `.backgroundDelivery` is disabled.
    func enableBackgroundDelivery(scope: HealthKitCursorScope) async throws {
        guard featureGate.allows(.backgroundDelivery) else { throw HealthKitSyncError.featureDisabled }
        try await observerClient.enableBackgroundDelivery(for: scope.stream)
    }

    func handleObserverWake(
        scope: HealthKitCursorScope,
        errorCode: String? = nil,
        completion: @escaping @Sendable () -> Void
    ) async {
        guard featureGate.allows(.observationQuery) else {
            completion()
            return
        }
        do {
            try await store.recordObserverWakeup(for: scope, at: now())
            if let errorCode {
                try await store.recordOperationalError(for: scope, code: errorCode)
            }
            try await synchronize(scope: scope, stagingCompletion: completion)
        } catch let error as HealthKitSyncError {
            try? await store.recordOperationalError(for: scope, code: error.diagnosticCode)
        } catch {
            try? await store.recordOperationalError(for: scope, code: "healthkit_observer_workflow_failed")
        }
    }

    /// Runs one incremental query. The completion is invoked immediately
    /// after atomic local staging and before any network upload begins.
    func synchronize(
        scope: HealthKitCursorScope,
        stagingCompletion: (@Sendable () -> Void)? = nil
    ) async throws {
        guard featureGate.allows(.observationQuery) else { throw HealthKitSyncError.featureDisabled }
        let pending = try await store.pendingBatches(for: scope)
        if !pending.isEmpty {
            stagingCompletion?()
            if featureGate.allows(.serverUpload) { try await deliverPending(scope: scope) }
            return
        }
        var cursor = try await store.authoritativeCursor(for: scope)
        let result: HealthKitAnchoredQueryResult
        do {
            result = try await queryClient.execute(
                stream: scope.stream,
                after: cursor?.opaqueAnchorData,
                bounds: nil
            )
        } catch HealthKitSyncError.corruptCursor {
            try await store.resetCursorForBoundedRecovery(for: scope)
            cursor = nil
            result = try await queryClient.execute(stream: scope.stream, after: nil, bounds: nil)
        }
        try await store.recordSuccessfulQuery(for: scope, at: result.completedAt)
        let batch = try batchBuilder.build(
            scope: scope,
            previousCursor: cursor,
            queryResult: result,
            createdAt: now()
        )
        try await store.stage(batch)
        stagingCompletion?()
        if featureGate.allows(.serverUpload) { try await deliverPending(scope: scope) }
    }

    /// Explicit foreground-only Founder canary path. The cursor scope binds
    /// the selected window, and validation purpose is persisted in both the
    /// batch and partition identities so crash recovery can only replay the
    /// exact same permanently-raw upload.
    func synchronizeActivityValidation(
        scope: HealthKitCursorScope,
        window: HealthKitActivityValidationWindow,
        calendar: Calendar = .autoupdatingCurrent
    ) async throws -> HealthKitCanarySyncSummary {
        guard featureGate.allows(.observationQuery), featureGate.allows(.serverUpload) else {
            throw HealthKitSyncError.featureDisabled
        }
        guard scope.stream == .activitySummary,
              scope.predicateVersion == window.predicateVersion
        else { throw HealthKitSyncError.ownerOrDeviceMismatch }

        let pending = try await store.pendingBatches(for: scope)
        if !pending.isEmpty {
            guard pending.allSatisfy({ $0.ingestionPurpose == .validationOnly }) else {
                throw HealthKitSyncError.ownerOrDeviceMismatch
            }
            try await deliverPending(scope: scope)
            return HealthKitCanarySyncSummary(
                batchIdentity: pending.first?.identity,
                additionsDiscovered: 0,
                deletionsDiscovered: 0,
                additionsFilteredByWindow: 0,
                deletionsFilteredByWindow: 0,
                resumedPendingBatch: true
            )
        }

        let bounds = try window.queryBounds(calendar: calendar)
        var cursor = try await store.authoritativeCursor(for: scope)
        let raw: HealthKitAnchoredQueryResult
        do {
            raw = try await queryClient.execute(
                stream: .activitySummary,
                after: cursor?.opaqueAnchorData,
                bounds: bounds
            )
        } catch HealthKitSyncError.corruptCursor {
            try await store.resetCursorForBoundedRecovery(for: scope)
            cursor = nil
            raw = try await queryClient.execute(stream: .activitySummary, after: nil, bounds: bounds)
        }

        let additions = raw.additions.filter { window.contains(localDate: $0.occurrence.localDate) }
        let deletions = raw.deletions.filter { deletion in
            guard deletion.objectTypeIdentifier == HealthKitSynchronizationStream.activitySummary.objectTypeIdentifier,
                  let externalID = deletion.immutableExternalID,
                  externalID.hasPrefix("activity-summary:")
            else { return false }
            return window.contains(localDate: String(externalID.dropFirst("activity-summary:".count)))
        }
        let bounded = HealthKitAnchoredQueryResult(
            additions: additions,
            deletions: deletions,
            proposedAnchorData: raw.proposedAnchorData,
            completedAt: raw.completedAt
        )
        try await store.recordSuccessfulQuery(for: scope, at: bounded.completedAt)
        let batch = try batchBuilder.build(
            scope: scope,
            previousCursor: cursor,
            queryResult: bounded,
            createdAt: now(),
            ingestionPurpose: .validationOnly
        )
        try await store.stage(batch)
        try await deliverPending(scope: scope)
        return HealthKitCanarySyncSummary(
            batchIdentity: batch.identity,
            additionsDiscovered: raw.additions.count,
            deletionsDiscovered: raw.deletions.count,
            additionsFilteredByWindow: raw.additions.count - additions.count,
            deletionsFilteredByWindow: raw.deletions.count - deletions.count,
            resumedPendingBatch: false
        )
    }

    /// Explicit foreground-only, exact-day operational path for the controlled
    /// canonical test day. Purpose is `.operational`, but the Server only
    /// canonicalizes inside its own activation window and quarantines the result
    /// from V3, Confidence, and briefings. The cursor scope binds the exact local
    /// date, so this can never read or upload a wider range, and a persisted
    /// pending batch may only be resumed under the same operational purpose.
    func synchronizeCanonicalTestDay(
        scope: HealthKitCursorScope,
        testDay: HealthKitCanonicalTestDay,
        calendar: Calendar = .autoupdatingCurrent
    ) async throws -> HealthKitCanarySyncSummary {
        guard featureGate.allows(.observationQuery), featureGate.allows(.serverUpload) else {
            throw HealthKitSyncError.featureDisabled
        }
        guard testDay.streams.contains(scope.stream),
              scope.predicateVersion == testDay.predicateVersion
        else { throw HealthKitSyncError.ownerOrDeviceMismatch }

        let pending = try await store.pendingBatches(for: scope)
        if !pending.isEmpty {
            guard pending.allSatisfy({ $0.ingestionPurpose == .operational }) else {
                throw HealthKitSyncError.ownerOrDeviceMismatch
            }
            try await deliverPending(scope: scope)
            return HealthKitCanarySyncSummary(
                batchIdentity: pending.first?.identity,
                additionsDiscovered: 0,
                deletionsDiscovered: 0,
                additionsFilteredByWindow: 0,
                deletionsFilteredByWindow: 0,
                resumedPendingBatch: true
            )
        }

        let bounds = try testDay.window.queryBounds(calendar: calendar)
        var cursor = try await store.authoritativeCursor(for: scope)
        let raw: HealthKitAnchoredQueryResult
        do {
            raw = try await queryClient.execute(stream: scope.stream, after: cursor?.opaqueAnchorData, bounds: bounds)
        } catch HealthKitSyncError.corruptCursor {
            try await store.resetCursorForBoundedRecovery(for: scope)
            cursor = nil
            raw = try await queryClient.execute(stream: scope.stream, after: nil, bounds: bounds)
        }
        // Exact day only, whatever the query client returned.
        let additions = raw.additions.filter { testDay.window.contains(localDate: $0.occurrence.localDate) }
        // Deletion convergence is a later stage: a removed day is never sent.
        let bounded = HealthKitAnchoredQueryResult(
            additions: additions,
            deletions: [],
            proposedAnchorData: raw.proposedAnchorData,
            completedAt: raw.completedAt
        )
        try await store.recordSuccessfulQuery(for: scope, at: bounded.completedAt)
        let batch = try batchBuilder.build(
            scope: scope,
            previousCursor: cursor,
            queryResult: bounded,
            createdAt: now(),
            ingestionPurpose: .operational
        )
        try await store.stage(batch)
        try await deliverPending(scope: scope)
        return HealthKitCanarySyncSummary(
            batchIdentity: batch.identity,
            additionsDiscovered: raw.additions.count,
            deletionsDiscovered: raw.deletions.count,
            additionsFilteredByWindow: raw.additions.count - additions.count,
            deletionsFilteredByWindow: raw.deletions.count,
            resumedPendingBatch: false
        )
    }

    /// Relaunch recovery uses only already-staged bytes and identities. It
    /// never reruns an anchored query while a batch is unresolved.
    func resumePending(scope: HealthKitCursorScope) async throws {
        guard featureGate.allows(.serverUpload) else { throw HealthKitSyncError.featureDisabled }
        try await deliverPending(scope: scope)
    }

    func diagnostics(scope: HealthKitCursorScope) async throws -> HealthKitStreamDiagnostics {
        var value = try await store.diagnostics(for: scope)
        value.enabled = featureGate.allows(.observationQuery)
        value.availability = availability()
        value.authorizationState = authorizationState(for: value.availability)
        return value
    }

    private func deliverPending(scope: HealthKitCursorScope) async throws {
        let batches = try await store.pendingBatches(for: scope)
        for batch in batches.sorted(by: { $0.createdAt < $1.createdAt }) {
            for partition in batch.partitions.sorted(by: { $0.index < $1.index }) {
                guard case .serverRequired = partition.disposition else { continue }
                if partition.attemptState.permitsCursorAdvance { continue }
                if case .rejected = partition.attemptState { throw HealthKitSyncError.serverRejected(code: "healthkit_batch_rejected") }
                let attemptAt = now()
                try await store.markUploadAttempt(
                    batchID: batch.identity,
                    partitionID: partition.identity,
                    at: attemptAt
                )
                switch await uploader.upload(partition) {
                case let .durablyAccepted(acknowledgedBatchID, receiptIdentity):
                    try await store.acknowledge(
                        batchID: batch.identity,
                        partitionID: partition.identity,
                        acknowledgedBatchID: acknowledgedBatchID,
                        receiptIdentity: receiptIdentity,
                        at: now()
                    )
                case let .transientFailure(code):
                    try await store.markTransientFailure(
                        batchID: batch.identity,
                        partitionID: partition.identity,
                        code: code
                    )
                    return
                case let .rejected(code):
                    try await store.markRejected(
                        batchID: batch.identity,
                        partitionID: partition.identity,
                        code: code
                    )
                    throw HealthKitSyncError.serverRejected(code: code)
                }
            }
        }
    }

    private func authorizationState(for availability: HealthKitAvailability) -> String {
        switch availability {
        case .availableAuthorizationNotRequested: "not_requested"
        case .authorizationRequestRequired: "request_required"
        case .available, .availableNoVisibleData: "available_without_read_denial_inference"
        case .unavailableOnDevice: "unavailable"
        case .restrictedOrUnavailable: "restricted_or_unavailable"
        case .operationalError: "operational_error"
        }
    }
}

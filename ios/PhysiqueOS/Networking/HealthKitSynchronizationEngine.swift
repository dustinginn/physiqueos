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
            result = try await queryClient.execute(stream: scope.stream, after: cursor?.opaqueAnchorData)
        } catch HealthKitSyncError.corruptCursor {
            try await store.resetCursorForBoundedRecovery(for: scope)
            cursor = nil
            result = try await queryClient.execute(stream: scope.stream, after: nil)
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

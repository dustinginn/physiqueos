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
    private let queryTimeout: Duration
    /// Defense-in-depth for the automatic (`synchronize`) Workout path only:
    /// `nil` (no filtering, the pre-Build-54 behavior) unless the owner opts
    /// in, which `AppEnvironment` does for the automatic engine and not for
    /// the canary's. The explicit canary paths below never consult it.
    private let workoutActivationFloor: HealthKitWorkoutActivationFloor?
    private var registrations: [HealthKitCursorScope: HealthKitObserverRegistration] = [:]
    /// Actor reentrancy means a second call can enter while the first is
    /// awaiting HealthKit or the network. Keep both query/stage work and
    /// delivery single-flight per exact cursor scope so an outer timeout can
    /// never turn into concurrent cursor or partition mutation.
    private var activeSynchronizations: Set<HealthKitCursorScope> = []
    private var activeDeliveries: Set<HealthKitCursorScope> = []

    init(
        queryClient: any HealthKitAnchoredQueryClient,
        observerClient: any HealthKitObserverClient,
        store: any HealthKitSynchronizationStore,
        uploader: any HealthKitObservationUploader,
        featureGate: HealthKitFeatureGate = .n0Disabled,
        batchBuilder: HealthKitBatchBuilder = HealthKitBatchBuilder(),
        workoutActivationFloor: HealthKitWorkoutActivationFloor? = nil,
        queryTimeout: Duration = .seconds(25),
        availability: @escaping @Sendable () -> HealthKitAvailability = { .availableAuthorizationNotRequested },
        now: @escaping @Sendable () -> Date = Date.init
    ) {
        self.queryClient = queryClient
        self.observerClient = observerClient
        self.store = store
        self.uploader = uploader
        self.featureGate = featureGate
        self.batchBuilder = batchBuilder
        self.workoutActivationFloor = workoutActivationFloor
        self.queryTimeout = queryTimeout
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
        let completionGate = HealthKitObserverCompletionGate(completion: completion)
        // HealthKit requires every observer callback to be completed. Staging
        // may complete it early, but feature gates, same-scope overlap, store
        // failures, cancellation, and upload errors must also release it once.
        defer { completionGate.complete() }
        guard featureGate.allows(.observationQuery) else { return }
        do {
            try await store.recordObserverWakeup(for: scope, at: now())
            if let errorCode {
                try await store.recordOperationalError(for: scope, code: errorCode)
            }
            try await synchronize(scope: scope, stagingCompletion: { completionGate.complete() })
        } catch let error as HealthKitSyncError {
            try? await store.recordOperationalError(for: scope, code: error.diagnosticCode)
        } catch {
            try? await store.recordOperationalError(for: scope, code: "healthkit_observer_workflow_failed")
        }
    }

    /// Runs one incremental query. The completion is invoked immediately
    /// after atomic local staging and before any network upload begins.
    ///
    /// For `.workouts`, additions are re-filtered against
    /// `workoutActivationFloor` (when configured) AFTER the query client
    /// returns: the client's own floor predicate is the first line, this is
    /// the second, so a client constructed without the floor, or a future
    /// predicate change, still cannot stage pre-activation history. The
    /// proposed anchor is kept as returned so filtered-out samples are never
    /// re-delivered on the next run.
    func synchronize(
        scope: HealthKitCursorScope,
        stagingCompletion: (@Sendable () -> Void)? = nil
    ) async throws {
        guard featureGate.allows(.observationQuery) else { throw HealthKitSyncError.featureDisabled }
        guard activeSynchronizations.insert(scope).inserted else {
            throw HealthKitSyncError.operational(code: "healthkit_sync_in_progress")
        }
        defer { activeSynchronizations.remove(scope) }
        try Task.checkCancellation()
        let pending = try await store.pendingBatches(for: scope)
        if !pending.isEmpty {
            stagingCompletion?()
            if featureGate.allows(.serverUpload) { try await deliverPending(scope: scope) }
            return
        }
        var cursor = try await store.authoritativeCursor(for: scope)
        let raw: HealthKitAnchoredQueryResult
        do {
            raw = try await executeBoundedQuery(
                stream: scope.stream,
                after: try await queryCursorData(cursor: cursor, scope: scope),
                bounds: nil
            )
        } catch HealthKitSyncError.corruptCursor {
            try await store.resetCursorForBoundedRecovery(for: scope)
            cursor = nil
            raw = try await executeBoundedQuery(
                stream: scope.stream,
                after: try await queryCursorData(cursor: nil, scope: scope),
                bounds: nil
            )
        }
        try Task.checkCancellation()
        let result = applyWorkoutActivationFloor(to: raw, scope: scope)
        try await store.recordSuccessfulQuery(for: scope, at: result.completedAt)
        let batch = try batchBuilder.build(
            scope: scope,
            previousCursor: cursor,
            queryResult: result,
            createdAt: now()
        )
        try await store.stage(batch)
        stagingCompletion?()
        try Task.checkCancellation()
        if featureGate.allows(.serverUpload) { try await deliverPending(scope: scope) }
    }

    /// HealthKit query callbacks are not guaranteed to resume while the app
    /// remains alive. Running the client call in an unstructured task lets
    /// this actor release the scope after a bounded wait. A late callback is
    /// ignored by the one-shot gate and therefore can never stage or advance
    /// a cursor after the timeout.
    private func executeBoundedQuery(
        stream: HealthKitSynchronizationStream,
        after anchorData: Data?,
        bounds: HealthKitQueryBounds?
    ) async throws -> HealthKitAnchoredQueryResult {
        try await withCheckedContinuation { continuation in
            let gate = HealthKitQueryResultGate(continuation: continuation)
            Task {
                do {
                    let result = try await self.queryClient.execute(
                        stream: stream,
                        after: anchorData,
                        bounds: bounds
                    )
                    gate.resolve(.success(result))
                } catch {
                    gate.resolve(.failure(error))
                }
            }
            Task {
                do { try await Task.sleep(for: self.queryTimeout) }
                catch { return }
                gate.resolve(.failure(HealthKitSyncError.operational(code: "healthkit_query_timed_out")))
            }
        }.get()
    }

    /// Drops Workout additions that ENDED before the activation floor. Only
    /// the automatic incremental path calls this; the canary paths bind
    /// their own exact-day windows. Deletions are passed through untouched:
    /// `HealthKitBatchBuilder` already defers every Workout deletion locally
    /// (`server_deletion_contract_deferred`), so none is ever sent.
    private func applyWorkoutActivationFloor(
        to result: HealthKitAnchoredQueryResult,
        scope: HealthKitCursorScope
    ) -> HealthKitAnchoredQueryResult {
        guard scope.stream == .workouts, let floor = workoutActivationFloor else { return result }
        let admitted = result.additions.filter { floor.admits(endedAt: $0.occurrence.endedAt) }
        guard admitted.count != result.additions.count else { return result }
        return HealthKitAnchoredQueryResult(
            additions: admitted,
            deletions: result.deletions,
            proposedAnchorData: result.proposedAnchorData,
            completedAt: result.completedAt
        )
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
                after: try await queryCursorData(cursor: cursor, scope: scope),
                bounds: bounds
            )
        } catch HealthKitSyncError.corruptCursor {
            try await store.resetCursorForBoundedRecovery(for: scope)
            cursor = nil
            raw = try await queryClient.execute(
                stream: .activitySummary,
                after: try await queryCursorData(cursor: nil, scope: scope),
                bounds: bounds
            )
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
            raw = try await queryClient.execute(
                stream: scope.stream,
                after: try await queryCursorData(cursor: cursor, scope: scope),
                bounds: bounds
            )
        } catch HealthKitSyncError.corruptCursor {
            try await store.resetCursorForBoundedRecovery(for: scope)
            cursor = nil
            raw = try await queryClient.execute(
                stream: scope.stream,
                after: try await queryCursorData(cursor: nil, scope: scope),
                bounds: bounds
            )
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

    /// Explicit foreground-only, exact-day operational path for the dormant
    /// Workout canary. Same guarantees as the Activity + Nutrition test day: the
    /// cursor scope binds the exact local date, additions are re-filtered to it,
    /// deletions are dropped, and a pending validation-only batch is never
    /// resumed as operational. It uploads workout observations only; the Server
    /// canonicalizes them only inside its own separate Workout policy window.
    func synchronizeWorkoutCanary(
        scope: HealthKitCursorScope,
        day: HealthKitWorkoutCanaryDay,
        calendar: Calendar = .autoupdatingCurrent
    ) async throws -> HealthKitCanarySyncSummary {
        guard featureGate.allows(.observationQuery), featureGate.allows(.serverUpload) else {
            throw HealthKitSyncError.featureDisabled
        }
        guard scope.stream == .workouts, scope.predicateVersion == day.predicateVersion else {
            throw HealthKitSyncError.ownerOrDeviceMismatch
        }
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
        let bounds = try day.window.queryBounds(calendar: calendar)
        var cursor = try await store.authoritativeCursor(for: scope)
        let raw: HealthKitAnchoredQueryResult
        do {
            raw = try await queryClient.execute(stream: .workouts, after: cursor?.opaqueAnchorData, bounds: bounds)
        } catch HealthKitSyncError.corruptCursor {
            try await store.resetCursorForBoundedRecovery(for: scope)
            cursor = nil
            raw = try await queryClient.execute(stream: .workouts, after: nil, bounds: bounds)
        }
        let additions = raw.additions.filter { day.window.contains(localDate: $0.occurrence.localDate) }
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
        try Task.checkCancellation()
        try await deliverPending(scope: scope)
    }

    func diagnostics(scope: HealthKitCursorScope) async throws -> HealthKitStreamDiagnostics {
        var value = try await store.diagnostics(for: scope)
        value.enabled = featureGate.allows(.observationQuery)
        value.availability = availability()
        value.authorizationState = authorizationState(for: value.availability)
        return value
    }

    /// A `.rejected` outcome -- whether already persisted from a prior
    /// attempt, or freshly returned by `uploader.upload` just below -- means
    /// the Server will never accept this exact request: retrying identical
    /// data cannot change a permanent per-identity/per-purpose rejection.
    /// Immediately retiring the whole batch (`abandonPendingBatch`) is what
    /// makes this recoverable rather than a permanent local block: the next
    /// `synchronize()` call sees an empty `pendingBatches` and re-queries
    /// HealthKit fresh, so a corrected identity (see `HealthKitBatchBuilder`
    /// 's per-caller namespacing) or a genuinely new revision can still get
    /// through. This throw still reports THIS attempt as failed -- that is
    /// correct and honest -- it is only the *next* attempt that is no
    /// longer poisoned. This is also what heals an already-poisoned Build
    /// 51 device: its already-persisted `.rejected` partition is retired
    /// the first time this scope is synchronized after updating, with no
    /// migration step and no reinstall.
    private func deliverPending(scope: HealthKitCursorScope) async throws {
        guard activeDeliveries.insert(scope).inserted else {
            throw HealthKitSyncError.operational(code: "healthkit_delivery_in_progress")
        }
        defer { activeDeliveries.remove(scope) }
        try Task.checkCancellation()
        let batches = try await store.pendingBatches(for: scope)
        for batch in batches.sorted(by: { $0.createdAt < $1.createdAt }) {
            for partition in batch.partitions.sorted(by: { $0.index < $1.index }) {
                try Task.checkCancellation()
                guard case .serverRequired = partition.disposition else { continue }
                if partition.attemptState.permitsCursorAdvance { continue }
                if case let .rejected(code) = partition.attemptState {
                    try await store.abandonPendingBatch(batchID: batch.identity, code: code, at: now())
                    throw HealthKitSyncError.serverRejected(code: code)
                }
                let attemptAt = now()
                try await store.markUploadAttempt(
                    batchID: batch.identity,
                    partitionID: partition.identity,
                    at: attemptAt
                )
                let uploadResult = await uploader.upload(partition)
                switch uploadResult {
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
                case let .rejected(code, recovery):
                    if let recovery {
                        do {
                            try await store.rebaseDailyRevisionAndAbandonPendingBatch(
                                batchID: batch.identity,
                                partitionID: partition.identity,
                                observationType: recovery.observationType,
                                localDate: recovery.localDate,
                                receivedSourceRevision: recovery.receivedSourceRevision,
                                nextExpectedRevision: recovery.nextExpectedRevision,
                                code: code,
                                at: now()
                            )
                        } catch {
                            // Never trust mismatched recovery facts. Preserve
                            // the prior fail-closed behavior by retiring this
                            // permanently rejected request without advancing
                            // either the cursor or a revision floor.
                            try await store.abandonPendingBatch(batchID: batch.identity, code: code, at: now())
                            throw error
                        }
                    } else {
                        try await store.abandonPendingBatch(batchID: batch.identity, code: code, at: now())
                    }
                    throw HealthKitSyncError.serverRejected(code: code)
                }
            }
        }
    }

    private func queryCursorData(
        cursor: HealthKitAuthoritativeCursor?,
        scope: HealthKitCursorScope
    ) async throws -> Data? {
        let floors = try await store.dailyRevisionFloors(for: scope)
        return try HealthKitDailyRevisionCursorOverlay.applying(
            floors: floors,
            to: cursor?.opaqueAnchorData,
            stream: scope.stream
        )
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

private final class HealthKitQueryResultGate: @unchecked Sendable {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<Result<HealthKitAnchoredQueryResult, Error>, Never>?

    init(continuation: CheckedContinuation<Result<HealthKitAnchoredQueryResult, Error>, Never>) {
        self.continuation = continuation
    }

    func resolve(_ result: Result<HealthKitAnchoredQueryResult, Error>) {
        lock.lock()
        let current = continuation
        continuation = nil
        lock.unlock()
        current?.resume(returning: result)
    }
}

private final class HealthKitObserverCompletionGate: @unchecked Sendable {
    private let lock = NSLock()
    private var completion: (@Sendable () -> Void)?

    init(completion: @escaping @Sendable () -> Void) {
        self.completion = completion
    }

    func complete() {
        lock.lock()
        let current = completion
        completion = nil
        lock.unlock()
        current?()
    }
}

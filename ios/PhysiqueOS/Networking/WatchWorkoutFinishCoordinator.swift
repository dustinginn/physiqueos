import Foundation

/// Phone-owned, recoverable join for one Watch finish operation. A confirmed
/// structured session stays local until both independent durable effects are
/// known: the performed-only Server commit and the Watch HealthKit save.
/// Relaunch simply re-enters this coordinator with the same persisted draft,
/// Server idempotency identity, and finishOperationId.
@MainActor
final class WatchWorkoutFinishCoordinator {
    private unowned let environment: AppEnvironment
    private var tasks: [String: Task<Void, Never>] = [:]
    private let retryDelay: Duration
    private let maxAttempts: Int

    static func isTerminalReady(_ draft: TrainingLoggerDraft) -> Bool {
        draft.watchFinishOperationId != nil
            && draft.watchHealthSaveState == .succeeded
            && draft.watchServerCommitState == .succeeded
    }

    init(
        environment: AppEnvironment,
        retryDelay: Duration = .seconds(2),
        maxAttempts: Int = 3
    ) {
        self.environment = environment
        self.retryDelay = retryDelay
        self.maxAttempts = maxAttempts
    }

    func reconcile() {
        let authority = environment.trainingSessionAuthority(for: environment.nativeAuthority)
        for draft in authority.drafts where draft.finishedAt != nil && draft.watchFinishOperationId != nil {
            if finalizeIfReady(draft, authority: authority) { continue }
            guard draft.watchServerCommitState != .succeeded, tasks[draft.id] == nil else { continue }
            beginServerRecovery(for: draft, authority: authority)
        }
    }

    private func beginServerRecovery(
        for candidate: TrainingLoggerDraft,
        authority: TrainingSessionAuthority
    ) {
        guard let operationId = candidate.watchFinishOperationId else { return }
        let writeAPI = environment.trainingWriteAPI
        let nativeAuthority = environment.nativeAuthority
        tasks[candidate.id] = Task { [weak self] in
            guard let self else { return }
            defer {
                authority.endSubmission(sessionId: candidate.id)
                tasks[candidate.id] = nil
            }
            guard authority.beginSubmission(sessionId: candidate.id) else { return }

            if nativeAuthority == .sandbox {
                _ = authority.recordWatchServerCommit(
                    sessionId: candidate.id,
                    finishOperationId: operationId,
                    succeeded: true
                )
                _ = finalizeIfReady(
                    authority.draft(id: candidate.id) ?? candidate,
                    authority: authority
                )
                return
            }

            for attempt in 0..<maxAttempts {
                guard !Task.isCancelled, authority.draft(id: candidate.id) != nil else { return }
                if attempt > 0 {
                    do { try await Task.sleep(for: retryDelay) }
                    catch { return }
                }

                if await writeAPI.isDraftAlreadyDurable(candidate) {
                    let records = await writeAPI.sessionPerformanceRecords(for: candidate)
                    recordServerSuccess(
                        candidate: candidate,
                        operationId: operationId,
                        prCount: records?.count,
                        authority: authority,
                        writeAPI: writeAPI
                    )
                    return
                }

                do {
                    let result = try await writeAPI.commit(candidate)
                    if result.isDurable {
                        let records: [TrainingPerformanceRecord]?
                        if result.performanceRecords?.isAuthoritative == true {
                            records = result.performanceRecords?.records
                        } else {
                            records = await writeAPI.sessionPerformanceRecords(for: candidate)
                        }
                        recordServerSuccess(
                            candidate: candidate,
                            operationId: operationId,
                            prCount: records?.count,
                            authority: authority,
                            writeAPI: writeAPI
                        )
                        return
                    }
                    let state: TrainingLoggerSubmissionState = result.status == "accepted_processing"
                        ? .acceptedProcessing : .resultUnknown
                    _ = authority.setSubmissionState(sessionId: candidate.id, state)
                } catch {
                    _ = authority.recordWatchServerCommit(
                        sessionId: candidate.id,
                        finishOperationId: operationId,
                        succeeded: false
                    )
                }
            }
        }
    }

    private func recordServerSuccess(
        candidate: TrainingLoggerDraft,
        operationId: String,
        prCount: Int?,
        authority: TrainingSessionAuthority,
        writeAPI: any TrainingWriteAPI
    ) {
        _ = authority.setSubmissionState(sessionId: candidate.id, nil)
        _ = authority.recordWatchServerCommit(
            sessionId: candidate.id,
            finishOperationId: operationId,
            succeeded: true,
            authoritativePRCount: prCount
        )
        guard let current = authority.draft(id: candidate.id),
              finalizeIfReady(current, authority: authority)
        else { return }
        Task { await writeAPI.reconcileSupportingEvidenceAfterCommit(for: candidate) }
    }

    @discardableResult
    private func finalizeIfReady(
        _ draft: TrainingLoggerDraft,
        authority: TrainingSessionAuthority
    ) -> Bool {
        guard Self.isTerminalReady(draft) else { return false }
        return authority.endCommittedSession(
            sessionId: draft.id,
            retainingPresentation: true
        ).isAccepted
    }
}

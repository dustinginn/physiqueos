import Foundation

/// Phone-owned, recoverable structured commit for one confirmed finish
/// operation, whichever device confirmed it. The interactive phone Finish
/// (`TrainingLoggerViewModel.submit`) commits in the foreground; this
/// coordinator commits a Watch-confirmed finish and resumes any confirmed
/// finish whose commit has not proven durable (failed attempt, lost reply,
/// relaunch). Both owners take the authority's one submission lock, and both
/// reuse the draft's persisted Server idempotency identity, so there is
/// exactly one Training commit.
///
/// The structured commit alone ends the session (a pending Workout Complete
/// presentation). The Watch HealthKit save is an independent leg: it never
/// blocks structured durability, and it is recorded on the completion when
/// it reports (`TrainingSessionAuthority.recordHealthSaveAfterCommit`).
@MainActor
final class WatchWorkoutFinishCoordinator {
    struct Dependencies {
        var authority: @MainActor () -> TrainingSessionAuthority
        var writeAPI: @MainActor () -> any TrainingWriteAPI
        var isSandbox: @MainActor () -> Bool
        var backgroundScheduler: (any BackgroundTaskScheduling)?
    }

    private let dependencies: Dependencies
    private var tasks: [String: Task<Void, Never>] = [:]
    private let retryDelay: Duration
    private let maxAttempts: Int

    /// Structured durability is the only terminal condition.
    static func isTerminalReady(_ draft: TrainingLoggerDraft) -> Bool {
        draft.watchFinishOperationId != nil && draft.watchServerCommitState == .succeeded
    }

    init(
        dependencies: Dependencies,
        retryDelay: Duration = .seconds(2),
        maxAttempts: Int = 3
    ) {
        self.dependencies = dependencies
        self.retryDelay = retryDelay
        self.maxAttempts = maxAttempts
    }

    convenience init(environment: AppEnvironment) {
        self.init(dependencies: .init(
            authority: { [unowned environment] in environment.trainingSessionAuthority(for: environment.nativeAuthority) },
            writeAPI: { [unowned environment] in environment.trainingWriteAPI },
            isSandbox: { [unowned environment] in environment.nativeAuthority == .sandbox },
            backgroundScheduler: UIKitBackgroundTaskScheduler()
        ))
    }

    func isCommitting(sessionId: String) -> Bool { tasks[sessionId] != nil }

    func reconcile() {
        let authority = dependencies.authority()
        for draft in authority.drafts where draft.finishedAt != nil && draft.watchFinishOperationId != nil {
            // A commit this coordinator is running finalizes itself (and then
            // reconciles supporting evidence exactly once); a re-entrant
            // observer callback during it must not end the session first.
            guard tasks[draft.id] == nil else { continue }
            if finalizeIfReady(draft, authority: authority) { continue }
            // The interactive phone Finish owns its own commit while it runs
            // (it takes the submission lock before it stamps the finish).
            guard draft.watchServerCommitState != .succeeded,
                  !authority.isSubmitting(sessionId: draft.id)
            else { continue }
            beginServerRecovery(for: draft, authority: authority)
        }
    }

    /// Waits for an in-flight background commit of `sessionId` (if any).
    func awaitCommit(sessionId: String) async {
        await tasks[sessionId]?.value
    }

    private func beginServerRecovery(
        for candidate: TrainingLoggerDraft,
        authority: TrainingSessionAuthority
    ) {
        guard let operationId = candidate.watchFinishOperationId,
              authority.beginSubmission(sessionId: candidate.id)
        else { return }
        let writeAPI = dependencies.writeAPI()
        let isSandbox = dependencies.isSandbox()
        let scheduler = dependencies.backgroundScheduler
        let retryDelay = retryDelay
        let maxAttempts = maxAttempts
        tasks[candidate.id] = Task { [weak self] in
            // Only the owner that took the lock releases it.
            defer {
                authority.endSubmission(sessionId: candidate.id)
                self?.tasks[candidate.id] = nil
            }
            if isSandbox {
                _ = authority.recordWatchServerCommit(
                    sessionId: candidate.id,
                    finishOperationId: operationId,
                    succeeded: true
                )
                _ = self?.finalizeIfReady(authority.draft(id: candidate.id) ?? candidate, authority: authority)
                return
            }
            let attempt: () async -> Void = { [weak self] in
                await self?.commitWithRetries(
                    candidate: candidate, operationId: operationId, authority: authority,
                    writeAPI: writeAPI, retryDelay: retryDelay, maxAttempts: maxAttempts
                )
            }
            if let scheduler {
                // A Watch Finish usually arrives with the phone locked in a
                // pocket: keep the process alive for the bounded commit.
                _ = try? await withBackgroundExecutionAssertion(
                    named: "training-finish-commit", scheduler: scheduler
                ) { await attempt() }
            } else {
                await attempt()
            }
        }
    }

    private func commitWithRetries(
        candidate: TrainingLoggerDraft,
        operationId: String,
        authority: TrainingSessionAuthority,
        writeAPI: any TrainingWriteAPI,
        retryDelay: Duration,
        maxAttempts: Int
    ) async {
        for attempt in 0..<maxAttempts {
            guard !Task.isCancelled, authority.draft(id: candidate.id) != nil else { return }
            if attempt > 0 {
                do { try await Task.sleep(for: retryDelay) }
                catch { return }
            }

            if await writeAPI.isDraftAlreadyDurable(candidate) {
                let records = await writeAPI.sessionPerformanceRecords(for: candidate)
                recordServerSuccess(
                    candidate: candidate, operationId: operationId,
                    prCount: records?.count, authority: authority, writeAPI: writeAPI
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
                        candidate: candidate, operationId: operationId,
                        prCount: records?.count, authority: authority, writeAPI: writeAPI
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

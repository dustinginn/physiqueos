import Foundation

/// A bounded, cancellation-aware refresh cadence for a surface that is waiting on
/// Server-side processing (Log's Processing card, a Photo Briefing that has not
/// published yet). It exists so those surfaces never sit on a stale one-shot read
/// and never become an aggressive poll: a short, widening series of refreshes that
/// ends at a terminal state, at exhaustion, or when the owning view leaves the
/// screen (SwiftUI cancels the surrounding `.task`).
struct ProcessingRefreshSchedule: Equatable, Sendable {
    /// Delay before each successive refresh. The number of entries is the hard
    /// ceiling on refreshes for one run.
    let delays: [Duration]

    /// 14 refreshes over roughly four and a half minutes, widening from 3 s to 30 s.
    static let standard = ProcessingRefreshSchedule(
        delays: [3, 5, 8, 12, 15, 20, 20, 30, 30, 30, 30, 30, 30, 30].map { .seconds($0) }
    )
}

enum ProcessingRefreshOutcome: Equatable, Sendable {
    /// Still processing: keep waiting.
    case waiting
    /// Terminal (completed, failed, or nothing left to wait for): stop.
    case finished
}

enum ProcessingRefreshResult: Equatable, Sendable {
    case finished
    case exhausted
    case cancelled
}

enum ProcessingRefresh {
    /// Runs `refresh` after each scheduled delay until it reports `.finished`, the
    /// schedule is exhausted, or the task is cancelled. Never refreshes after
    /// cancellation. `sleep` is injectable so the cadence is testable without waiting.
    @MainActor
    @discardableResult
    static func run(
        schedule: ProcessingRefreshSchedule = .standard,
        sleep: (Duration) async throws -> Void = { try await Task.sleep(for: $0) },
        refresh: () async -> ProcessingRefreshOutcome
    ) async -> ProcessingRefreshResult {
        for delay in schedule.delays {
            do { try await sleep(delay) } catch { return .cancelled }
            if Task.isCancelled { return .cancelled }
            if await refresh() == .finished { return .finished }
        }
        return .exhausted
    }
}

/// Whether the Server has published the Photo Briefing for a Progress Photos
/// session. `pending` covers everything the Server reports as not-yet-readable
/// (the read 404s until the briefing exists); Native never guesses from the mere
/// existence of the PhotoSession, and never computes Home persistence itself.
enum PhotoBriefingAvailability: Equatable, Sendable {
    /// Not yet determined, or the probe itself failed transiently.
    case unknown
    case pending
    case published(artifactId: String)
}

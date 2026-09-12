import Foundation

/// `CoreNavigationReadService.getMorningCheckIn()`'s Native `morning-check-in`
/// resource. Deliberately narrower than the full server response — only
/// what this task's Weight/Morning Check-In write flow needs
/// (`today`/`existingWeight` for display parity, `reconciliationItems` to
/// render the previous-day-priorities disposition form). `briefingReconciliation`/
/// `existingRecovery` (Recovery Evidence/Briefing reconciliation cards) stay
/// out of scope for this pass — those remain Sandbox-only until separately
/// investigated and wired.
struct MorningCheckInReadModel: Codable, Equatable {
    var today: String
    var existingWeight: Double?
    var previousWeight: Double?
    var reconciliationItems: [MorningCheckInReconciliationItem]

    /// Only execution-kind items ever need a disposition — matches the
    /// real web screen's own `item.kind !== "evidence_recovery"` filter
    /// (`MorningCheckInScreen.jsx`) exactly, rather than checking for one
    /// specific "execution" literal that could silently drift.
    var unfinishedPriorities: [MorningCheckInReconciliationItem] {
        reconciliationItems.filter { $0.kind != "evidence_recovery" }
    }
}

/// One `reconciliationItems[]` entry (`DailyFocusService.js`'s previous-day
/// incomplete-priority selection, merged with evidence-recovery items by
/// `MorningEvidenceRecoveryService.js`). `id` is the real reminder/priority
/// identity the write command needs as `priorityId` — the server never
/// calls this field `priorityId` on read, only on write; Native must not
/// assume a field of that name exists here.
struct MorningCheckInReconciliationItem: Codable, Equatable, Identifiable {
    var id: String
    var occurrenceKey: String
    /// `date` — the one date field guaranteed present on BOTH the
    /// execution-kind shape (which also separately carries an
    /// `occurrenceDate` with the identical value) and the evidence-kind
    /// shape (which only has `date`); decoding `date` uniformly avoids a
    /// missing-key failure on evidence-kind rows.
    var date: String
    var title: String
    var context: String?
    var kind: String
}

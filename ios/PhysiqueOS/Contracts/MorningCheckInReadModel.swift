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

    var scheduledEvidencePriorities: [MorningCheckInReconciliationItem] {
        unfinishedPriorities.filter { $0.evidenceRequired == true }
    }

    var ordinaryUnfinishedPriorities: [MorningCheckInReconciliationItem] {
        unfinishedPriorities.filter { $0.evidenceRequired != true }
    }

    var recoveryOnlyItems: [MorningCheckInReconciliationItem] {
        reconciliationItems.filter { $0.kind == "evidence_recovery" }
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
    /// True only when this is a real scheduled priority occurrence whose
    /// missing evidence can alternatively be marked Skipped. Recovery-only
    /// prompts omit it and never gain a disposition action.
    var evidenceRequired: Bool? = nil
    var evidenceType: String? = nil
    var statusLabel: String? = nil
    var primaryAction: MorningCheckInReconciliationAction? = nil

    var evidenceDestination: AppDestination? {
        if let destination = primaryAction?.destination {
            // The Server's generic client-safe projection turns `/log` into
            // the shared `log` destination. Morning Check-In still owns the
            // narrower evidence meaning: Training opens the logger; every
            // other evidence type opens intake.
            if destination == .trainingLogger, evidenceType != "training" {
                return .evidenceIntake
            }
            return destination
        }
        guard let href = primaryAction?.href,
              let path = href.split(separator: "?", maxSplits: 1).first.map(String.init)
        else { return nil }
        if path.hasPrefix("/evidence/review/"),
           let reviewId = path.split(separator: "/").last.map(String.init) {
            return .evidenceReview(reviewId: reviewId)
        }
        if path == "/evidence/photos" { return .photoUpload }
        if path == "/log", evidenceType == "training" { return .trainingLogger }
        if path == "/log" { return .evidenceIntake }
        return nil
    }
}

struct MorningCheckInReconciliationAction: Codable, Equatable {
    var label: String
    /// Older/unprojected Server shapes carried the web route directly.
    var href: String? = nil
    /// Production's client-safe read projection replaces every `href` with
    /// the canonical typed destination before the Native envelope is sent.
    var destination: AppDestination? = nil

    private enum CodingKeys: String, CodingKey { case label, href, destination }

    init(label: String, href: String? = nil, destination: AppDestination? = nil) {
        self.label = label
        self.href = href
        self.destination = destination
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        label = try container.decode(String.self, forKey: .label)
        href = try container.decodeIfPresent(String.self, forKey: .href)
        destination = try container.decodeIfPresent(AppDestination.self, forKey: .destination)
        guard href != nil || destination != nil else {
            throw DecodingError.dataCorruptedError(
                forKey: .destination,
                in: container,
                debugDescription: "Morning Check-In actions require a route or typed destination."
            )
        }
    }
}

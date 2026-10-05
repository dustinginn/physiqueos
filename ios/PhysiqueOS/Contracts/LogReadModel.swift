import Foundation

/// Native transport mirror of the server's `log.v1` application read model
/// (`Phase3ReadModelService` + `LogReadService.getLog`,
/// `LoggedTodayService.composeLoggedTodaySummary`). Only genuinely
/// server-computed/dynamic state is modeled here — Training Logger's and
/// Upload's card copy are static in the web source too (hardcoded JSX, not
/// read-model fields), so they live directly in `LogView`, exactly mirroring
/// how the web itself has no server data behind them.
struct LogReadModel: Codable, Equatable {
    /// The server-computed local "today" (`getLocalDateKey`), used as the
    /// default/maximum selectable date for the weigh-in entry — native
    /// must not derive this itself (see docs/PHYSIQUEOS_NATIVE_V1.md's
    /// timezone-drift concern from the Track A audit).
    var localDate: String
    /// Training, Nutrition and Activity from the Server's
    /// `composeLoggedTodaySummary`, then (Founder Production) the Native
    /// exact-date Weight row.
    var loggedToday: [LoggedTodayRow]
    var pendingEvidenceReviews: [PendingEvidenceReview]
    /// Server-owned confirmations that have crossed the durable acceptance
    /// boundary but have not reached canonical read visibility yet. Optional
    /// keeps older fixture/read payloads backward compatible.
    var processingEvidenceReviews: [ProcessingEvidenceReview]? = nil
    /// True when the Server sent the typed Logged Today provenance contract
    /// (Log Sources, Batch 2 D1). Older Servers omit it: tiles then keep the
    /// legacy `context` caption verbatim and no Sources disclosure appears,
    /// because provenance is never parsed out of display strings.
    var typedProvenance: Bool? = nil

    var hasPendingEvidenceReviews: Bool { !pendingEvidenceReviews.isEmpty }
    var usesTypedProvenance: Bool { typedProvenance == true }

    /// The locked bottom Sources disclosure, built only from typed fields.
    var sources: [LoggedTodaySourceEntry] {
        usesTypedProvenance ? LoggedTodaySourceEntry.entries(for: loggedToday) : []
    }
    var genericProcessingEvidenceReviews: [ProcessingEvidenceReview] {
        (processingEvidenceReviews ?? []).filter { !["nutrition", "activity", "training"].contains($0.domain) }
    }
}

enum LoggedTodayRowKind: String, Codable {
    case training, nutrition, activity
    /// Founder Production only, Build 21 — synthesized locally, never
    /// decoded from the wire: `evidence-review-queue`'s own
    /// `loggedToday.rows` doesn't send a Weight row today (a confirmed,
    /// narrow server gap — see `ProductionLogAPI.fetchLog()`'s doc
    /// comment for the exact fix). Native composes this 4th row itself
    /// from a second, already-existing read (`weight`'s own exact-date
    /// `current`), never from a "latest weight" guess.
    case weight

    /// `LOGGED_TODAY_ICONS` in `LogHubScreen.jsx`.
    var systemImage: String {
        switch self {
        case .training: "figure.strengthtraining.traditional"
        case .nutrition: "fork.knife"
        case .activity: "waveform.path.ecg"
        case .weight: "scalemass"
        }
    }

    var label: String {
        switch self {
        case .training: "Training"
        case .nutrition: "Nutrition"
        case .activity: "Activity"
        case .weight: "Weight"
        }
    }
}

struct LoggedTodayRow: Codable, Equatable, Identifiable {
    var kind: LoggedTodayRowKind
    var summary: String
    var context: String?
    /// `context` without any source caption (typed-provenance Servers only).
    var contextDetail: String? = nil
    /// Typed source attribution for a single-source row. A Training row can
    /// mix sources, so its provenance lives on each line instead.
    var provenance: LoggedTodayProvenance? = nil
    var destination: AppDestination?
    var processing: Bool? = nil
    /// Server-composed lines for a row that summarizes more than one thing
    /// (Training: Strength and today's Cardio, one line per modality).
    /// `summary` stays the single-line fallback and accessibility text.
    var lines: [LoggedTodayLine]? = nil

    var id: String { kind.rawValue }

    /// The tile's secondary line: the provenance-free detail when the Server
    /// presents sources separately, otherwise the legacy caption verbatim.
    func displayContext(typedProvenance: Bool) -> String? {
        typedProvenance ? contextDetail : context
    }

    /// The lines to show when the row summarizes several things; empty when
    /// the single `summary` line already says everything.
    var displayLines: [LoggedTodayLine] {
        guard let lines, lines.count > 1 else { return [] }
        return lines
    }
}

/// One server-composed line of a Logged Today row (e.g. "Strength Training ·
/// 50 min", "2 Outdoor Walks · 32 min"). Native renders it verbatim.
struct LoggedTodayLine: Codable, Equatable, Hashable, Identifiable {
    var id: String
    var kind: String
    var summary: String
    var provenance: LoggedTodayProvenance? = nil
}

/// One typed source (`LoggedTodayService` `provenance.sources[]`). `kind` stays
/// a string so a newer Server's source still renders with its own label.
struct LoggedTodaySource: Codable, Equatable, Hashable {
    static let unavailableKind = "unavailable"
    static let unavailable = LoggedTodaySource(kind: unavailableKind, label: "Source unavailable")

    var kind: String
    var label: String

    var isUnavailable: Bool { kind == Self.unavailableKind }
}

struct LoggedTodayProvenance: Codable, Equatable, Hashable {
    /// What the source covers, e.g. "Stair Stepper", "Nutrition", "Weight".
    var scope: String
    var sources: [LoggedTodaySource]
}

/// One line of the Log Sources disclosure: a named source and the scopes it
/// supplied today, or an unattributed scope with "Source unavailable".
struct LoggedTodaySourceEntry: Equatable, Identifiable {
    var source: String
    var scope: [String]
    var id: String { "\(source)|\(scope.joined(separator: "|"))" }

    /// Known sources first in a fixed order, then other named sources in
    /// first-appearance order, then each unattributed scope on its own line.
    /// Scopes keep the Logged Today display order and are never repeated.
    static func entries(for rows: [LoggedTodayRow]) -> [LoggedTodaySourceEntry] {
        var named: [(kind: String, label: String, scopes: [String])] = []
        var unavailable: [String] = []
        let attributions = rows.flatMap { row -> [LoggedTodayProvenance] in
            let lineProvenance = (row.lines ?? []).compactMap(\.provenance)
            return lineProvenance.isEmpty ? [row.provenance].compactMap { $0 } : lineProvenance
        }
        for provenance in attributions {
            for source in provenance.sources {
                if source.isUnavailable {
                    if !unavailable.contains(provenance.scope) { unavailable.append(provenance.scope) }
                } else if let index = named.firstIndex(where: { $0.kind == source.kind }) {
                    if !named[index].scopes.contains(provenance.scope) { named[index].scopes.append(provenance.scope) }
                } else {
                    named.append((source.kind, source.label, [provenance.scope]))
                }
            }
        }
        let order = ["apple_health", "physiqueos_logger"]
        let sorted = named.enumerated().sorted { left, right in
            let leftRank = order.firstIndex(of: left.element.kind) ?? order.count
            let rightRank = order.firstIndex(of: right.element.kind) ?? order.count
            return leftRank == rightRank ? left.offset < right.offset : leftRank < rightRank
        }.map(\.element)
        return sorted.map { LoggedTodaySourceEntry(source: $0.label, scope: $0.scopes) }
            + unavailable.map { LoggedTodaySourceEntry(source: $0, scope: [LoggedTodaySource.unavailable.label]) }
    }
}

struct ProcessingEvidenceReview: Codable, Equatable, Identifiable {
    var id: String
    var localDate: String
    var domain: String
    var label: String
    var status: String
}

/// Ephemeral client acknowledgment of a Server-accepted confirmation. It
/// bridges only the read-projection race between the durable command
/// receipt and the queue's next lifecycle snapshot; the Server review
/// status remains authoritative and terminal failures restore retry UI.
struct AcceptedEvidenceReviewProcessing: Equatable, Sendable {
    var id: String
    var localDate: String?
    var domain: String
    var label: String
}

struct PendingEvidenceReview: Codable, Equatable, Identifiable {
    var id: String
    var title: String
    /// Already display-formatted (e.g. "Thursday, August 28"), mirroring
    /// `formatPendingReviewDate` — presentation formatting the server
    /// already performs, not recomputed here.
    var date: String
    var summary: String
    var likelyDuplicate: Bool
    var destination: AppDestination
    /// `"healthkit_workout_reconciliation"` for a Strength-candidate review
    /// (`projectPendingReviews`'s `presentation.kind`), nil for every other
    /// pending review type (photo/nutrition/DEXA/generic evidence, which the
    /// server never tags). The only reliable, already-server-provided way to
    /// scope the reconciliation-review notifier to exactly this review type
    /// without re-deriving it from `id`'s internal prefix convention.
    var kind: String? = nil
}

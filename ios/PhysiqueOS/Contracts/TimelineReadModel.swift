import Foundation

/// The bounded, cross-domain Timeline (`timeline` native resource) — a
/// genuinely new Native feature with no Sandbox precedent to mirror. The
/// server already resolves identity, chronology, and ordering for every
/// item; Native renders this single bounded page verbatim and does not
/// invent client-side pagination beyond it (`hasMore`/`totalCount` are
/// surfaced as an honest "showing N of M" hint, never a cursor Native
/// fabricates itself).
struct TimelineReadModel: Equatable {
    var items: [TimelineItem]
    var hasMore: Bool
    var totalCount: Int
    var limit: Int
}

struct TimelineItem: Equatable, Identifiable {
    var id: String
    /// A server-authored display string ("Weight", "Progress Photo",
    /// "DEXA", "Protocol", "Daily Check-In", "Analysis", "Daily Briefing",
    /// "Evidence Upload", "Daily Activity", "Workout") — not a closed
    /// Native enum, since the server may add new evidence types without a
    /// client release.
    var type: String
    var date: String
    var title: String
    var detail: String
    var tone: HomeColorToken
}

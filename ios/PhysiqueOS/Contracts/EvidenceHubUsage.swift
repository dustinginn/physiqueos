import Foundation

/// Native mirror of `EvidenceHubUsageService.js`'s local, client-side
/// "recently accessed" tracking. "Recent" means recently *opened* by the
/// Founder — an access-frequency + recency ranking over a locally recorded
/// visit log — never derived from an evidence stream's own `lastUpdated`
/// timestamp, which is a different, canonical-data concept entirely.
struct EvidenceHubUsage: Codable, Equatable {
    static let currentVersion = 1

    var version: Int = EvidenceHubUsage.currentVersion
    var categories: [String: EvidenceHubUsageCategory] = [:]

    static let empty = EvidenceHubUsage()
}

struct EvidenceHubUsageCategory: Codable, Equatable {
    var lastOpenedAt: Date
    var recentOpens: [Date]
}

/// Mirrors `EvidenceHubUsageService.js`'s `recordEvidenceHubVisit` and
/// `rankRecentlyUsedEvidence` exactly: a 30-day rolling window, a 50-entry
/// cap per category, and a recency-weighted score (today counts more than
/// last week, which counts more than last month) rather than a bare
/// "most-recently-opened" sort — a category opened several times recently
/// can outrank one opened once, slightly more recently.
enum EvidenceHubUsageService {
    /// `EVIDENCE_HUB_CANONICAL_ORDER` — kept in sync with
    /// `EvidenceReadModel.swift`'s fixture order rather than re-derived
    /// from the loaded hub, since ranking must be stable even before a
    /// hub has finished loading.
    static let canonicalOrder = [
        "training", "nutrition", "weight", "photos", "dexa", "activity", "energy", "recovery", "health-metrics",
    ]

    private static let windowSeconds: TimeInterval = 30 * 24 * 60 * 60
    private static let maxRecordedOpens = 50

    static func recordVisit(usage: EvidenceHubUsage, evidenceType: String, now: Date = Date()) -> EvidenceHubUsage {
        guard canonicalOrder.contains(evidenceType) else { return usage }

        var next = usage
        let cutoff = now.addingTimeInterval(-windowSeconds)
        var recentOpens = (next.categories[evidenceType]?.recentOpens ?? []).filter { $0 >= cutoff }
        recentOpens.append(now)
        if recentOpens.count > maxRecordedOpens {
            recentOpens.removeFirst(recentOpens.count - maxRecordedOpens)
        }
        next.categories[evidenceType] = EvidenceHubUsageCategory(lastOpenedAt: now, recentOpens: recentOpens)
        return next
    }

    static func rankRecentlyUsed(usage: EvidenceHubUsage, now: Date = Date(), limit: Int = 3) -> [String] {
        struct Ranked {
            let id: String
            let canonicalIndex: Int
            let lastOpenedAt: Date
            let score: Int
        }

        let ranked: [Ranked] = canonicalOrder.enumerated().compactMap { canonicalIndex, id in
            guard let category = usage.categories[id] else { return nil }
            let opens = category.recentOpens.filter { $0 <= now && now.timeIntervalSince($0) <= windowSeconds }
            guard let lastOpenedAt = opens.max() else { return nil }
            let score = opens.reduce(0) { $0 + recencyWeight(ageSeconds: now.timeIntervalSince($1)) }
            return Ranked(id: id, canonicalIndex: canonicalIndex, lastOpenedAt: lastOpenedAt, score: score)
        }

        return ranked
            .sorted { left, right in
                if left.score != right.score { return left.score > right.score }
                if left.lastOpenedAt != right.lastOpenedAt { return left.lastOpenedAt > right.lastOpenedAt }
                return left.canonicalIndex < right.canonicalIndex
            }
            .prefix(max(0, limit))
            .map(\.id)
    }

    private static func recencyWeight(ageSeconds: TimeInterval) -> Int {
        let day: TimeInterval = 24 * 60 * 60
        if ageSeconds <= day { return 4 }
        if ageSeconds <= 7 * day { return 3 }
        if ageSeconds <= 14 * day { return 2 }
        return 1
    }
}

/// The persistence seam — mirrors the web's `localStorage` boundary
/// (`readEvidenceHubUsage`/`writeEvidenceHubUsage`) so `EvidenceViewModel`
/// depends on an injectable protocol rather than `UserDefaults` directly.
protocol EvidenceHubUsageStore: Sendable {
    func load() -> EvidenceHubUsage
    func save(_ usage: EvidenceHubUsage)
}

/// `UserDefaults`-backed conformance — the native equivalent of the web's
/// `localStorage` persistence, same versioned key name. Seeds one
/// synthetic example visit log on first read only (this task: "use
/// synthetic recent-access state shaped to that behavior rather than
/// deriving it from evidence timestamps") so Recently Used is
/// demonstrable immediately; every real visit thereafter is recorded
/// through the same `EvidenceHubUsageService.recordVisit` a live
/// implementation would use, and naturally supersedes the seed over time.
/// `@unchecked Sendable`: `UserDefaults` is documented thread-safe by
/// Apple but not yet annotated `Sendable` in this SDK snapshot.
final class UserDefaultsEvidenceHubUsageStore: EvidenceHubUsageStore, @unchecked Sendable {
    private let defaults: UserDefaults
    private let key = "physiqueos:evidence-hub-usage:v1"

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func load() -> EvidenceHubUsage {
        guard let data = defaults.data(forKey: key),
              let decoded = try? JSONDecoder().decode(EvidenceHubUsage.self, from: data) else {
            let seed = Self.seedUsage()
            save(seed)
            return seed
        }
        return decoded
    }

    func save(_ usage: EvidenceHubUsage) {
        guard let data = try? JSONEncoder().encode(usage) else { return }
        defaults.set(data, forKey: key)
    }

    private static func seedUsage(now: Date = Date()) -> EvidenceHubUsage {
        var usage = EvidenceHubUsage.empty
        usage = EvidenceHubUsageService.recordVisit(usage: usage, evidenceType: "training", now: now.addingTimeInterval(-3600))
        usage = EvidenceHubUsageService.recordVisit(usage: usage, evidenceType: "training", now: now.addingTimeInterval(-1800))
        usage = EvidenceHubUsageService.recordVisit(usage: usage, evidenceType: "weight", now: now.addingTimeInterval(-7200))
        usage = EvidenceHubUsageService.recordVisit(usage: usage, evidenceType: "dexa", now: now.addingTimeInterval(-3 * 24 * 60 * 60))
        return usage
    }
}

import XCTest
@testable import PhysiqueOS

/// Regression coverage for the Evidence Hub's "Recently Used" ranking —
/// mirrors `EvidenceHubUsageService.js`'s pure functions directly, so these
/// tests assert the same behavior the web's own visit-log ranking has:
/// access-frequency + recency, never derived from a stream's own
/// `lastUpdated` evidence timestamp.
final class EvidenceHubUsageTests: XCTestCase {

    // MARK: - Recording a visit

    func testRecordingAVisitAddsAnOpenForThatCategoryOnly() {
        let now = Date()
        let usage = EvidenceHubUsageService.recordVisit(usage: .empty, evidenceType: "training", now: now)
        XCTAssertEqual(usage.categories["training"]?.recentOpens, [now])
        XCTAssertNil(usage.categories["weight"])
    }

    /// Guards the exact bug this feature must avoid: ranking must come from
    /// a recorded access log, not from re-deriving "recent" out of
    /// `stream.lastUpdated` — an unrecognized/non-canonical evidence type
    /// string must be silently ignored, exactly like the web's own guard
    /// (`EVIDENCE_HUB_CANONICAL_ORDER.includes(evidenceType)`).
    func testUnknownEvidenceTypeIsIgnored() {
        let usage = EvidenceHubUsageService.recordVisit(usage: .empty, evidenceType: "not-a-real-stream", now: Date())
        XCTAssertTrue(usage.categories.isEmpty)
    }

    // MARK: - Ranking is access-recency based, never "at most 3" violated

    func testRankingIsLimitedToAtMostThree() {
        let now = Date()
        var usage = EvidenceHubUsage.empty
        for id in EvidenceHubUsageService.canonicalOrder {
            usage = EvidenceHubUsageService.recordVisit(usage: usage, evidenceType: id, now: now)
        }
        let ranked = EvidenceHubUsageService.rankRecentlyUsed(usage: usage, now: now, limit: 3)
        XCTAssertEqual(ranked.count, 3)
    }

    /// A category opened twice recently must outrank one opened once,
    /// slightly more recently — score is frequency-weighted, not a bare
    /// "last opened" sort. This is the exact behavior the task calls out:
    /// recently *accessed*, not simply most-recently-touched.
    func testFrequentlyOpenedCategoryOutranksASingleSlightlyMoreRecentOpen() {
        let now = Date()
        var usage = EvidenceHubUsage.empty
        usage = EvidenceHubUsageService.recordVisit(usage: usage, evidenceType: "weight", now: now.addingTimeInterval(-3600))
        usage = EvidenceHubUsageService.recordVisit(usage: usage, evidenceType: "weight", now: now.addingTimeInterval(-1800))
        usage = EvidenceHubUsageService.recordVisit(usage: usage, evidenceType: "dexa", now: now.addingTimeInterval(-60))

        let ranked = EvidenceHubUsageService.rankRecentlyUsed(usage: usage, now: now, limit: 3)
        XCTAssertEqual(ranked.first, "weight")
    }

    func testTiesBreakByCanonicalOrder() {
        let now = Date()
        var usage = EvidenceHubUsage.empty
        usage = EvidenceHubUsageService.recordVisit(usage: usage, evidenceType: "photos", now: now.addingTimeInterval(-60))
        usage = EvidenceHubUsageService.recordVisit(usage: usage, evidenceType: "training", now: now.addingTimeInterval(-60))

        let ranked = EvidenceHubUsageService.rankRecentlyUsed(usage: usage, now: now, limit: 3)
        // "training" precedes "photos" in EVIDENCE_HUB_CANONICAL_ORDER.
        XCTAssertEqual(ranked, ["training", "photos"])
    }

    /// Opens older than the 30-day window must not count toward ranking —
    /// mirrors `rankRecentlyUsedEvidence`'s own `WINDOW_MS` cutoff.
    func testOpensOlderThanThirtyDaysAreExcludedFromRanking() {
        let now = Date()
        let usage = EvidenceHubUsageService.recordVisit(
            usage: .empty, evidenceType: "training", now: now.addingTimeInterval(-31 * 24 * 60 * 60)
        )
        let ranked = EvidenceHubUsageService.rankRecentlyUsed(usage: usage, now: now)
        XCTAssertTrue(ranked.isEmpty)
    }

    func testNoRecordedVisitsProducesAnEmptyRanking() {
        XCTAssertTrue(EvidenceHubUsageService.rankRecentlyUsed(usage: .empty).isEmpty)
    }

    // MARK: - Persistence round-trips through the store seam

    func testUserDefaultsStoreRoundTripsARecordedVisit() {
        let suiteName = "EvidenceHubUsageTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let store = UserDefaultsEvidenceHubUsageStore(defaults: defaults)

        let now = Date()
        let recorded = EvidenceHubUsageService.recordVisit(usage: store.load(), evidenceType: "dexa", now: now)
        store.save(recorded)

        let reloaded = store.load()
        XCTAssertNotNil(reloaded.categories["dexa"])
    }

    /// The store must seed *something* demonstrable on first read (this
    /// task: "use synthetic recent-access state ... rather than deriving
    /// it from evidence timestamps") rather than starting genuinely blank.
    func testUserDefaultsStoreSeedsSyntheticUsageOnFirstRead() {
        let suiteName = "EvidenceHubUsageTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let store = UserDefaultsEvidenceHubUsageStore(defaults: defaults)

        let ranked = EvidenceHubUsageService.rankRecentlyUsed(usage: store.load())
        XCTAssertFalse(ranked.isEmpty)
    }
}

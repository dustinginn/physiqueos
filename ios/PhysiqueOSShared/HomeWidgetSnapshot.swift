import Foundation

enum HomeWidgetContract {
    static let kind = "com.physiqueos.home.logged-today"
}

enum HomeWidgetRefreshState: String, Codable, Equatable, Sendable {
    case success
    case offline
    case failed

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = Self(rawValue: raw) ?? .failed
    }
}

struct HomeWidgetTrainingSummary: Codable, Equatable, Sendable {
    var summary: String
    var lines: [String]
    var context: String?
    var isPresent: Bool
}

struct HomeWidgetNutritionSummary: Codable, Equatable, Sendable {
    var calories: Double?
    var proteinG: Double?
    var carbsG: Double?
    var fatG: Double?
}

struct HomeWidgetActivitySummary: Codable, Equatable, Sendable {
    var activeCalories: Double?
    var isPartialDay: Bool
}

struct HomeWidgetWeightSummary: Codable, Equatable, Sendable {
    var displayValue: String
}

struct HomeWidgetWorkoutSummary: Codable, Equatable, Sendable {
    enum State: String, Codable, Equatable, Sendable { case none, active }

    var state: State
    var sessionId: String?
    var label: String?
    var completedSets: Int?
    var totalSets: Int?

    static let none = Self(state: .none, sessionId: nil, label: nil, completedSets: nil, totalSets: nil)
}

/// Minimal, display-only bridge from the app's canonical authorities to the
/// WidgetKit extension. It contains no credential, token, raw HealthKit
/// sample, meal, evidence file, or workout set/load/reps data.
struct HomeWidgetSnapshot: Codable, Equatable, Sendable {
    static let currentSchemaVersion = 1

    var schemaVersion: Int
    var authority: String
    var accountScope: String
    var localDate: String
    var timeZoneIdentifier: String
    var writtenAt: String
    var lastSuccessfulReadAt: String?
    var refreshState: HomeWidgetRefreshState
    var training: HomeWidgetTrainingSummary?
    var nutrition: HomeWidgetNutritionSummary?
    var activity: HomeWidgetActivitySummary?
    var weight: HomeWidgetWeightSummary?
    var workout: HomeWidgetWorkoutSummary

    enum CodingKeys: String, CodingKey {
        case schemaVersion, authority, accountScope, localDate, timeZoneIdentifier
        case writtenAt, lastSuccessfulReadAt, refreshState
        case training, nutrition, activity, weight, workout
    }

    init(
        schemaVersion: Int = Self.currentSchemaVersion,
        authority: String,
        accountScope: String,
        localDate: String,
        timeZoneIdentifier: String,
        writtenAt: String,
        lastSuccessfulReadAt: String?,
        refreshState: HomeWidgetRefreshState,
        training: HomeWidgetTrainingSummary?,
        nutrition: HomeWidgetNutritionSummary?,
        activity: HomeWidgetActivitySummary?,
        weight: HomeWidgetWeightSummary?,
        workout: HomeWidgetWorkoutSummary
    ) {
        self.schemaVersion = schemaVersion
        self.authority = authority
        self.accountScope = accountScope
        self.localDate = localDate
        self.timeZoneIdentifier = timeZoneIdentifier
        self.writtenAt = writtenAt
        self.lastSuccessfulReadAt = lastSuccessfulReadAt
        self.refreshState = refreshState
        self.training = training
        self.nutrition = nutrition
        self.activity = activity
        self.weight = weight
        self.workout = workout
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let version = try container.decode(Int.self, forKey: .schemaVersion)
        guard version == Self.currentSchemaVersion else {
            throw DecodingError.dataCorruptedError(
                forKey: .schemaVersion,
                in: container,
                debugDescription: "Unsupported Home widget snapshot schema \(version)"
            )
        }
        schemaVersion = version
        authority = try container.decode(String.self, forKey: .authority)
        accountScope = try container.decode(String.self, forKey: .accountScope)
        localDate = try container.decode(String.self, forKey: .localDate)
        timeZoneIdentifier = try container.decode(String.self, forKey: .timeZoneIdentifier)
        writtenAt = try container.decode(String.self, forKey: .writtenAt)
        lastSuccessfulReadAt = try container.decodeIfPresent(String.self, forKey: .lastSuccessfulReadAt)
        refreshState = try container.decode(HomeWidgetRefreshState.self, forKey: .refreshState)
        training = try container.decodeIfPresent(HomeWidgetTrainingSummary.self, forKey: .training)
        nutrition = try container.decodeIfPresent(HomeWidgetNutritionSummary.self, forKey: .nutrition)
        activity = try container.decodeIfPresent(HomeWidgetActivitySummary.self, forKey: .activity)
        weight = try container.decodeIfPresent(HomeWidgetWeightSummary.self, forKey: .weight)
        workout = try container.decodeIfPresent(HomeWidgetWorkoutSummary.self, forKey: .workout) ?? .none
    }

    func isValid(authority expectedAuthority: String, accountScope expectedAccountScope: String) -> Bool {
        authority == expectedAuthority && accountScope == expectedAccountScope && !accountScope.isEmpty
    }
}

enum HomeWidgetSnapshotClock {
    static func string(from date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }

    static func date(from string: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: string) ?? ISO8601DateFormatter().date(from: string)
    }

    static func localDateKey(at instant: Date, timeZone: TimeZone) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let parts = calendar.dateComponents([.year, .month, .day], from: instant)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }
}

enum HomeWidgetPresentationState: Equatable, Sendable {
    case unavailable
    case waitingForToday
    case fresh(ageMinutes: Int)
    case aging(ageMinutes: Int)
    case stale(ageMinutes: Int?, offline: Bool)
}

extension HomeWidgetSnapshot {
    func presentationState(at now: Date) -> HomeWidgetPresentationState {
        guard let zone = TimeZone(identifier: timeZoneIdentifier),
              localDate == HomeWidgetSnapshotClock.localDateKey(at: now, timeZone: zone)
        else { return .waitingForToday }
        guard let lastSuccessfulReadAt,
              let successDate = HomeWidgetSnapshotClock.date(from: lastSuccessfulReadAt)
        else { return .unavailable }
        let ageMinutes = max(0, Int(now.timeIntervalSince(successDate) / 60))
        if refreshState != .success || ageMinutes > 240 {
            return .stale(ageMinutes: ageMinutes, offline: refreshState == .offline)
        }
        if ageMinutes > 90 { return .aging(ageMinutes: ageMinutes) }
        return .fresh(ageMinutes: ageMinutes)
    }
}

struct HomeWidgetSnapshotFileStore: Sendable {
    static let appGroupIdentifier = "group.com.physiqueos.native.dev.shared"
    static let fileName = "home-widget-snapshot-v1.json"

    let fileURL: URL

    static func shared(fileManager: FileManager = .default) -> Self? {
        guard let container = fileManager.containerURL(
            forSecurityApplicationGroupIdentifier: appGroupIdentifier
        ) else { return nil }
        return Self(fileURL: container.appendingPathComponent(fileName, isDirectory: false))
    }

    func read() -> HomeWidgetSnapshot? {
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        return try? JSONDecoder().decode(HomeWidgetSnapshot.self, from: data)
    }

    func read(authority: String, accountScope: String) -> HomeWidgetSnapshot? {
        guard let snapshot = read(), snapshot.isValid(authority: authority, accountScope: accountScope) else { return nil }
        return snapshot
    }

    func write(_ snapshot: HomeWidgetSnapshot) throws {
        let directory = fileURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let data = try encoder.encode(snapshot)
        try data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    func clear() throws {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return }
        try FileManager.default.removeItem(at: fileURL)
    }
}

enum HomeWidgetSamples {
    static let referenceDate = ISO8601DateFormatter().date(from: "2026-10-02T18:00:00Z")!

    static func snapshot(
        weight: Bool = true,
        activeWorkout: Bool = false,
        stale: Bool = false,
        waiting: Bool = false,
        longTraining: Bool = false
    ) -> HomeWidgetSnapshot {
        let success = referenceDate.addingTimeInterval(stale ? -5 * 3600 : -18 * 60)
        let trainingLines = longTraining
            ? ["Traditional Strength Training · Chest, Shoulders & Triceps · 1 hr 42 min", "2 Outdoor Walks · 37 min"]
            : ["Strength Training · 58 min", "Outdoor Walk · 24 min"]
        return HomeWidgetSnapshot(
            authority: "founderProduction",
            accountScope: "preview-account",
            localDate: waiting ? "2026-10-01" : "2026-10-02",
            timeZoneIdentifier: "America/Los_Angeles",
            writtenAt: HomeWidgetSnapshotClock.string(from: referenceDate),
            lastSuccessfulReadAt: HomeWidgetSnapshotClock.string(from: success),
            refreshState: stale ? .offline : .success,
            training: .init(summary: trainingLines.joined(separator: ", "), lines: trainingLines, context: nil, isPresent: true),
            nutrition: .init(calories: 2_140, proteinG: 176, carbsG: 218, fatG: 71),
            activity: .init(activeCalories: 648, isPartialDay: true),
            weight: weight ? .init(displayValue: "167.4 lb") : nil,
            workout: activeWorkout
                ? .init(state: .active, sessionId: "preview-session", label: "Chest & Shoulders", completedSets: 6, totalSets: 18)
                : .none
        )
    }
}

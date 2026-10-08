import ActivityKit
import Foundation

// Shared ActivityKit contract for the Workout Logger Live Activity. This file
// is compiled into BOTH the app and the Widget Extension, so it may import
// only Foundation/ActivityKit and must stay extension-safe.
//
// The Live Activity is a pure, write-only projection of the
// `TrainingSessionAuthority` state. Nothing here is authoritative and
// nothing decoded from an Activity ever feeds back into a workout.
//
// Compatibility rules (an activity started by build N keeps rendering after
// the user installs build N+1, so N's JSON must decode in N+1):
// - new fields are optional; fields are never removed or renamed;
// - enums decode unknown raw values to a SAFE case;
// - a breaking change bumps `schemaVersion` and the app ends + re-requests.

/// Safe decoding for string enums: unknown raw values never throw.
protocol WorkoutActivitySafeEnum: RawRepresentable, Codable where RawValue == String {
    static var fallback: Self { get }
}

extension WorkoutActivitySafeEnum {
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = Self(rawValue: raw) ?? Self.fallback
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

struct WorkoutActivityAttributes: ActivityAttributes, Hashable {
    static let currentSchemaVersion = 1

    /// Immutable for the life of the activity.
    var schemaVersion: Int
    var sessionId: String
    /// `NativeAPIEnvironment` raw value ("sandbox" | "founderProduction"),
    /// so an intent addresses the right authority.
    var authority: String
    var startedAt: Date

    struct ContentState: Codable, Hashable {
        var schemaVersion: Int
        /// Authority revision this state was rendered from; the Complete Set
        /// intent passes it back as `expectedRevision`.
        var revision: Int
        var phase: Phase
        var label: String
        var completedSets: Int
        var totalSets: Int
        var layout: Layout
        /// At most two rows (the Founder's two-row rule).
        var rows: [Row]
        /// The set Complete Set would complete. Nil whenever completion is
        /// unavailable (saving, saved, all sets complete, review).
        var target: Target?
        var rest: Rest?
        /// Freezes workout elapsed once Finish begins.
        var finishedAt: Date?
        /// The app-owned PhysiqueOS appearance this state was rendered for
        /// (the user's in-app choice, which can differ from iOS). Optional:
        /// an activity started by an older build decodes as nil and renders
        /// exactly as before (follows the system appearance) until the app's
        /// next update re-stamps it.
        var appearance: Appearance? = nil

        enum Appearance: String, WorkoutActivitySafeEnum {
            /// PhysiqueOS "System": follow the iOS appearance.
            case system
            case dark
            case mineralLight
            static var fallback: Self { .system }
        }

        enum Phase: String, WorkoutActivitySafeEnum {
            case inProgress
            case allSetsComplete
            case reviewing
            case finishing
            case saved
            /// Explicit workout pause, and the safe fallback for unknown
            /// future phases. Never offers Complete Set.
            case paused
            static var fallback: Self { .paused }
        }

        enum Layout: String, WorkoutActivitySafeEnum {
            case previousAndCurrent
            case currentAndUpNext
            case completedAndUpNext
            case currentOnly
            case completedOnly
            case empty
            static var fallback: Self { .empty }
        }

        struct Row: Codable, Hashable {
            enum Role: String, WorkoutActivitySafeEnum {
                case previous, completed, current, upNext
                static var fallback: Self { .current }
            }
            var role: Role
            var exerciseName: String
            var variantLabel: String?
            /// "A" / "B" inside a superset; the set number is the round.
            var supersetLabel: String?
            var partnerName: String?
            var setNumber: Int
            var setCount: Int
            /// "185 lb × 8", "BW × 12", "45 s".
            var valueText: String?
            /// This row's set is what Complete Set completes.
            var isTarget: Bool
        }

        struct Target: Codable, Hashable {
            var exerciseId: String
            var setId: String
        }

        struct Rest: Codable, Hashable {
            enum Mode: String, WorkoutActivitySafeEnum {
                case stopwatch, countdown
                static var fallback: Self { .stopwatch }
            }
            var id: String
            var mode: Mode
            var startedAt: Date
            /// Countdown only; the system renders `endsAt - now`.
            var endsAt: Date?
        }

        var progressText: String { "\(completedSets)/\(totalSets) sets" }
        var canCompleteSet: Bool { phase == .inProgress && target != nil }
    }
}

/// Deep link from the Live Activity into the active Workout Logger. A custom
/// scheme is reachable by any app, so parsing only ever yields a session id
/// for *navigation*; it never mutates anything and the app verifies the
/// session exists locally.
enum WorkoutActivityDeepLink {
    static let scheme = "physiqueos-workout"
    static let host = "open"

    static func url(sessionId: String) -> URL? {
        guard isValid(sessionId: sessionId) else { return nil }
        var components = URLComponents()
        components.scheme = scheme
        components.host = host
        components.queryItems = [URLQueryItem(name: "session", value: sessionId)]
        return components.url
    }

    /// The session id a well-formed link carries, else nil.
    static func sessionId(from url: URL) -> String? {
        guard url.scheme == scheme, url.host == host,
              let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems,
              let id = items.first(where: { $0.name == "session" })?.value,
              isValid(sessionId: id) else { return nil }
        return id
    }

    static func isValid(sessionId: String) -> Bool {
        !sessionId.isEmpty && sessionId.count <= 64
            && sessionId.unicodeScalars.allSatisfy { CharacterSet.alphanumerics.contains($0) || $0 == "-" }
    }
}

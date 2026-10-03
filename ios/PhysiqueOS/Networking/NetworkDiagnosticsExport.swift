import Foundation
import Observation

/// Whether the command transport is currently waiting for a network path
/// (Build 83). Drives "Waiting for network" on the phone's Finish screen and
/// on the paired Watch. Set from any thread via `report(waiting:)`.
@MainActor
@Observable
final class CommandConnectivityStatus {
    static let shared = CommandConnectivityStatus()

    private(set) var waitingSince: Date?
    var isWaitingForNetwork: Bool { waitingSince != nil }
    @ObservationIgnored private var observers: [UUID: @MainActor () -> Void] = [:]

    @discardableResult
    func observe(_ handler: @escaping @MainActor () -> Void) -> UUID {
        let id = UUID()
        observers[id] = handler
        return id
    }

    func removeObserver(_ id: UUID) { observers[id] = nil }

    func setWaiting(_ waiting: Bool, at date: Date = Date()) {
        guard waiting != isWaitingForNetwork else { return }
        waitingSince = waiting ? date : nil
        observers.values.forEach { $0() }
    }

    nonisolated static func report(waiting: Bool) {
        Task { @MainActor in shared.setWaiting(waiting) }
    }
}

/// Founder-exportable, sanitized network diagnostics: the command
/// transport's attempt/wait/recreate events, its retained failure ring, and
/// the app-wide request failure ring. Paths, timings, interfaces and error
/// codes only: no tokens, credentials, request or response bodies, health
/// values, or query strings.
enum NetworkDiagnosticsExport {
    struct Document: Codable {
        var schemaVersion = 1
        var exportedAt: Date
        var appVersion: String
        var appBuild: String
        var commandEvents: [CommandNetworkDiagnostics.Event]
        var commandFailureEvents: [CommandNetworkDiagnostics.Event]
        var requestFailures: [RequestFailure]
    }

    struct RequestFailure: Codable {
        var capturedAt: Date
        var path: String
        var errorDomain: String
        var errorCode: Int
    }

    static func makeDocument(
        defaults: UserDefaults = .standard,
        bundle: Bundle = .main,
        now: Date = Date()
    ) -> Document {
        Document(
            exportedAt: now,
            appVersion: bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?",
            appBuild: bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "?",
            commandEvents: CommandNetworkDiagnostics.recentEvents(defaults: defaults),
            commandFailureEvents: CommandNetworkDiagnostics.recentFailureEvents(defaults: defaults),
            // The free-text description can embed a failing URL; export only
            // the structured identity.
            requestFailures: NetworkFailureDiagnostics.recentEvents(defaults: defaults).map {
                RequestFailure(capturedAt: $0.capturedAt, path: sanitizedPath($0.path), errorDomain: $0.errorDomain, errorCode: $0.errorCode)
            }
        )
    }

    static func makeJSON(defaults: UserDefaults = .standard, bundle: Bundle = .main, now: Date = Date()) -> Data {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return (try? encoder.encode(makeDocument(defaults: defaults, bundle: bundle, now: now))) ?? Data()
    }

    /// Drops any query string a future caller might put in a path.
    static func sanitizedPath(_ path: String) -> String {
        String(path.split(separator: "?", maxSplits: 1).first ?? "")
    }

    struct Summary: Equatable {
        var attempts: Int
        var failures: Int
        var connectivityWaits: Int
        var sessionRecreations: Int
        var lastFailureAt: Date?
    }

    static func summary(defaults: UserDefaults = .standard) -> Summary {
        let events = CommandNetworkDiagnostics.recentEvents(defaults: defaults)
        let failures = CommandNetworkDiagnostics.recentFailureEvents(defaults: defaults)
        return Summary(
            attempts: events.filter { ($0.kind ?? "attempt") == "attempt" }.count,
            failures: failures.filter { ($0.kind ?? "attempt") != "waitingForConnectivity" && $0.kind != "sessionRecreated" }.count,
            connectivityWaits: failures.filter { $0.kind == "waitingForConnectivity" }.count,
            sessionRecreations: failures.filter { $0.kind == "sessionRecreated" }.count,
            lastFailureAt: failures.first?.capturedAt
        )
    }
}

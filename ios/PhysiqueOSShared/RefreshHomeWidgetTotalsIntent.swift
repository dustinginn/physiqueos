import AppIntents
import Foundation

/// Process hook installed by the app at launch. `openAppWhenRun` keeps the
/// canonical Server/HealthKit-backed refresh in the app process; the widget
/// extension never receives credentials or becomes a second data authority.
enum HomeWidgetRefreshIntentRuntime {
    nonisolated(unsafe) static var handler: (@Sendable (String) async -> Void)?

    static func request(authority: String, waitingUpTo seconds: Double = 5) async {
        var waited = 0.0
        while handler == nil, waited < seconds {
            try? await Task.sleep(for: .milliseconds(50))
            waited += 0.05
        }
        await handler?(authority)
    }
}

/// The square widget's independent refresh control. It foregrounds the app,
/// then asks the already-installed app-owned coordinator for a canonical
/// snapshot. It never reads the Server or HealthKit in the extension.
struct RefreshHomeWidgetTotalsIntent: AppIntent {
    static let title: LocalizedStringResource = "Refresh PhysiqueOS totals"
    static let description = IntentDescription("Opens PhysiqueOS and refreshes today's widget totals.")
    static let isDiscoverable = false
    static let openAppWhenRun = true

    @Parameter(title: "Authority") var authority: String

    init() { authority = "" }
    init(authority: String) { self.authority = authority }

    func perform() async throws -> some IntentResult {
        await HomeWidgetRefreshIntentRuntime.request(authority: authority)
        return .result()
    }
}

import Foundation

/// The five Stage 1 primary destinations, in the established product
/// information architecture (see docs/INFORMATION_ARCHITECTURE.md and
/// docs/PHYSIQUEOS_NATIVE_V1.md, section 13). This is not a copy of the
/// server's typed destination registry (`src/contracts/v1/destination.js`)
/// — that registry addresses in-screen navigation (22 cases) and is out of
/// scope for this foundation slice. `AppTab` only identifies the top-level
/// tabs themselves.
///
/// Order and case names are product meaning, not implementation detail:
/// changing them changes the IA.
enum AppTab: String, CaseIterable, Identifiable {
    case home
    case log
    case progress
    case coach
    case profile

    var id: String { rawValue }

    var title: String {
        switch self {
        case .home: "Home"
        case .log: "Log"
        case .progress: "Progress"
        case .coach: "Coach"
        case .profile: "Profile"
        }
    }

    var systemImageName: String {
        switch self {
        case .home: "house"
        case .log: "plus.circle"
        case .progress: "chart.line.uptrend.xyaxis"
        case .coach: "figure.mind.and.body"
        case .profile: "person.crop.circle"
        }
    }
}

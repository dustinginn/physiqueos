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

    /// The foundation slice's icons were unreviewed placeholders. These
    /// are chosen to match the web's own established icon vocabulary —
    /// `src/components/navigation/BottomNavItem.jsx`'s `iconMap`
    /// (`Home`, `PlusCircle`, `BarChart3`, `MessageCircle`, `User` from
    /// lucide-react) — rather than an independently invented native set.
    /// Most notably, Coach's icon is a message bubble, not a meditation
    /// pose: the web's own `iconMap.coach` is `MessageCircle`, matching
    /// what "Coach" means in this product (a coaching conversation), not
    /// wellness/mindfulness.
    var systemImageName: String {
        switch self {
        case .home: "house.fill"
        case .log: "plus.circle.fill"
        case .progress: "chart.bar.fill"
        case .coach: "message.fill"
        case .profile: "person.crop.circle.fill"
        }
    }
}

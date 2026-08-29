import Foundation

/// The five Stage 1 primary destinations. This is the actual, currently
/// live web bottom navigation — read directly from
/// `src/fixtures/bottomNavigation.js` (which `FloatingBottomNavigation.jsx`
/// renders), not from `docs/INFORMATION_ARCHITECTURE.md`/
/// `docs/PHYSIQUEOS_NATIVE_V1.md` section 13's older "Home, Log, Progress,
/// Coach, Profile" set: that set was a stale planning-era description this
/// slice found and corrected — the web has no Progress or Coach root tab
/// today, and Goals is a root tab the prior native slice omitted entirely.
/// `AppTab` is not a copy of the server's typed destination registry
/// (`src/contracts/v1/destination.js`, 22 cases) — that addresses in-screen
/// navigation and is out of scope here. `AppTab` only identifies the
/// top-level tabs themselves.
///
/// Order and case names are product meaning, not implementation detail:
/// changing them changes the IA. Log is deliberately the center tab, per
/// the web's own fixture order (`home, goals, log, evidence, profile`).
enum AppTab: String, CaseIterable, Identifiable {
    case home
    case goals
    case log
    case evidence
    case you

    var id: String { rawValue }

    /// Labels copied verbatim from `bottomNavigation.js` (`"Home"`,
    /// `"Goals"`, `"Log"`, `"Evidence"`, `"You"`) — note the web's "You"
    /// label maps to the `profile` route/icon key, not a `you` key; the
    /// `.you` case name here reflects the product-facing label the
    /// Founder reads, `serverRouteKey` below preserves the underlying
    /// route/icon identity.
    var title: String {
        switch self {
        case .home: "Home"
        case .goals: "Goals"
        case .log: "Log"
        case .evidence: "Evidence"
        case .you: "You"
        }
    }

    /// `bottomNavigation.js`'s `route` field (`"home"`, `"goals"`, `"log"`,
    /// `"progress"`, `"profile"`) — the Evidence tab's underlying route/
    /// icon key is `"progress"` (its `href` is `/progress`, the Evidence
    /// Hub page), and You's is `"profile"`; both differ from their tab
    /// label. Kept distinct from `rawValue` so `AppTab`'s own Swift case
    /// naming can stay label-aligned without losing the real route
    /// identity a later live API/deep-link integration will need.
    var serverRouteKey: String {
        switch self {
        case .home: "home"
        case .goals: "goals"
        case .log: "log"
        case .evidence: "progress"
        case .you: "profile"
        }
    }

    /// Faithful native equivalents of the web's own established icon
    /// vocabulary — `src/components/navigation/BottomNavItem.jsx`'s
    /// `iconMap` (`Home`, `Target`, `PlusCircle`, `BarChart3`, `User` from
    /// lucide-react), read directly from source rather than invented. The
    /// prior foundation slice's icons (including a Coach tab that no
    /// longer exists in the web's navigation) were unreviewed placeholders
    /// and are not precedent.
    var systemImageName: String {
        switch self {
        case .home: "house.fill"
        case .goals: "target"
        case .log: "plus.circle.fill"
        case .evidence: "chart.bar.fill"
        case .you: "person.crop.circle.fill"
        }
    }
}

import Foundation

/// Home's daypart greeting ("Good morning," / "Good afternoon," / "Good
/// evening,") must reflect the device the Founder is actually looking at,
/// not the server process's own clock. The server's `home` resource
/// computes this from `new Date().getHours()` in whatever timezone the
/// server process itself runs in (effectively UTC) — a Founder viewing the
/// app at 10 PM Pacific was shown "Good morning," because that instant is
/// early morning UTC. Greeting daypart is not a canonical, server-owned
/// semantic (unlike Goal chronology, Confidence, or Energy derivation) —
/// it is purely "what time is it right now for the person holding this
/// phone," which only the device can answer correctly. Native computes it
/// from the device's own calendar/timezone and ignores `header.greeting`;
/// `header.name` remains server-owned and unchanged.
enum HomeGreeting {
    static func text(for date: Date = Date(), calendar: Calendar = .current) -> String {
        switch calendar.component(.hour, from: date) {
        case 5..<12: "Good morning,"
        case 12..<17: "Good afternoon,"
        default: "Good evening,"
        }
    }
}

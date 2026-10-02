import Foundation

enum HomeWidgetDeepLink: Equatable, Sendable {
    static let scheme = "physiqueos-workout"
    static let host = "widget"
    static let maximumValueLength = 160

    case summary(localDate: String)
    case training(localDate: String)
    case nutrition(localDate: String)
    case activity(localDate: String)
    case weight(localDate: String)
    case refresh(authority: String)
    case startWorkout(authority: String)
    case resumeWorkout(sessionId: String, authority: String)

    var url: URL {
        var components = URLComponents()
        components.scheme = Self.scheme
        components.host = Self.host
        switch self {
        case .summary(let day): components.queryItems = Self.items(route: "summary", day: day)
        case .training(let day): components.queryItems = Self.items(route: "training", day: day)
        case .nutrition(let day): components.queryItems = Self.items(route: "nutrition", day: day)
        case .activity(let day): components.queryItems = Self.items(route: "activity", day: day)
        case .weight(let day): components.queryItems = Self.items(route: "weight", day: day)
        case .refresh(let authority):
            components.queryItems = [
                URLQueryItem(name: "route", value: "refresh"),
                URLQueryItem(name: "authority", value: authority),
            ]
        case .startWorkout(let authority):
            components.queryItems = [
                URLQueryItem(name: "route", value: "start"),
                URLQueryItem(name: "authority", value: authority),
            ]
        case .resumeWorkout(let sessionId, let authority):
            components.queryItems = [
                URLQueryItem(name: "route", value: "resume"),
                URLQueryItem(name: "session", value: sessionId),
                URLQueryItem(name: "authority", value: authority),
            ]
        }
        return components.url!
    }

    static func parse(_ url: URL) -> HomeWidgetDeepLink? {
        guard url.scheme == scheme, url.host == host,
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        else { return nil }
        var values: [String: String] = [:]
        for item in components.queryItems ?? [] {
            guard let value = item.value, values[item.name] == nil else { return nil }
            values[item.name] = value
        }
        guard let route = bounded(values["route"]) else { return nil }
        switch route {
        case "summary", "training", "nutrition", "activity", "weight":
            guard let day = bounded(values["date"]), isDateKey(day) else { return nil }
            switch route {
            case "summary": return .summary(localDate: day)
            case "training": return .training(localDate: day)
            case "nutrition": return .nutrition(localDate: day)
            case "activity": return .activity(localDate: day)
            default: return .weight(localDate: day)
            }
        case "refresh":
            guard let authority = bounded(values["authority"]) else { return nil }
            return .refresh(authority: authority)
        case "start":
            guard let authority = bounded(values["authority"]) else { return nil }
            return .startWorkout(authority: authority)
        case "resume":
            guard let session = bounded(values["session"]), let authority = bounded(values["authority"]) else { return nil }
            return .resumeWorkout(sessionId: session, authority: authority)
        default:
            return nil
        }
    }

    private static func items(route: String, day: String) -> [URLQueryItem] {
        [URLQueryItem(name: "route", value: route), URLQueryItem(name: "date", value: day)]
    }

    private static func bounded(_ value: String?) -> String? {
        guard let value, !value.isEmpty, value.count <= maximumValueLength else { return nil }
        return value
    }

    private static func isDateKey(_ value: String) -> Bool {
        guard value.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil else { return false }
        let parts = value.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return false }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let requested = DateComponents(year: parts[0], month: parts[1], day: parts[2])
        guard let date = calendar.date(from: requested) else { return false }
        let resolved = calendar.dateComponents([.year, .month, .day], from: date)
        return resolved.year == requested.year && resolved.month == requested.month && resolved.day == requested.day
    }
}

import Foundation

/// The app's composition root.
///
/// Stage 1 introduces no networking, authentication, or persistence, so this
/// type is intentionally empty. It exists now so later slices can attach a
/// fixture-backed (and eventually live) API client, session state, and
/// device-local settings here without restructuring how screens obtain their
/// dependencies. Screens must keep depending on this type by injection
/// rather than reaching for globals as real dependencies are added.
@Observable
final class AppEnvironment {
    init() {}
}

import Foundation

/// The app's composition root.
///
/// Screens depend on this type by injection rather than reaching for
/// globals. `homeAPI` is the first dependency attached here — a
/// fixture-backed `HomeAPI` today, replaced with a live, authenticated
/// implementation once one exists, with no change required to `HomeView`
/// or `HomeViewModel`.
@Observable
final class AppEnvironment {
    let homeAPI: HomeAPI

    init(homeAPI: HomeAPI = FixtureHomeAPI()) {
        self.homeAPI = homeAPI
    }
}

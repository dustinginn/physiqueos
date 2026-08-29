import SwiftUI

/// Honest placeholder for the "You" tab (the web's Founder profile/settings
/// route, `route: "profile"` in `bottomNavigation.js`). Replaces the prior
/// slice's `ProfilePlaceholderView` — same scope, renamed to match the
/// corrected `AppTab.you` case and its "You" label.
struct YouPlaceholderView: View {
    var body: some View {
        TabPlaceholderView(tab: .you, subtitle: "Founder profile and settings arrive in a later slice.")
    }
}

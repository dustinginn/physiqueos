import SwiftUI

/// Compact rest-tracking control for the Workout Logger: Stopwatch,
/// Countdown (with a length) or Off. It edits the device-wide default; the
/// choice applies from the next completed set, and a rest interval already
/// running keeps the mode it started with.
struct TrainingRestPreferenceMenu: View {
    let preferences: UserDefaultsTrainingRestPreferences

    var body: some View {
        Menu {
            Section("Rest after each set") {
                Button { preferences.select(.stopwatch) } label: {
                    Label("Stopwatch", systemImage: preferences.configuration.effectiveMode == .stopwatch ? "checkmark" : "stopwatch")
                }
                Button { preferences.select(.countdown) } label: {
                    Label("Countdown", systemImage: preferences.configuration.effectiveMode == .countdown ? "checkmark" : "timer")
                }
                Button { preferences.select(.off) } label: {
                    Label("Off", systemImage: preferences.configuration.effectiveMode == .off ? "checkmark" : "nosign")
                }
            }
            Menu("Countdown length · \(UserDefaultsTrainingRestPreferences.clock(seconds: preferences.countdownSeconds))") {
                ForEach(UserDefaultsTrainingRestPreferences.countdownPresets, id: \.self) { seconds in
                    Button {
                        preferences.selectCountdown(seconds: seconds)
                    } label: {
                        if preferences.configuration.effectiveMode == .countdown, preferences.configuration.countdownDurationSeconds == seconds {
                            Label(UserDefaultsTrainingRestPreferences.clock(seconds: seconds), systemImage: "checkmark")
                        } else {
                            Text(UserDefaultsTrainingRestPreferences.clock(seconds: seconds))
                        }
                    }
                }
            }
            Text("Applies from your next completed set.")
        } label: {
            Label("Rest · \(preferences.summary)", systemImage: symbol)
                .frame(maxWidth: .infinity, minHeight: 34)
        }
        .buttonStyle(.bordered)
        .tint(PhysiqueOSTheme.accent)
        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
        .accessibilityIdentifier("trainingLogger.restPreference")
    }

    private var symbol: String {
        switch preferences.configuration.effectiveMode {
        case .stopwatch: "stopwatch"
        case .countdown: "timer"
        case .off: "nosign"
        }
    }
}

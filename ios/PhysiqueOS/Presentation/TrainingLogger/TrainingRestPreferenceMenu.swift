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
            // Same quiet secondary-control grammar as Save & Leave.
            HStack(spacing: 4) {
                Image(systemName: symbol)
                    .font(.system(size: 10, weight: .bold))
                    .accessibilityHidden(true)
                Text("Rest · \(preferences.summary)")
                    .logText(LoggerType.control11)
            }
            .foregroundStyle(PhysiqueOSTheme.redesignInk)
            .padding(.horizontal, 14)
            .frame(maxWidth: .infinity, minHeight: 42)
            .background(PhysiqueOSTheme.redesignSoft, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(PhysiqueOSTheme.redesignHairline, lineWidth: 1))
            .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .accessibilityLabel("Rest · \(preferences.summary)")
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

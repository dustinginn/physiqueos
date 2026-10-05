import SwiftUI

/// The locked Log execution field: the Training Logger doorway leads the
/// Compact Command Center in the amber execution color. It routes through
/// the typed `AppDestination.trainingLogger`; workout state is untouched.
struct TrainingLoggerCardView: View {
    var onTap: (AppDestination) -> Void

    var body: some View {
        Button { onTap(.trainingLogger) } label: {
            HStack(alignment: .center, spacing: 10) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Training Logger")
                        .logText(LogType.actionTitle)
                    Text("Start a workout or log a past workout with exercises, sets, variants, and supersets.")
                        .logText(LogType.actionBody)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: 265, alignment: .leading)
                        .padding(.top, 5)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "diamond.fill")
                    .font(.system(size: 12, weight: .bold))
                    .frame(width: 42, height: 42)
                    .background(Color.white.opacity(0.125), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .accessibilityHidden(true)
            }
            .foregroundStyle(PhysiqueOSTheme.redesignOnAmber)
            .padding(15)
            .frame(maxWidth: .infinity, minHeight: 96, alignment: .leading)
            .background(PhysiqueOSTheme.redesignAmber, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("log.trainingLogger")
    }
}

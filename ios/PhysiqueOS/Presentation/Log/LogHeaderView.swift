import SwiftUI

/// The locked Log header: eyebrow, headline and subtitle. Copy is the
/// canonical `LogHubScreen.jsx` header; Log is a peer tab of Home, so the
/// web's "Back to Home" link stays omitted (see `docs/PHYSIQUEOS_NATIVE_V1.md`).
struct LogHeaderView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Log")
                .logText(LogType.eyebrow)
                .foregroundStyle(PhysiqueOSTheme.redesignPurple)
                .padding(.bottom, 5)
            Text("What happened?")
                .logText(LogType.title)
                .foregroundStyle(PhysiqueOSTheme.redesignInk)
            Text("Upload a screenshot, photo, PDF, or note and PhysiqueOS will organize it.")
                .logText(LogType.subtitle)
                .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 6)
        }
        .padding(.top, 2)
        .padding(.bottom, 5)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

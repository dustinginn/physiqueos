import SwiftUI

/// `ProtocolBuilderShell.jsx` — the shared step-wizard chrome behind both
/// the Training and Activity Protocol Builders: a progress bar labeled
/// "Step X of N", a card holding the current step's title/content, and a
/// fixed Back/Continue button pair. One shell, reused by both builders,
/// matching the web's own single shared component rather than two
/// independently-styled wizards.
struct ProtocolBuilderShell<Content: View>: View {
    let eyebrow: String
    let title: String
    let currentStep: Int
    let totalSteps: Int
    var canContinue: Bool = true
    var isSubmitting: Bool = false
    var primaryLabel: String = "Continue"
    var submittingLabel: String = "Saving…"
    var errorMessage: String? = nil
    let onBack: (() -> Void)?
    let onContinue: () -> Void
    @ViewBuilder var content: Content

    private var progress: Double {
        totalSteps > 0 ? Double(currentStep) / Double(totalSteps) : 0
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(eyebrow.uppercased())
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                        Spacer()
                        Text("Step \(currentStep) of \(totalSteps)")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                    }
                    ProgressView(value: progress)
                        .tint(PhysiqueOSTheme.accent)
                }

                CardContainer(padding: .md) {
                    VStack(alignment: .leading, spacing: 16) {
                        Text(title)
                            .physiqueOSFont(PhysiqueOSTypography.cardHeading20)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        content
                        if let errorMessage {
                            OperatingPlanEditorErrorBanner(message: errorMessage)
                        }
                    }
                }

                HStack(spacing: 12) {
                    Button("Back") { onBack?() }
                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        .foregroundStyle(onBack == nil ? PhysiqueOSTheme.textMuted : PhysiqueOSTheme.textPrimary)
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .background(PhysiqueOSTheme.surfaceMuted)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .disabled(onBack == nil || isSubmitting)

                    Button(isSubmitting ? submittingLabel : primaryLabel, action: onContinue)
                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .background(PhysiqueOSTheme.accent)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .disabled(!canContinue || isSubmitting)
                        .opacity((!canContinue || isSubmitting) ? PrimaryActionButton.disabledOpacity : 1)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
    }
}

/// A single selectable option row with description/impact copy — the
/// shared "radio" `Choice` control both builders use for objective/pace/
/// nutrition-phase pickers.
struct ProtocolBuilderChoiceRow: View {
    let title: String
    let detail: String?
    let impact: String?
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(isSelected ? PhysiqueOSTheme.accent : PhysiqueOSTheme.textPrimary)
                if let detail {
                    Text(detail)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
                if let impact {
                    Text("What this means: \(impact)")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(isSelected ? PhysiqueOSTheme.surfaceAccent : PhysiqueOSTheme.surfaceMuted)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .strokeBorder(isSelected ? PhysiqueOSTheme.accent : .clear, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}

/// The read-only summary review step — mirrors `ProtocolReview.jsx`.
struct ProtocolBuilderReview: View {
    struct Section: Identifiable {
        let id = UUID()
        let label: String
        let value: String
    }
    let sections: [Section]
    let footer: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(sections) { section in
                VStack(alignment: .leading, spacing: 3) {
                    Text(section.label.uppercased())
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                    Text(section.value)
                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(PhysiqueOSTheme.surfaceMuted)
                .clipShape(RoundedRectangle(cornerRadius: 16))
            }
            Text(footer)
                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
                .frame(maxWidth: .infinity, alignment: .center)
        }
    }
}

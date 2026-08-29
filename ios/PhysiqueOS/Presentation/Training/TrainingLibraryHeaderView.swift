import SwiftUI

/// Mirrors `TrainingLibraryHeader` (`TrainingKnowledgeScreen.jsx:181-220`):
/// a static "Training Library" eyebrow, the page's own title, and a
/// breadcrumb pill row (`getTrainingLibraryHeaderItems`) — no description
/// line for either a bare Training Area page or an exercise-detail page
/// (`getLibraryContent`/`getExerciseDetailContent` both set `summary:
/// null`). Shared by `TrainingAreaView` and `TrainingExerciseDetailView`,
/// the two screens that render this exact web header.
struct TrainingLibraryHeaderView: View {
    let title: String
    let breadcrumbs: [TrainingBreadcrumb]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Training Library")
                    .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                    .foregroundStyle(PhysiqueOSTheme.accent)
                Text(title)
                    .physiqueOSFont(PhysiqueOSTypography.uploadingHeading24)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
            }
            HStack(spacing: 8) {
                ForEach(breadcrumbs) { crumb in
                    NavigationLink(value: crumb.destination) {
                        Text(crumb.label)
                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                            .padding(.horizontal, 14)
                            .frame(minHeight: 44)
                            .background(PhysiqueOSTheme.surfaceMuted)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .strokeBorder(PhysiqueOSTheme.divider, lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

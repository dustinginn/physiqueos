import SwiftUI

/// Mirrors `TrainingLibraryHeader`/`TrainingReportingHeader`
/// (`TrainingKnowledgeScreen.jsx:181-220` and the reporting equivalent):
/// a small eyebrow, the page's own title, a breadcrumb pill row, and an
/// optional description line — only the bare Training Library root page
/// and Reporting pages have a description; a bare Training Area page or
/// an exercise-detail page set `summary: null` (`getLibraryContent`/
/// `getExerciseDetailContent`), so `summary` defaults to `nil` for those
/// call sites. `eyebrow` defaults to "Training Library" (every
/// `navigationMode: "training-library"` page); Reporting pages
/// (`navigationMode: "training-reporting"`) pass `"Reporting"` instead —
/// same header shape, different static label, verified from source rather
/// than assumed identical. Shared by `TrainingAreaView`,
/// `TrainingExerciseDetailView`, `TrainingLibraryRootView`, and
/// `TrainingReportingView`.
struct TrainingLibraryHeaderView: View {
    var eyebrow: String = "Training Library"
    let title: String
    let breadcrumbs: [TrainingBreadcrumb]
    var summary: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(eyebrow)
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
            if let summary {
                Text(summary)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

/// Native Log entry points backed by the local logging sandbox. The web
/// keeps universal upload in one card; iOS preserves that hierarchy while
/// giving Photos and Files an explicit, anchored source choice.
struct UploadCardView: View {
    @Environment(AppEnvironment.self) private var environment

    let localDate: String
    var onNavigate: (AppDestination) -> Void = { _ in }

    @State private var isFilePickerPresented = false
    @State private var isPhotosPickerPresented = false
    @State private var photosSelection: [PhotosPickerItem] = []

    private var store: LoggingSandboxStore { environment.loggingSandboxStore }

    var body: some View {
        VStack(spacing: 14) {
            CardContainer(padding: .sm, background: PhysiqueOSTheme.surfaceAccent) {
                Button { onNavigate(.manualWeighIn) } label: {
                    HStack(spacing: 12) {
                        IconBadge(systemImage: "scalemass.fill", color: .primary, size: .md)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Morning Weigh-In")
                                .physiqueOSFont(PhysiqueOSTypography.cardHeading20)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            Text("Log today or choose a historical measurement date.")
                                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        }
                        Spacer(minLength: 4)
                        Image(systemName: "chevron.right")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(PhysiqueOSTheme.accent)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("log.morningWeighIn")
            }

            CardContainer(padding: .sm) {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(spacing: 12) {
                        IconBadge(systemImage: "square.and.arrow.up", color: .primary, size: .md)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Add Evidence")
                                .physiqueOSFont(PhysiqueOSTypography.cardHeading20)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            Text("Add one asset, a batch, or typed details.")
                                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        }
                    }

                    EvidenceSourceMenu { option in
                        prepareDraftDateIfNeeded()
                        switch option {
                        case .photos: isPhotosPickerPresented = true
                        case .files: isFilePickerPresented = true
                        }
                    } label: {
                        Label("Add evidence", systemImage: "doc.badge.plus")
                            .physiqueOSFont(PhysiqueOSTypography.primaryActionLabel)
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity, minHeight: 48)
                            .background(PhysiqueOSTheme.textPrimary)
                            .clipShape(Capsule())
                            .contentShape(Rectangle())
                    }
                    .accessibilityIdentifier("log.addEvidence")

                    Button {
                        prepareDraftDateIfNeeded()
                        onNavigate(.evidenceIntake)
                    } label: {
                        Label("Add details without an asset", systemImage: "text.alignleft")
                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                            .foregroundStyle(PhysiqueOSTheme.accent)
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.plain)

                    if store.evidenceDraft.hasContent {
                        Button { onNavigate(.evidenceIntake) } label: {
                            HStack(spacing: 7) {
                                Image(systemName: "doc.text.fill")
                                Text("Local draft · \(store.evidenceDraft.attachments.count) asset\(store.evidenceDraft.attachments.count == 1 ? "" : "s")")
                                Spacer()
                                Image(systemName: "chevron.right")
                            }
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(PhysiqueOSTheme.accent)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .photosPicker(
            isPresented: $isPhotosPickerPresented,
            selection: $photosSelection,
            matching: .images
        )
        .onChange(of: photosSelection) {
            guard !photosSelection.isEmpty else { return }
            let start = store.evidenceDraft.attachments.filter { $0.source == .photos }.count
            store.addAttachments(photosSelection.indices.map { index in
                .init(
                    id: UUID().uuidString,
                    displayName: "Photo \(start + index + 1)",
                    source: .photos
                )
            })
            photosSelection = []
            onNavigate(.evidenceIntake)
        }
        .fileImporter(
            isPresented: $isFilePickerPresented,
            allowedContentTypes: [.image, .pdf, .plainText],
            allowsMultipleSelection: true
        ) { result in
            guard case .success(let urls) = result, !urls.isEmpty else { return }
            store.addAttachments(urls.map {
                .init(id: UUID().uuidString, displayName: $0.lastPathComponent, source: .files)
            })
            onNavigate(.evidenceIntake)
        }
    }

    private func prepareDraftDateIfNeeded() {
        guard !store.evidenceDraft.hasContent,
              let date = EvidenceDateParsing.date(fromLocalDateString: localDate) else { return }
        store.evidenceDraft.occurrenceDate = date
    }
}

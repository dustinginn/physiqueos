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
            Button { onNavigate(.manualWeighIn) } label: {
                Label("Log weight for another date", systemImage: "calendar.badge.plus")
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(PhysiqueOSTheme.accent)
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.plain)

            CardContainer(padding: .sm) {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(spacing: 12) {
                        IconBadge(systemImage: "square.and.arrow.up", color: .primary, size: .md)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Upload")
                                .physiqueOSFont(PhysiqueOSTypography.cardHeading20)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            Text("Add photos, files, or a note.")
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
                            .background(PhysiqueOSTheme.accent)
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
                                Text("Continue draft · \(store.evidenceDraft.attachments.count) file\(store.evidenceDraft.attachments.count == 1 ? "" : "s")")
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
            let items = photosSelection
            photosSelection = []
            Task { @MainActor in
                let start = store.evidenceDraft.attachments.filter { $0.source == .photos }.count
                store.addAttachments(await EvidenceAttachmentLoader.photos(items, startingAt: start))
                onNavigate(.evidenceIntake)
            }
        }
        .fileImporter(
            isPresented: $isFilePickerPresented,
            allowedContentTypes: [.image, .pdf, .plainText],
            allowsMultipleSelection: true
        ) { result in
            guard case .success(let urls) = result, !urls.isEmpty else { return }
            store.addAttachments(EvidenceAttachmentLoader.files(urls))
            onNavigate(.evidenceIntake)
        }
    }

    private func prepareDraftDateIfNeeded() {
        guard !store.evidenceDraft.hasContent,
              let date = EvidenceDateParsing.date(fromLocalDateString: localDate) else { return }
        store.evidenceDraft.occurrenceDate = date
    }
}

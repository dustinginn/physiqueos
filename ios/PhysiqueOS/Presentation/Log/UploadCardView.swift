import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

/// The locked Log quick actions: dated weight and Add evidence side by side,
/// then Add details without an asset and the Upload caption. Founder
/// Production routes Add evidence straight to intake; the sandbox keeps its
/// anchored Photos / Files source choice.
struct UploadCardView: View {
    @Environment(AppEnvironment.self) private var environment

    let localDate: String
    var onNavigate: (AppDestination) -> Void = { _ in }

    @State private var isFilePickerPresented = false
    @State private var isPhotosPickerPresented = false
    @State private var photosSelection: [PhotosPickerItem] = []
    @State private var isLoadingPhotos = false

    private var store: LoggingSandboxStore { environment.loggingSandboxStore }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 7) {
                Button { onNavigate(.manualWeighIn) } label: {
                    quickAction("Log weight for another date", systemImage: "plus", primary: false)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("log.weightForDate")

                EvidenceSourceMenu { option in
                    if environment.nativeAuthority == .founderProduction {
                        onNavigate(.evidenceIntake)
                        return
                    }
                    prepareDraftDateIfNeeded()
                    switch option {
                    case .photos: isPhotosPickerPresented = true
                    case .files: isFilePickerPresented = true
                    }
                } label: {
                    quickAction("Add evidence", systemImage: "shift", primary: true)
                }
                .accessibilityIdentifier("log.addEvidence")
                .disabled(isLoadingPhotos)
            }

            if isLoadingPhotos {
                HStack(spacing: 8) {
                    ProgressView().controlSize(.small).tint(PhysiqueOSTheme.redesignTeal)
                    Text("Loading selected photos…")
                        .logText(LogType.meta12)
                        .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 8)
            }

            Button {
                prepareDraftDateIfNeeded()
                onNavigate(.evidenceIntake)
            } label: {
                Text("Add details without an asset")
                    .logText(LogType.details)
                    .foregroundStyle(PhysiqueOSTheme.redesignPurple)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("log.detailsWithoutAsset")

            if environment.nativeAuthority == .sandbox, store.evidenceDraft.hasContent {
                Button { onNavigate(.evidenceIntake) } label: {
                    HStack(spacing: 7) {
                        Image(systemName: "doc.text.fill")
                        Text("Continue draft · \(store.evidenceDraft.attachments.count) file\(store.evidenceDraft.attachments.count == 1 ? "" : "s")")
                        Spacer()
                        Image(systemName: "chevron.right")
                    }
                    .logText(LogType.action12)
                    .foregroundStyle(PhysiqueOSTheme.redesignPurple)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }

            Text("Upload · Add photos, files, or a note.")
                .logText(LogType.caption)
                .foregroundStyle(PhysiqueOSTheme.redesignMuted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.top, -4)
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
            isLoadingPhotos = true
            Task { @MainActor in
                let start = store.evidenceDraft.attachments.filter { $0.source == .photos }.count
                store.addAttachments(await EvidenceAttachmentLoader.photos(items, startingAt: start))
                isLoadingPhotos = false
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

    /// One locked quick action: 60 pt minimum, 12 pt radius, hairline border;
    /// the primary evidence action carries the teal intake tint.
    private func quickAction(_ title: String, systemImage: String, primary: Bool) -> some View {
        let shape = RoundedRectangle(cornerRadius: 12, style: .continuous)
        return HStack(spacing: 8) {
            Text(title)
                .logText(LogType.quickAction)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 4)
            Image(systemName: systemImage)
                .font(.system(size: systemImage == "plus" ? 9.5 : 11, weight: .semibold))
                // The locked fullwidth "＋" glyph sits 2 pt in from the edge.
                .padding(.trailing, systemImage == "plus" ? 2 : 0)
                .accessibilityHidden(true)
        }
        .foregroundStyle(PhysiqueOSTheme.redesignInk)
        .padding(10)
        .frame(maxWidth: .infinity, minHeight: 60)
        .background {
            shape.fill(PhysiqueOSTheme.redesignPaper)
            if primary { shape.fill(PhysiqueOSTheme.redesignTeal.opacity(0.15)) }
        }
        .overlay {
            shape.strokeBorder(primary ? PhysiqueOSTheme.redesignTeal.opacity(0.40) : PhysiqueOSTheme.redesignHairline, lineWidth: 1)
        }
        .contentShape(shape)
    }

    private func prepareDraftDateIfNeeded() {
        guard !store.evidenceDraft.hasContent,
              let date = EvidenceDateParsing.date(fromLocalDateString: localDate) else { return }
        store.evidenceDraft.occurrenceDate = date
    }
}

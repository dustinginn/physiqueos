import SwiftUI
import UniformTypeIdentifiers
import PhotosUI

/// Mirrors `UploadAnythingCard`/`UploadAnythingForm.jsx`: a general
/// evidence-upload card (files + a note) with a nested, collapsible direct
/// weigh-in entry. File/note selection and the weigh-in disclosure are
/// real local UI — no server mutation is required to represent them
/// faithfully. Submitting either one is a genuine canonical-write path on
/// the web (`saveDirectWeighIn` calls `MorningCheckInPersistenceService`
/// directly; the general upload creates a pending Evidence Review) that
/// this fixture-only slice has no live command boundary for, so neither
/// button fakes success — both surface an honest status message in the
/// exact slot the web itself uses for `weighInResult`/`weighInError`/`error`.
struct UploadCardView: View {
    let localDate: String

    @State private var selectedDate = Date()
    @State private var noteText = ""
    @State private var selectedAttachments: [EvidenceAttachment] = []
    @State private var isFilePickerPresented = false
    @State private var isPhotosPickerPresented = false
    @State private var photosSelection: [PhotosPickerItem] = []
    @State private var uploadStatusMessage: String?

    @State private var isWeighInExpanded = false
    @State private var weightText = ""
    @State private var weighInStatusMessage: String?

    private var maxSelectableDate: Date {
        EvidenceDateParsing.date(fromLocalDateString: localDate) ?? Date()
    }

    /// The web's "Submit evidence" is disabled only while a real upload is
    /// in flight (`disabled={submitting}`), a state this fixture-only
    /// slice cannot honestly reach. Requiring *something* to submit before
    /// enabling the button is an honest, purely local precondition — no
    /// server contacted, no canonical write implied — that still lets both
    /// the enabled and disabled treatments be verified visually.
    private var hasContentToSubmit: Bool {
        !selectedAttachments.isEmpty || !noteText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        CardContainer(padding: .sm) {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 12) {
                    IconBadge(systemImage: "square.and.arrow.up", color: .primary, size: .md)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Upload")
                            .physiqueOSFont(PhysiqueOSTypography.cardHeading20)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Text("Add one file, several files, or just a note.")
                            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                }

                whenDidThisHappenField
                weighInDisclosure

                filePickerField
                noteField

                if let uploadStatusMessage {
                    StatusBanner(text: uploadStatusMessage, tone: .neutral)
                }

                PrimaryActionButton(
                    title: "Submit evidence",
                    tone: .dark,
                    isEnabled: hasContentToSubmit
                ) {
                    uploadStatusMessage = "Uploading isn't connected to a server in this build yet."
                }
            }
        }
        .onAppear { selectedDate = maxSelectableDate }
        .photosPicker(isPresented: $isPhotosPickerPresented, selection: $photosSelection, matching: .images)
        .onChange(of: photosSelection) {
            let startIndex = selectedAttachments.filter { $0.source == .photoLibrary }.count
            let newPhotos = photosSelection.indices.map { offset in
                EvidenceAttachment(displayName: "Photo \(startIndex + offset + 1)", source: .photoLibrary)
            }
            selectedAttachments.append(contentsOf: newPhotos)
            photosSelection = []
        }
        .fileImporter(
            isPresented: $isFilePickerPresented,
            allowedContentTypes: [.image, .pdf],
            allowsMultipleSelection: true
        ) { result in
            if case .success(let urls) = result {
                selectedAttachments.append(contentsOf: urls.map {
                    EvidenceAttachment(displayName: $0.lastPathComponent, source: .files)
                })
            }
        }
    }

    private var whenDidThisHappenField: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("When did this happen?")
                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Text("Use the date the weigh-in, workout, meal, scan, or activity happened.")
                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
            DateField(date: $selectedDate, maximumDate: maxSelectableDate, label: "Evidence date")
                .onChange(of: selectedDate) {
                    weighInStatusMessage = nil
                }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private var weighInDisclosure: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) { isWeighInExpanded.toggle() }
            } label: {
                HStack(spacing: 12) {
                    IconBadge(systemImage: "scalemass.fill", color: .primary, size: .sm)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Log weigh-in")
                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Text("Record your weight for the selected date.")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                    Spacer(minLength: 4)
                    Image(systemName: isWeighInExpanded ? "minus" : "plus")
                        .font(.system(size: 15, weight: .black))
                        .foregroundStyle(PhysiqueOSTheme.accent)
                }
                .padding(12)
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(.isButton)
            .accessibilityValue(isWeighInExpanded ? "Expanded" : "Collapsed")

            if isWeighInExpanded {
                VStack(alignment: .leading, spacing: 12) {
                    Divider().overlay(PhysiqueOSTheme.divider)
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Weight")
                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        HStack(spacing: 10) {
                            TextField("165.2", text: $weightText)
                                .keyboardType(.decimalPad)
                                .physiqueOSFont(PhysiqueOSTypography.weighInValue18)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                .padding(.horizontal, 12)
                                .frame(height: 44)
                                .background(PhysiqueOSTheme.surfaceElevated)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                                .onChange(of: weightText) { weighInStatusMessage = nil }
                            Text("lb")
                                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        }
                    }
                    Text(Self.friendlyDateFormatter.string(from: selectedDate))
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)

                    if let weighInStatusMessage {
                        StatusBanner(text: weighInStatusMessage, tone: .neutral)
                    }

                    PrimaryActionButton(title: "Save weigh-in", tone: .accent) {
                        weighInStatusMessage = DirectWeighInValidation.validationError(forWeightText: weightText)
                            ?? "Saving a weigh-in isn't connected to a server in this build yet."
                    }
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 12)
            }
        }
        .background(PhysiqueOSTheme.accent.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .strokeBorder(PhysiqueOSTheme.accent.opacity(0.24), lineWidth: 1)
        )
    }

    /// Mirrors the web's "Upload files" drop zone, retitled "Add evidence"
    /// now that native supports both a Photos source and a Files source —
    /// "Upload files" is the web's literal wording for its single merged
    /// file input and undersells what this control now offers. The choice
    /// itself is an `EvidenceSourceMenu`, anchored directly at this card
    /// rather than floating at the bottom of the screen.
    private var filePickerField: some View {
        EvidenceSourceMenu { option in
            switch option {
            case .photos: isPhotosPickerPresented = true
            case .files: isFilePickerPresented = true
            }
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                Label("Add evidence", systemImage: "doc.badge.plus")
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text("Choose photos or files. You can select more than one.")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                if !selectedAttachments.isEmpty {
                    Text(selectedAttachments.map(\.displayName).joined(separator: ", "))
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.accent)
                        .lineLimit(2)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .strokeBorder(PhysiqueOSTheme.divider, style: StrokeStyle(lineWidth: 1, dash: [5]))
            )
            .contentShape(Rectangle())
        }
        .accessibilityAddTraits(.isButton)
    }

    private var noteField: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Add details", systemImage: "note.text")
                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Text("Add any details that help PhysiqueOS understand what you're logging.")
                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
            TextEditor(text: $noteText)
                .physiqueOSFont(PhysiqueOSTypography.body14Regular)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                .scrollContentBackground(.hidden)
                .frame(minHeight: 90)
                .padding(8)
                .background(PhysiqueOSTheme.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .padding(16)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private static let friendlyDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .full
        return formatter
    }()
}

/// A small honesty-first status line — used wherever this fixture-only
/// slice needs to say "this isn't connected yet" instead of pretending an
/// action succeeded.
private struct StatusBanner: View {
    enum Tone { case neutral }
    let text: String
    var tone: Tone = .neutral

    var body: some View {
        Text(text)
            .physiqueOSFont(PhysiqueOSTypography.calloutStrong)
            .foregroundStyle(PhysiqueOSTheme.textSecondary)
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(PhysiqueOSTheme.surfaceMuted)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .accessibilityAddTraits(.isStaticText)
    }
}

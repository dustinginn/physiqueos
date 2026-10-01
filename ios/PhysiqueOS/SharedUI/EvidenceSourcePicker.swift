import SwiftUI

/// The two ways the Founder can add evidence on iOS. The web's single
/// `&lt;input type="file" accept="image/*,application/pdf,.pdf"&gt;`
/// (`LogHubScreen.jsx`) relies on the browser to merge photo-library access
/// and document browsing into one native file-picker sheet — iOS has no
/// equivalent single control, so this is a deliberate, product-approved
/// native split rather than a fidelity gap: choosing lets the Founder reach
/// the privacy-preserving Photos picker (`PhotosPicker`/`PHPicker`, no
/// library-access prompt) for photos, or the document picker for PDFs and
/// other files, instead of a document picker opening immediately and never
/// offering Photos at all (the bug this replaces).
enum EvidenceSourceOption: CaseIterable, Equatable {
    case photos
    case files
}

/// A shared, contextually-anchored evidence-source chooser. Reusable
/// wherever a screen needs to ask "Choose Photos or Choose Files" — not
/// one-off to Log's Upload card, so Nutrition, Photos, and DEXA intake can
/// adopt it later without rebuilding the choice.
///
/// Built on `Menu` rather than `.confirmationDialog`: a `confirmationDialog`
/// is always OS-anchored to the bottom of the screen regardless of where
/// its trigger sits, which is exactly the reported bug — on a screen where
/// the "Add evidence" card isn't near the bottom, the choice appears to
/// float over unrelated content. `Menu` presents its options anchored at
/// the triggering control itself (the standard iOS contextual-menu
/// placement, not the iPad-style global popover `.popover(...)` would
/// default to on a compact size class without explicit compact
/// adaptation), so the choice now appears at/over the "Add evidence"
/// surface that triggered it.
struct EvidenceSourceMenu<TriggerLabel: View>: View {
    let onSelect: (EvidenceSourceOption) -> Void
    var triggerLabel: TriggerLabel

    init(onSelect: @escaping (EvidenceSourceOption) -> Void, @ViewBuilder label: () -> TriggerLabel) {
        self.onSelect = onSelect
        self.triggerLabel = label()
    }

    var body: some View {
        Menu {
            Button {
                onSelect(.photos)
            } label: {
                Label("Choose Photos", systemImage: "photo.on.rectangle")
            }
            Button {
                onSelect(.files)
            } label: {
                Label("Choose Files", systemImage: "folder")
            }
        } label: {
            triggerLabel
        }
        .menuOrder(.fixed)
    }
}

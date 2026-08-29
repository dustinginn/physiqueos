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
enum EvidenceSourceOption {
    case photos
    case files
}

/// A shared confirmation-dialog trigger for choosing an evidence source.
/// Reusable wherever a screen needs to ask "Choose Photos or Choose Files"
/// before opening the platform-appropriate picker — not one-off to Log's
/// Upload card, so Nutrition, Photos, and DEXA intake can adopt it later
/// without rebuilding the choice.
struct EvidenceSourcePicker: ViewModifier {
    @Binding var isPresented: Bool
    let onSelect: (EvidenceSourceOption) -> Void

    func body(content: Content) -> some View {
        content.confirmationDialog("Add evidence", isPresented: $isPresented, titleVisibility: .visible) {
            Button("Choose Photos") { onSelect(.photos) }
            Button("Choose Files") { onSelect(.files) }
            Button("Cancel", role: .cancel) {}
        }
    }
}

extension View {
    /// Presents the shared "Choose Photos" / "Choose Files" evidence-source
    /// choice. The caller is responsible for presenting the corresponding
    /// picker (`PhotosPicker` or `.fileImporter`) from `onSelect`.
    func evidenceSourcePicker(
        isPresented: Binding<Bool>,
        onSelect: @escaping (EvidenceSourceOption) -> Void
    ) -> some View {
        modifier(EvidenceSourcePicker(isPresented: isPresented, onSelect: onSelect))
    }
}

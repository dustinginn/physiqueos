import Foundation

/// A locally selected piece of evidence — a photo picked from the Photos
/// library or a file picked from the Files/document picker. Shared across
/// any screen that lets the Founder attach evidence (Log's Upload card
/// today; Nutrition, Photos, and DEXA intake are the named future callers
/// this primitive exists for).
///
/// This is deliberately not a canonical evidence model: it only describes
/// what is staged locally in this session. Nothing here implies the item
/// has been uploaded, reviewed, or confirmed — that boundary is owned by
/// the server (see `docs/PHYSIQUEOS_NATIVE_V1.md`, section 8, "Evidence
/// ingestion model").
struct EvidenceAttachment: Identifiable, Equatable {
    enum Source: Equatable {
        case photoLibrary
        case files
    }

    let id = UUID()
    var displayName: String
    var source: Source
}

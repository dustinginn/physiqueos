import Foundation

/// Mirrors the exact client-facing validation message the real "Add /
/// Correct Workout Details" flow shows before it ever reaches the server
/// (`getCorrectionStatusMessage`'s `"missing-details"` case,
/// `src/screens/TrainingKnowledgeScreen.jsx:896-926`) — same copy as the
/// web app. This is input-sanity messaging, not a domain decision: a live
/// correction command still re-validates and commits authoritatively once
/// one exists; this only keeps the native field's error text consistent
/// with what the Founder already sees on the web today.
enum TrainingSessionCorrectionValidation {
    /// Returns a validation message if `text` has no workout details to
    /// save, or `nil` if it does.
    static func validationError(forText text: String) -> String? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "Add workout details before saving." : nil
    }
}

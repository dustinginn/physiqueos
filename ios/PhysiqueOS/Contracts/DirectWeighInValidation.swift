import Foundation

/// Mirrors the exact client-facing validation messages from
/// `saveDirectWeighIn` (`src/app/log/actions.js`) — same copy, same
/// bounds (50–1000 lb). This is input-sanity messaging, not a domain
/// decision: the server still re-validates authoritatively once a live
/// command exists; this only keeps the native field's error text
/// consistent with what the Founder already sees on the web today.
enum DirectWeighInValidation {
    /// Returns a validation message if `text` is not an acceptable
    /// weigh-in weight, or `nil` if it is.
    static func validationError(forWeightText text: String) -> String? {
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty, let parsed = Double(trimmed), parsed.isFinite else {
            return "Enter a valid weight."
        }
        let rounded = (parsed * 10).rounded() / 10
        if rounded < 50 || rounded > 1000 {
            return "Weight must be between 50 and 1,000 lb."
        }
        return nil
    }
}

import Foundation

/// Filters internal/raw identifiers out of a `sourceEvidence` list before
/// it reaches Founder-facing prose. The server's own label formatter
/// (`formatSourceArtifactLabel`) humanizes recognized artifact patterns
/// (screenshots, typed evidence) but falls back to the raw
/// `source_artifact_ref` value verbatim for anything it doesn't recognize
/// — which can be an internal Training Logger draft-session identifier
/// (a UUID) rather than a real, presentable evidence source. Native never
/// invents a friendlier label for these; it simply omits what it cannot
/// present cleanly, per this app's boundary between internal identity and
/// user-facing text.
enum TrainingSourceEvidencePresentation {
    static func filtered(_ sources: [String]) -> [String] {
        sources.filter { !containsRawIdentifier($0) }
    }

    private static func containsRawIdentifier(_ value: String) -> Bool {
        value.range(
            of: #"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"#,
            options: .regularExpression
        ) != nil
    }
}

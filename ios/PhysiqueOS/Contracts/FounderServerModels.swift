import Foundation

/// The deliberately narrow transport contracts for the first authenticated
/// Native/server bridge. These mirror `/api/v1/native/**`; they are not
/// projections of the app's fixture models and do not become local authority.
struct FounderServerSession: Decodable, Sendable, Equatable {
    let sessionId: String
    let accessToken: String
    let accessExpiresAt: String
    let refreshCredential: String
    let refreshIdleExpiresAt: String
    let refreshAbsoluteExpiresAt: String?
}

struct FounderWeightSummary: Decodable, Sendable, Equatable {
    let schemaVersion: String
    let currentWeight: CurrentWeight?

    struct CurrentWeight: Decodable, Sendable, Equatable {
        let id: String
        let value: Double
        let unit: String
        /// A server-owned calendar date (`YYYY-MM-DD`), intentionally kept as
        /// a string so Pacific time can never shift it to an adjacent day.
        let measurementDate: String
    }
}

struct FounderWeightReadResult: Sendable, Equatable {
    let summary: FounderWeightSummary
    let requestDurationMilliseconds: Int
}

/// Candidate-only transport for the server sandbox. Native's Vision/OCR
/// result remains noncanonical until the server validates the original asset
/// and stages a server-owned Evidence Review.
struct NativeSandboxWeightCandidate: Encodable, Sendable, Equatable {
    let submissionIdentity: String
    let idempotencyKey: String
    let candidateType: String
    let measurementDate: String
    let value: Double
    let unit: String
    let confidence: Double
    let localParserVersion: String
    let assetSha256: String
    let founderContext: String?
    let fieldProvenance: FieldProvenance

    struct FieldProvenance: Encodable, Sendable, Equatable {
        let value: ValueProvenance
    }

    struct ValueProvenance: Encodable, Sendable, Equatable {
        let source: String
        let regions: [Region]
    }

    struct Region: Encodable, Sendable, Equatable {
        let page: Int
        let text: String
    }
}

struct NativeSandboxWeightReview: Decodable, Sendable, Equatable {
    let id: String
    let status: String
    let version: Int
    let occurrenceDate: String
    let candidate: Candidate

    struct Candidate: Decodable, Sendable, Equatable {
        let value: Double
        let unit: String
        let confidence: Double
        let disposition: String
    }
}

struct FounderServerProblem: Decodable, Sendable, Equatable {
    let status: Int
    let code: String
    let title: String
    let detail: String?
}

enum FounderServerError: Error, Sendable, Equatable, LocalizedError {
    case notPaired
    case accessTokenExpired
    case refreshFailed
    case deviceOrSessionRevoked
    case unauthorizedScope
    case serverUnavailable
    case networkFailure
    case invalidResponse
    case serverProblem(code: String, message: String)

    var errorDescription: String? {
        switch self {
        case .notPaired: "Connect this iPhone before loading live data."
        case .accessTokenExpired: "The secure session expired. Reconnect this iPhone."
        case .refreshFailed: "The secure session could not be refreshed. Reconnect this iPhone."
        case .deviceOrSessionRevoked: "Access for this iPhone has been revoked."
        case .unauthorizedScope: "This device is not authorized to read Weight."
        case .serverUnavailable: "PhysiqueOS is temporarily unavailable."
        case .networkFailure: "The server could not be reached. Check the connection and try again."
        case .invalidResponse: "PhysiqueOS returned an unreadable response."
        case .serverProblem(_, let message): message
        }
    }
}

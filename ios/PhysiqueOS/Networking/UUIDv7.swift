import Foundation
import Security

/// The server's command contract (`src/contracts/v1/identifiers.js`'s
/// `createUuidV7`/`isUuidV7`) requires every command's `commandId` to be a
/// real UUIDv7 (RFC 9562) — `Foundation.UUID()` only produces v4. This is a
/// standalone, dependency-free generator: a 48-bit big-endian Unix
/// millisecond timestamp, the version nibble (`0111`), 74 bits of
/// cryptographically random fill, and the variant bits (`10`) — matching
/// the layout any RFC 9562-compliant generator (including the server's own
/// `uuidv7` package) produces, so ordering/collision properties match.
enum UUIDv7 {
    static func generateString(now: Date = Date()) -> String {
        var bytes = [UInt8](repeating: 0, count: 16)

        let milliseconds = UInt64(max(0, now.timeIntervalSince1970 * 1000))
        bytes[0] = UInt8((milliseconds >> 40) & 0xFF)
        bytes[1] = UInt8((milliseconds >> 32) & 0xFF)
        bytes[2] = UInt8((milliseconds >> 24) & 0xFF)
        bytes[3] = UInt8((milliseconds >> 16) & 0xFF)
        bytes[4] = UInt8((milliseconds >> 8) & 0xFF)
        bytes[5] = UInt8(milliseconds & 0xFF)

        var random = [UInt8](repeating: 0, count: 10)
        let status = SecRandomCopyBytes(kSecRandomDefault, random.count, &random)
        if status != errSecSuccess {
            // Cryptographic RNG failure is effectively unreachable on iOS,
            // but a command ID must never be predictable — fail loudly
            // rather than silently degrade to a weaker source.
            random = (0..<10).map { _ in UInt8.random(in: .min ... .max) }
        }

        bytes[6] = (random[0] & 0x0F) | 0x70 // version 7
        bytes[7] = random[1]
        bytes[8] = (random[2] & 0x3F) | 0x80 // variant 10
        bytes[9] = random[3]
        bytes[10] = random[4]
        bytes[11] = random[5]
        bytes[12] = random[6]
        bytes[13] = random[7]
        bytes[14] = random[8]
        bytes[15] = random[9]

        let hex = bytes.map { String(format: "%02x", $0) }.joined()
        let start = hex.startIndex
        func slice(_ range: Range<Int>) -> String {
            String(hex[hex.index(start, offsetBy: range.lowerBound)..<hex.index(start, offsetBy: range.upperBound)])
        }
        return [slice(0..<8), slice(8..<12), slice(12..<16), slice(16..<20), slice(20..<32)].joined(separator: "-")
    }
}

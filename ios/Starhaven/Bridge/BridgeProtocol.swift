import Foundation

public enum StarhavenJSONValue: Codable, Equatable, Sendable {
    case object([String: StarhavenJSONValue])
    case array([StarhavenJSONValue])
    case string(String)
    case number(Double)
    case boolean(Bool)
    case null

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode([String: StarhavenJSONValue].self) {
            self = .object(value)
        } else if let value = try? container.decode([StarhavenJSONValue].self) {
            self = .array(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode(Bool.self) {
            self = .boolean(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else {
            throw StarhavenBridgeError.invalidPayload
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .object(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .boolean(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }

    public var stringValue: String? {
        guard case .string(let value) = self else { return nil }
        return value
    }

    public var objectValue: [String: StarhavenJSONValue]? {
        guard case .object(let value) = self else { return nil }
        return value
    }

    public var anyValue: Any {
        switch self {
        case .object(let value): value.mapValues(\.anyValue)
        case .array(let value): value.map(\.anyValue)
        case .string(let value): value
        case .number(let value): value
        case .boolean(let value): value
        case .null: NSNull()
        }
    }

    public static func object(_ values: [String: String]) -> StarhavenJSONValue {
        .object(values.mapValues(StarhavenJSONValue.string))
    }
}

public struct StarhavenEnvelope: Codable, Equatable, Sendable {
    public let version: Int
    public let id: String
    public let sequence: Int
    public let source: String
    public let type: String
    public let matchId: String?
    public let payload: StarhavenJSONValue

    public init(version: Int = StarhavenProtocol.version, id: String, sequence: Int, source: String, type: String, matchId: String? = nil, payload: StarhavenJSONValue) {
        self.version = version
        self.id = id
        self.sequence = sequence
        self.source = source
        self.type = type
        self.matchId = matchId
        self.payload = payload
    }
}

public enum StarhavenBridgeError: Error, Equatable, LocalizedError {
    case invalidJSON
    case invalidEnvelope
    case invalidPayload
    case versionMismatch
    case sourceMismatch
    case typeNotAllowed
    case missingMessageID
    case invalidSequence

    public var errorDescription: String? {
        switch self {
        case .invalidJSON: "Bridge message is not valid JSON."
        case .invalidEnvelope: "Bridge message is not an object."
        case .invalidPayload: "Bridge payload is not valid JSON."
        case .versionMismatch: "Bridge protocol version mismatch."
        case .sourceMismatch: "Bridge message source mismatch."
        case .typeNotAllowed: "Bridge message type is not allowed."
        case .missingMessageID: "Bridge message ID is required."
        case .invalidSequence: "Bridge sequence is invalid."
        }
    }
}

public enum StarhavenBridgeCodec {
    public static func decode(_ data: Data, expectedSource: String) throws -> StarhavenEnvelope {
        let decoder = JSONDecoder()
        let message: StarhavenEnvelope
        do {
            message = try decoder.decode(StarhavenEnvelope.self, from: data)
        } catch {
            throw StarhavenBridgeError.invalidJSON
        }
        guard message.version == StarhavenProtocol.version else { throw StarhavenBridgeError.versionMismatch }
        guard !message.id.isEmpty else { throw StarhavenBridgeError.missingMessageID }
        guard message.sequence >= 0 else { throw StarhavenBridgeError.invalidSequence }
        guard message.source == expectedSource else { throw StarhavenBridgeError.sourceMismatch }
        let allowed = expectedSource == "native" ? StarhavenProtocol.nativeToGameTypes : StarhavenProtocol.gameToNativeTypes
        guard allowed.contains(message.type) else { throw StarhavenBridgeError.typeNotAllowed }
        return message
    }

    public static func encode(_ message: StarhavenEnvelope) throws -> Data {
        try JSONEncoder().encode(message)
    }
}

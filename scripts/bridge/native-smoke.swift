import Foundation

@main
struct StarhavenNativeSmoke {
    static func main() throws {
        let arguments = CommandLine.arguments
        guard arguments.count >= 2 else { throw SmokeError.missingRoot }
        let root = URL(fileURLWithPath: arguments[1], isDirectory: true)
        let router = StarhavenSchemeRouter(rootURL: root)
        let native = StarhavenEnvelope(id: "native-0", sequence: 0, source: "native", type: "host.ready", payload: .object(["build": .string("test")]))
        let encoded = try StarhavenBridgeCodec.encode(native)
        let decoded = try StarhavenBridgeCodec.decode(encoded, expectedSource: "native")
        guard decoded == native else { throw SmokeError.bridgeRoundTrip }

        let checks: [(String, StarhavenSchemeResponse, Bool)] = [
            ("GET index", router.response(for: URL(string: "starhaven://app/index.html")!, method: "GET"), true),
            ("HEAD index", router.response(for: URL(string: "starhaven://app/index.html")!, method: "HEAD"), true),
            ("POST rejected", router.response(for: URL(string: "starhaven://app/index.html")!, method: "POST"), false),
            ("Traversal rejected", router.response(for: URL(string: "starhaven://app/%2e%2e/index.html")!, method: "GET"), false),
            ("Encoded separator rejected", router.response(for: URL(string: "starhaven://app/game-assets/%2Findex.html")!, method: "GET"), false),
            ("Missing rejected", router.response(for: URL(string: "starhaven://app/missing.json")!, method: "GET"), false),
            ("Other host rejected", router.response(for: URL(string: "starhaven://other/index.html")!, method: "GET"), false),
        ]
        guard checks[0].1.statusCode == 200, checks[0].1.mimeType == "text/html; charset=utf-8", !checks[0].1.body.isEmpty else { throw SmokeError.getFailed }
        guard checks[1].1.statusCode == 200, checks[1].1.body.isEmpty, checks[1].1.headers["Content-Length"] == String(checks[0].1.body.count) else { throw SmokeError.headFailed }
        guard checks[2].1.statusCode == 405, checks[2].1.headers["Allow"] == "GET, HEAD" else { throw SmokeError.methodFailed }
        guard checks[3].1.statusCode == 403, checks[4].1.statusCode == 403, checks[5].1.statusCode == 404, checks[6].1.statusCode == 403 else { throw SmokeError.rejectionFailed }
        guard StarhavenNavigationPolicy.allows(URL(string: "starhaven://app/index.html")!), !StarhavenNavigationPolicy.allows(URL(string: "https://example.com/")), !StarhavenNavigationPolicy.allows(URL(string: "file:///index.html")) else { throw SmokeError.navigationFailed }

        let result: [String: Any] = [
            "schema": 1,
            "bridgeRoundTrip": true,
            "schemeHandler": checks.map { ["name": $0.0, "status": $0.1.statusCode, "passed": $0.2 || $0.1.statusCode >= 400] },
            "navigation": ["privateOriginAllowed": true, "crossOriginBlocked": true, "fileFallbackBlocked": true],
            "methods": ["GET": 200, "HEAD": 200, "POST": 405],
            "traversal": ["encodedDotSegment": 403, "encodedSeparator": 403],
            "valid": true,
        ]
        let data = try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys])
        if arguments.count >= 3 {
            try data.write(to: URL(fileURLWithPath: arguments[2]))
        } else {
            print(String(decoding: data, as: UTF8.self))
        }
    }
}

enum SmokeError: Error {
    case missingRoot
    case bridgeRoundTrip
    case getFailed
    case headFailed
    case methodFailed
    case rejectionFailed
    case navigationFailed
}

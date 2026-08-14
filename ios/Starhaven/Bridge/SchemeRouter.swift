import Foundation

public struct StarhavenSchemeResponse: Equatable, Sendable {
    public let statusCode: Int
    public let mimeType: String
    public let headers: [String: String]
    public let body: Data

    public init(statusCode: Int, mimeType: String, headers: [String: String], body: Data) {
        self.statusCode = statusCode
        self.mimeType = mimeType
        self.headers = headers
        self.body = body
    }
}

public final class StarhavenSchemeRouter: @unchecked Sendable {
    private let rootURL: URL
    private let fileManager: FileManager
    private var memoryFiles: [String: Data] = [:]

    public init(rootURL: URL, fileManager: FileManager = .default) {
        self.rootURL = rootURL.standardizedFileURL.resolvingSymlinksInPath()
        self.fileManager = fileManager
        preloadMemory()
    }

    public func preloadMemory() {
        var files: [String: Data] = [:]
        let manifestURL = rootURL.appending(path: "dist-hashes.json")
        if let manifestData = try? Data(contentsOf: manifestURL),
           let manifest = try? JSONDecoder().decode(StarhavenPackManifest.self, from: manifestData) {
            files["dist-hashes.json"] = manifestData
            for file in manifest.files {
                guard StarhavenPackVerifier.isSafeRelativePath(file.path) else { continue }
                if let data = try? Data(contentsOf: rootURL.appending(path: file.path)) {
                    files[file.path] = data
                }
            }
        }
        if let build = try? Data(contentsOf: rootURL.appending(path: "build-info.json")) {
            files["build-info.json"] = build
        }
        if files["index.html"] == nil, let index = try? Data(contentsOf: rootURL.appending(path: "index.html")) {
            files["index.html"] = index
        }
        memoryFiles = files
    }

    public func response(for url: URL?, method: String) -> StarhavenSchemeResponse {
        let requestMethod = method.uppercased()
        guard requestMethod == "GET" || requestMethod == "HEAD" else {
            return response(statusCode: 405, mimeType: "text/plain; charset=utf-8", body: Data("Method Not Allowed".utf8), headers: ["Allow": "GET, HEAD"])
        }
        guard let url, url.scheme == "starhaven", url.host == "app", url.user == nil, url.port == nil else {
            return response(statusCode: 403, mimeType: "text/plain; charset=utf-8", body: Data("Forbidden".utf8))
        }

        guard let decodedPath = decodedSafePath(encodedPath(for: url)) else {
            return response(statusCode: 403, mimeType: "text/plain; charset=utf-8", body: Data("Forbidden".utf8))
        }
        let relativePath = decodedPath == "/" ? "index.html" : String(decodedPath.dropFirst())
        let fileURL = rootURL.appending(path: relativePath).standardizedFileURL
        let rootPath = rootURL.path.hasSuffix("/") ? rootURL.path : rootURL.path + "/"
        guard fileURL.path == rootURL.path || fileURL.path.hasPrefix(rootPath) else {
            return response(statusCode: 403, mimeType: "text/plain; charset=utf-8", body: Data("Forbidden".utf8))
        }
        guard !containsSymbolicLink(relativePath) else {
            return response(statusCode: 403, mimeType: "text/plain; charset=utf-8", body: Data("Forbidden".utf8))
        }
        let extensionName = fileURL.pathExtension.lowercased()
        guard let mimeType = Self.mimeTypes[extensionName] else {
            return response(statusCode: 415, mimeType: "text/plain; charset=utf-8", body: Data("Unsupported Media Type".utf8))
        }
        let body: Data
        if let cached = memoryFiles[relativePath] {
            body = cached
        } else {
            guard fileManager.fileExists(atPath: fileURL.path), let attributes = try? fileManager.attributesOfItem(atPath: fileURL.path), let type = attributes[FileAttributeKey.type] as? FileAttributeType, type == .typeRegular else {
                return response(statusCode: 404, mimeType: "text/plain; charset=utf-8", body: Data("Not Found".utf8))
            }
            guard let fileBody = try? Data(contentsOf: fileURL) else {
                return response(statusCode: 404, mimeType: "text/plain; charset=utf-8", body: Data("Not Found".utf8))
            }
            body = fileBody
        }
        let headers = [
            "Content-Type": mimeType,
            "Content-Length": String(body.count),
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": StarhavenContentSecurityPolicy.release,
        ]
        return StarhavenSchemeResponse(statusCode: 200, mimeType: mimeType, headers: headers, body: requestMethod == "HEAD" ? Data() : body)
    }

    private func decodedSafePath(_ encodedPath: String) -> String? {
        let lower = encodedPath.lowercased()
        guard !lower.contains("%2f"), !lower.contains("%5c"), !lower.contains("%00"), let decoded = encodedPath.removingPercentEncoding else { return nil }
        guard decoded.hasPrefix("/"), !decoded.contains("\\"), !decoded.contains("\0"), decoded.unicodeScalars.allSatisfy({ $0.value < 128 }) else { return nil }
        let components = decoded.split(separator: "/", omittingEmptySubsequences: false).dropFirst()
        guard !components.contains(where: { $0.isEmpty || $0 == "." || $0 == ".." }) else { return nil }
        return decoded
    }

    private func containsSymbolicLink(_ relativePath: String) -> Bool {
        var current = rootURL
        for component in relativePath.split(separator: "/") {
            current.append(path: String(component))
            guard let attributes = try? fileManager.attributesOfItem(atPath: current.path), let type = attributes[FileAttributeKey.type] as? FileAttributeType else { return false }
            if type == .typeSymbolicLink { return true }
        }
        return false
    }

    private func encodedPath(for url: URL) -> String {
        let absolute = url.absoluteString
        guard let schemeEnd = absolute.range(of: "://"), let pathStart = absolute[schemeEnd.upperBound...].firstIndex(of: "/") else {
            return url.path
        }
        let pathAndQuery = absolute[pathStart...]
        return String(pathAndQuery.prefix { $0 != "?" && $0 != "#" })
    }

    private func response(statusCode: Int, mimeType: String, body: Data, headers: [String: String] = [:]) -> StarhavenSchemeResponse {
        StarhavenSchemeResponse(statusCode: statusCode, mimeType: mimeType, headers: ["Content-Length": String(body.count), "X-Content-Type-Options": "nosniff"].merging(headers) { _, new in new }, body: body)
    }

    private static let mimeTypes: [String: String] = [
        "html": "text/html; charset=utf-8",
        "js": "application/javascript; charset=utf-8",
        "mjs": "application/javascript; charset=utf-8",
        "css": "text/css; charset=utf-8",
        "json": "application/json; charset=utf-8",
        "map": "application/json; charset=utf-8",
        "png": "image/png",
        "svg": "image/svg+xml",
        "wav": "audio/wav",
        "ico": "image/x-icon",
        "webmanifest": "application/manifest+json",
    ]
}

public enum StarhavenContentSecurityPolicy {
    public static let release = "default-src 'self'; base-uri 'none'; object-src 'none'; frame-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self'; connect-src 'self'; font-src 'none'; worker-src 'none'; form-action 'none'"
}

public enum StarhavenNavigationPolicy {
    public static func allows(_ url: URL?) -> Bool {
        guard let url, url.scheme == "starhaven", url.host == "app", url.user == nil, url.port == nil else { return false }
        return url.path.hasPrefix("/")
    }
}

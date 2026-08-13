import CryptoKit
import Foundation

public enum StarhavenPackChannel: String, CaseIterable, Identifiable, Sendable {
    case production
    case development

    public var id: String { rawValue }

    public var origin: URL {
        switch self {
        case .production: StarhavenRemoteOrigin.production
        case .development: StarhavenRemoteOrigin.development
        }
    }

    public var hostLabel: String {
        origin.host ?? rawValue
    }

    public var title: String {
        switch self {
        case .production: "Production"
        case .development: "Dev"
        }
    }

    public static var defaultChannel: StarhavenPackChannel {
        #if DEBUG
        .development
        #else
        .production
        #endif
    }
}

public enum StarhavenRemoteOrigin {
    public static let production = URL(string: "https://starhaven.contenthelper.in")!
    public static let development = URL(string: "https://dev.starhaven.contenthelper.in")!
    public static let origin = StarhavenPackChannel.defaultChannel.origin
}

public struct StarhavenCacheProgress: Equatable, Sendable {
    public var fraction: Double
    public var detail: String

    public init(fraction: Double, detail: String) {
        self.fraction = min(1, max(0, fraction))
        self.detail = detail
    }
}

public struct StarhavenPackFile: Decodable, Equatable, Sendable {
    public let path: String
    public let bytes: Int
    public let sha256: String
}

public struct StarhavenPackManifest: Decodable, Equatable, Sendable {
    public let schema: Int
    public let files: [StarhavenPackFile]
}

public struct StarhavenBuildInfo: Decodable, Equatable, Sendable {
    public let sourceSha: String
    public let displaySha: String
    public let distManifestSha256: String
}

public enum StarhavenPackVerifier {
    public static func sha256Hex(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    public static func isSafeRelativePath(_ path: String) -> Bool {
        guard !path.isEmpty, !path.hasPrefix("/"), !path.contains("\\"), !path.contains("\0") else { return false }
        let parts = path.split(separator: "/", omittingEmptySubsequences: false)
        guard !parts.contains(where: { $0.isEmpty || $0 == "." || $0 == ".." }) else { return false }
        return path.unicodeScalars.allSatisfy { scalar in
            CharacterSet.alphanumerics.contains(scalar) || scalar == "." || scalar == "-" || scalar == "_" || scalar == "/"
        }
    }

    public static func verify(data: Data, expectedBytes: Int, expectedSHA256: String) -> Bool {
        data.count == expectedBytes && sha256Hex(data) == expectedSHA256.lowercased()
    }
}

public actor StarhavenGameCache {
    public static let shared = StarhavenGameCache()

    private var origin: URL
    private let fileManager: FileManager
    private let session: URLSession
    private let cacheBase: URL

    public init(
        origin: URL = StarhavenRemoteOrigin.origin,
        fileManager: FileManager = .default,
        session: URLSession = .shared,
        cacheRoot: URL? = nil
    ) {
        self.origin = origin
        self.fileManager = fileManager
        self.session = session
        if let cacheRoot {
            self.cacheBase = cacheRoot
        } else {
            let support = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
                ?? fileManager.temporaryDirectory
            self.cacheBase = support.appending(path: "Starhaven/GameCache", directoryHint: .isDirectory)
        }
    }

    public func setOrigin(_ origin: URL) {
        self.origin = origin
    }

    private var cacheRoot: URL {
        let host = origin.host?.replacingOccurrences(of: ":", with: "_") ?? "default"
        return cacheBase.appending(path: host, directoryHint: .isDirectory)
    }

    public func remoteBuildInfo() async throws -> StarhavenBuildInfo {
        try await fetchBuildInfo()
    }

    public func installedSourceSha() -> String? {
        currentSourceSha()
    }

    public func prepare(
        bundledRoot: URL?,
        progress: @escaping @Sendable (StarhavenCacheProgress) -> Void
    ) async throws -> URL {
        try fileManager.createDirectory(at: cacheRoot, withIntermediateDirectories: true)
        progress(StarhavenCacheProgress(fraction: 0.02, detail: "Checking the frontier pack…"))
        if let remote = try? await fetchBuildInfo() {
            if let current = currentPackURL(), currentSourceSha() == remote.sourceSha {
                progress(StarhavenCacheProgress(fraction: 1, detail: "Cached pack ready"))
                return current
            }
            progress(StarhavenCacheProgress(fraction: 0.08, detail: "Downloading Starhaven pack…"))
            let installed = try await downloadPack(build: remote, progress: progress)
            progress(StarhavenCacheProgress(fraction: 1, detail: "Pack cached"))
            return installed
        }
        if let current = currentPackURL() {
            progress(StarhavenCacheProgress(fraction: 1, detail: "Using cached pack offline"))
            return current
        }
        if let bundledRoot, fileManager.fileExists(atPath: bundledRoot.appending(path: "index.html").path) {
            progress(StarhavenCacheProgress(fraction: 1, detail: "Using bundled pack"))
            return bundledRoot
        }
        throw StarhavenCacheError.unavailable
    }

    private func fetch(_ path: String) async throws -> Data {
        var request = URLRequest(url: origin.appending(path: path))
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 60
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200 ... 299).contains(http.statusCode) else {
            throw StarhavenCacheError.unavailable
        }
        return data
    }

    private func fetchBuildInfo() async throws -> StarhavenBuildInfo {
        try JSONDecoder().decode(StarhavenBuildInfo.self, from: try await fetch("build-info.json"))
    }

    private func downloadPack(build: StarhavenBuildInfo, progress: @escaping @Sendable (StarhavenCacheProgress) -> Void) async throws -> URL {
        let manifestData = try await fetch("dist-hashes.json")
        guard StarhavenPackVerifier.sha256Hex(manifestData) == build.distManifestSha256.lowercased() else {
            throw StarhavenCacheError.hashMismatch
        }
        let manifest = try JSONDecoder().decode(StarhavenPackManifest.self, from: manifestData)
        let incoming = cacheRoot.appending(path: "incoming-\(UUID().uuidString)", directoryHint: .isDirectory)
        try fileManager.createDirectory(at: incoming, withIntermediateDirectories: true)
        try manifestData.write(to: incoming.appending(path: "dist-hashes.json"), options: .atomic)
        let buildData = try await fetch("build-info.json")
        try buildData.write(to: incoming.appending(path: "build-info.json"), options: .atomic)

        let extra = 2
        let total = Double(manifest.files.count + extra)
        var completed = 2.0
        for file in manifest.files {
            guard StarhavenPackVerifier.isSafeRelativePath(file.path) else { throw StarhavenCacheError.unsafePath }
            let destination = incoming.appending(path: file.path)
            try fileManager.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
            let (data, response) = try await session.data(from: origin.appending(path: file.path))
            guard let fileHTTP = response as? HTTPURLResponse, (200 ... 299).contains(fileHTTP.statusCode) else {
                throw StarhavenCacheError.unavailable
            }
            guard StarhavenPackVerifier.verify(data: data, expectedBytes: file.bytes, expectedSHA256: file.sha256) else {
                throw StarhavenCacheError.hashMismatch
            }
            try data.write(to: destination, options: .atomic)
            completed += 1
            progress(StarhavenCacheProgress(fraction: 0.08 + 0.9 * (completed / total), detail: "Caching \(file.path)"))
        }

        let packURL = cacheRoot.appending(path: "packs/\(build.sourceSha)", directoryHint: .isDirectory)
        try? fileManager.removeItem(at: packURL)
        try fileManager.createDirectory(at: packURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try fileManager.moveItem(at: incoming, to: packURL)
        try build.sourceSha.write(to: cacheRoot.appending(path: "current"), atomically: true, encoding: .utf8)
        return packURL
    }

    private func currentSourceSha() -> String? {
        guard let text = try? String(contentsOf: cacheRoot.appending(path: "current"), encoding: .utf8) else { return nil }
        return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func currentPackURL() -> URL? {
        guard let sha = currentSourceSha() else { return nil }
        let url = cacheRoot.appending(path: "packs/\(sha)", directoryHint: .isDirectory)
        guard fileManager.fileExists(atPath: url.appending(path: "index.html").path) else { return nil }
        return url
    }
}

public enum StarhavenCacheError: Error {
    case unavailable
    case hashMismatch
    case unsafePath
}

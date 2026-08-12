import Foundation

public struct StarhavenSavedSnapshot: Codable, Equatable, Sendable {
    public let tick: Int
    public let checksum: String
    public let seed: UInt32
    public let paused: Bool

    public init(tick: Int, checksum: String, seed: UInt32, paused: Bool) {
        self.tick = tick
        self.checksum = checksum
        self.seed = seed
        self.paused = paused
    }
}

public final class StarhavenSnapshotStore: @unchecked Sendable {
    private let defaults: UserDefaults
    private let key = "starhaven.saved.snapshot.v1"

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    public func save(_ snapshot: StarhavenSavedSnapshot) throws {
        defaults.set(try JSONEncoder().encode(snapshot), forKey: key)
    }

    public func load() -> StarhavenSavedSnapshot? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(StarhavenSavedSnapshot.self, from: data)
    }

    public func clear() {
        defaults.removeObject(forKey: key)
    }
}

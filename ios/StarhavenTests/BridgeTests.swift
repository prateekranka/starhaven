import XCTest
@testable import Starhaven

final class StarhavenBridgeTests: XCTestCase {
    func testCodecRoundTripAndFailClosedVersion() throws {
        let message = StarhavenEnvelope(id: "test-0", sequence: 0, source: "native", type: "host.ready", payload: .object(["build": .string("test")]))
        let decoded = try StarhavenBridgeCodec.decode(try StarhavenBridgeCodec.encode(message), expectedSource: "native")
        XCTAssertEqual(decoded, message)
        let invalid = try JSONEncoder().encode(StarhavenEnvelope(version: 2, id: "test-1", sequence: 0, source: "native", type: "host.ready", payload: .object([:])))
        XCTAssertThrowsError(try StarhavenBridgeCodec.decode(invalid, expectedSource: "native"))
    }

    func testNavigationPolicyAllowsOnlyPrivateAppOrigin() {
        XCTAssertTrue(StarhavenNavigationPolicy.allows(URL(string: "starhaven://app/index.html")))
        XCTAssertFalse(StarhavenNavigationPolicy.allows(URL(string: "https://example.com/")))
        XCTAssertFalse(StarhavenNavigationPolicy.allows(URL(string: "starhaven://other/index.html")))
        XCTAssertFalse(StarhavenNavigationPolicy.allows(URL(string: "file:///index.html")))
    }

    func testSnapshotStoreRoundTrip() throws {
        let suite = "starhaven.tests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        let store = StarhavenSnapshotStore(defaults: defaults)
        let snapshot = StarhavenSavedSnapshot(tick: 120, checksum: "abc123", seed: 42, paused: true)
        try store.save(snapshot)
        XCTAssertEqual(store.load(), snapshot)
        store.clear()
        XCTAssertNil(store.load())
        defaults.removePersistentDomain(forName: suite)
    }
}

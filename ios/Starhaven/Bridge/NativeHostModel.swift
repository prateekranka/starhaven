import Combine
import Foundation
import SwiftUI
import UIKit
@preconcurrency import WebKit

enum StarhavenNativeScreen: Equatable {
    case title
    case setup
    case match
    case pause
    case results
}

struct StarhavenNativeSettings: Equatable, Sendable {
    var soundEnabled = true
    var hapticsEnabled = true
    var reducedMotion = false
}

struct StarhavenNativeResult: Equatable, Identifiable, Sendable {
    let id = UUID()
    let faction: String
    let outcome: String
    let duration: String
    let build: String
    let balance: String
    let seed: String
    let checksum: String
}

struct StarhavenSafeArea: Equatable, Sendable {
    var top: Double = 0
    var right: Double = 0
    var bottom: Double = 0
    var left: Double = 0
}

@MainActor
final class NativeHostModel: NSObject, ObservableObject {
    @Published private(set) var screen: StarhavenNativeScreen = .title
    @Published private(set) var result: StarhavenNativeResult?
    @Published private(set) var webReady = false
    @Published private(set) var isRestoring = false
    @Published private(set) var eventLog: [String] = []
    @Published private(set) var safeArea = StarhavenSafeArea()
    @Published private(set) var webViewIdentity: ObjectIdentifier?
    @Published var settings = StarhavenNativeSettings()

    private(set) var webView: WKWebView?
    private let stagedRootURL: URL
    private let snapshotStore = StarhavenSnapshotStore()
    private let schemeHandler: StarhavenSchemeHandler
    private var sequence = 0
    private var waitingForFinalSnapshot = false
    private var backgrounded = false
    private var currentSeed: UInt32 = 0x4d455249

    init(stagedRootURL: URL) {
        self.stagedRootURL = stagedRootURL
        schemeHandler = StarhavenSchemeHandler(rootURL: stagedRootURL)
        super.init()
        createWebView()
    }

    func load() {
        ensureWebView()
        guard let url = URL(string: "starhaven://app/index.html?host=native") else {
            record("invalid private origin URL")
            return
        }
        webView?.load(URLRequest(url: url))
    }

    func beginSetup() {
        screen = .setup
    }

    func startMatch(seed: UInt32, faction: String, difficulty: String) {
        currentSeed = seed
        result = nil
        screen = .match
        send(type: "match.start", payload: .object([
            "seed": .number(Double(seed)),
            "faction": .string(faction),
            "difficulty": .string(difficulty),
        ]))
    }

    func pauseMatch() {
        screen = .pause
        send(type: "match.pause", payload: .object([:]))
    }

    func resumeMatch() {
        screen = .match
        send(type: "match.resume", payload: .object([:]))
    }

    func rematch() {
        var generator = SystemRandomNumberGenerator()
        currentSeed = UInt32.random(in: .min ... .max, using: &generator)
        result = nil
        screen = .match
        send(type: "match.rematch", payload: .object(["seed": .number(Double(currentSeed))]))
    }

    func updateSettings(_ settings: StarhavenNativeSettings) {
        self.settings = settings
        send(type: "settings.changed", payload: .object([
            "soundEnabled": .boolean(settings.soundEnabled),
            "hapticsEnabled": .boolean(settings.hapticsEnabled),
            "reducedMotion": .boolean(settings.reducedMotion),
        ]))
    }

    func updateSafeArea(_ insets: EdgeInsets) {
        let next = StarhavenSafeArea(top: insets.top, right: insets.trailing, bottom: insets.bottom, left: insets.leading)
        guard next != safeArea else { return }
        safeArea = next
        send(type: "safeArea.changed", payload: .object([
            "top": .number(next.top),
            "right": .number(next.right),
            "bottom": .number(next.bottom),
            "left": .number(next.left),
        ]))
    }

    func handleScenePhase(_ phase: ScenePhase) {
        switch phase {
        case .background:
            backgrounded = true
            send(type: "lifecycle.background", payload: .object([:]))
            send(type: "snapshot.request", payload: .object(["reason": .string("background")]))
        case .active:
            backgrounded = false
            send(type: "lifecycle.foreground", payload: .object([:]))
            if screen == .match { send(type: "match.resume", payload: .object([:])) }
        case .inactive:
            break
        @unknown default:
            break
        }
    }

    func returnToMenu() {
        waitingForFinalSnapshot = true
        send(type: "snapshot.request", payload: .object(["reason": .string("returnMenu")]))
        record("final snapshot requested before Main Menu release")
    }

    #if DEBUG
    func debugRestore() {
        isRestoring = true
        recoverAfterTermination()
    }
    #endif

    private func createWebView() {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.setURLSchemeHandler(schemeHandler, forURLScheme: "starhaven")
        let contentController = WKUserContentController()
        contentController.addUserScript(WKUserScript(source: StarhavenNativeBridgeBootstrap.source, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        contentController.add(self, name: "starhaven")
        configuration.userContentController = contentController
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = self
        view.uiDelegate = self
        view.allowsBackForwardNavigationGestures = false
        webView = view
        webViewIdentity = ObjectIdentifier(view)
        record("webview.created id=\(String(describing: webViewIdentity))")
    }

    private func ensureWebView() {
        if webView == nil { createWebView() }
    }

    private func releaseWebViewAfterSnapshotAcknowledgement() {
        guard waitingForFinalSnapshot else { return }
        waitingForFinalSnapshot = false
        webView?.navigationDelegate = nil
        webView?.uiDelegate = nil
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "starhaven")
        webView = nil
        webViewIdentity = nil
        screen = .title
        record("snapshot acknowledged before webview deallocation")
    }

    private func recoverAfterTermination() {
        webView?.navigationDelegate = nil
        webView?.uiDelegate = nil
        webView = nil
        webReady = false
        createWebView()
        load()
        record("web content process termination recovery started")
    }

    private func send(type: String, payload: StarhavenJSONValue) {
        guard let webView, StarhavenProtocol.nativeToGameTypes.contains(type) else { return }
        let message = StarhavenEnvelope(id: "native-\(sequence)", sequence: sequence, source: "native", type: type, payload: payload)
        sequence += 1
        let arguments: [String: Any] = ["message": [
            "version": message.version,
            "id": message.id,
            "sequence": message.sequence,
            "source": message.source,
            "type": message.type,
            "payload": message.payload.anyValue,
        ]]
        Task { @MainActor [weak self, webView] in
            do {
                _ = try await webView.callAsyncJavaScript("window.StarhavenBridge.receive(message)", arguments: arguments, in: nil, contentWorld: .page)
            } catch {
                self?.record("bridge send failed: \(error.localizedDescription)")
            }
        }
    }

    private func handleGameMessage(_ data: Data) {
        do {
            let message = try StarhavenBridgeCodec.decode(data, expectedSource: "game")
            record("game→native \(message.type) #\(message.sequence)")
            switch message.type {
            case "runtime.ready":
                webReady = true
                if let snapshot = snapshotStore.load() {
                    isRestoring = true
                    send(type: "match.restore", payload: .object([
                        "tick": .number(Double(snapshot.tick)),
                        "checksum": .string(snapshot.checksum),
                        "seed": .number(Double(snapshot.seed)),
                        "paused": .boolean(snapshot.paused),
                    ]))
                }
            case "match.started":
                screen = .match
            case "match.ended":
                result = makeResult(from: message.payload)
                screen = .results
            case "match.snapshot":
                if let snapshot = makeSnapshot(from: message.payload) { try? snapshotStore.save(snapshot) }
                send(type: "snapshot.ack", payload: .object(["acknowledged": .boolean(true)]))
            case "ack":
                if message.payload.objectValue?["acknowledgedType"]?.stringValue == "snapshot.ack" { releaseWebViewAfterSnapshotAcknowledgement() }
            case "feedback.haptic":
                if settings.hapticsEnabled { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
                send(type: "snapshot.ack", payload: .object(["acknowledged": .boolean(true)]))
            case "restore.completed":
                isRestoring = false
                send(type: "lifecycle.foreground", payload: .object([:]))
            case "protocol.error":
                record("protocol error received")
            case "pause.requested", "returnMenu.requested":
                break
            default:
                break
            }
        } catch {
            record("protocol error: \(error.localizedDescription)")
        }
    }

    private func makeSnapshot(from payload: StarhavenJSONValue) -> StarhavenSavedSnapshot? {
        guard let object = payload.objectValue,
              let tick = object["tick"]?.numberValue,
              let checksum = object["checksum"]?.stringValue,
              let seed = object["seed"]?.numberValue else { return nil }
        return StarhavenSavedSnapshot(tick: Int(tick), checksum: checksum, seed: UInt32(exactly: seed) ?? 0, paused: object["paused"]?.booleanValue ?? true)
    }

    private func makeResult(from payload: StarhavenJSONValue) -> StarhavenNativeResult {
        let object = payload.objectValue ?? [:]
        return StarhavenNativeResult(
            faction: object["faction"]?.stringValue ?? "Unknown",
            outcome: object["outcome"]?.stringValue ?? "Match complete",
            duration: object["duration"]?.stringValue ?? "--:--",
            build: object["build"]?.stringValue ?? "unknown",
            balance: object["balance"]?.stringValue ?? "v1",
            seed: object["seed"]?.stringValue ?? "0",
            checksum: object["checksum"]?.stringValue ?? "unknown"
        )
    }

    private func record(_ message: String) {
        eventLog = Array((eventLog + [message]).suffix(80))
    }

    var buildIdentity: String {
        guard let data = try? Data(contentsOf: stagedRootURL.appending(path: "build-info.json")), let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return "unknown" }
        return object["displaySha"] as? String ?? "unknown"
    }
}

extension StarhavenJSONValue {
    var numberValue: Double? {
        guard case .number(let value) = self else { return nil }
        return value
    }

    var booleanValue: Bool? {
        guard case .boolean(let value) = self else { return nil }
        return value
    }
}

extension NativeHostModel: WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        let data: Data?
        if let string = message.body as? String {
            data = string.data(using: .utf8)
        } else if JSONSerialization.isValidJSONObject(message.body) {
            data = try? JSONSerialization.data(withJSONObject: message.body)
        } else {
            data = nil
        }
        Task { @MainActor [weak self] in
            guard let data else {
                self?.record("bridge body was not JSON")
                return
            }
            self?.handleGameMessage(data)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            self.send(type: "host.ready", payload: .object(["build": .string(self.buildIdentity), "bridgeVersion": .number(1)]))
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void) {
        let allowed = StarhavenNavigationPolicy.allows(navigationAction.request.url)
        Task { @MainActor in decisionHandler(allowed ? .allow : .cancel) }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        Task { @MainActor [weak self] in self?.recoverAfterTermination() }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? { nil }
}

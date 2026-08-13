import SwiftUI

@main
struct StarhavenApp: App {
    @StateObject private var model: NativeHostModel

    init() {
        let stagedRoot = Bundle.main.url(forResource: "GameDist", withExtension: nil)
            ?? Bundle.main.bundleURL.appending(path: "GameDist")
        _model = StateObject(wrappedValue: NativeHostModel(bundledRootURL: stagedRoot))
    }

    var body: some Scene {
        WindowGroup {
            StarhavenRootView(model: model)
        }
    }
}

import SwiftUI

struct StarhavenRootView: View {
    @ObservedObject var model: NativeHostModel
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                Color(red: 0.047, green: 0.063, blue: 0.137)
                    .ignoresSafeArea()
                StarhavenNativeWebView(model: model)
                    .opacity(model.screen == .match || model.screen == .pause ? 1 : 0)
                    .ignoresSafeArea()
                content
            }
            .onAppear { model.updateSafeArea(proxy.safeAreaInsets) }
            .onChange(of: proxy.safeAreaInsets) { _, insets in model.updateSafeArea(insets) }
        }
        .task { await model.prepareAndLoad() }
        .onChange(of: scenePhase) { _, phase in model.handleScenePhase(phase) }
        .preferredColorScheme(.dark)
    }

    @ViewBuilder
    private var content: some View {
        switch model.screen {
        case .title:
            StarhavenTitleView(model: model)
        case .setup:
            StarhavenSetupView(model: model)
        case .match:
            StarhavenMatchControlsView(model: model)
        case .pause:
            StarhavenPauseView(model: model)
        case .results:
            StarhavenResultsView(model: model)
        }
    }
}

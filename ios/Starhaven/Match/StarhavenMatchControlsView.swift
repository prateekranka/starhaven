import SwiftUI

struct StarhavenMatchControlsView: View {
    @ObservedObject var model: NativeHostModel
    @State private var settingsPresented = false

    var body: some View {
        VStack {
            HStack {
                Label("STARHAVEN", systemImage: "sparkles")
                    .font(.headline.weight(.bold))
                Spacer()
                Text("BUILD \(model.buildIdentity)")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.secondary)
                Button("Settings", systemImage: "gearshape") { settingsPresented = true }
                    .labelStyle(.iconOnly)
                    .accessibilityLabel("Open match settings")
                Button("Pause", systemImage: "pause.fill") { model.pauseMatch() }
                    .labelStyle(.iconOnly)
                    .accessibilityLabel("Pause match")
            }
            .padding(.horizontal, 24)
            .padding(.top, 18)
            Spacer()
            HStack {
                Text(model.webReady ? "RUNTIME READY" : "CONNECTING TO LOCAL RUNTIME")
                Spacer()
                if model.isRestoring { ProgressView().controlSize(.small) }
                Button("Return to title", systemImage: "house") { model.returnToMenu() }
                    .labelStyle(.iconOnly)
                    .accessibilityLabel("Return to title after saving the match snapshot")
            }
            .font(.caption2.weight(.bold))
            .padding(.horizontal, 24)
            .padding(.bottom, 18)
        }
        .sheet(isPresented: $settingsPresented) {
            StarhavenSettingsView(model: model)
                .presentationDetents([.medium])
        }
        .allowsHitTesting(true)
    }
}

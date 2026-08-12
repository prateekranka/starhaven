import SwiftUI

struct StarhavenPauseView: View {
    @ObservedObject var model: NativeHostModel

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("MATCH PAUSED")
                .font(.caption.weight(.bold))
                .tracking(3)
                .foregroundStyle(.teal)
            Text("Hold the frontier.")
                .font(.system(size: 48, weight: .regular, design: .serif))
            Text("Simulation time is stopped. No ticks advance while this panel is open.")
                .foregroundStyle(.secondary)
            HStack {
                Button("Resume match", systemImage: "play.fill") { model.resumeMatch() }
                    .buttonStyle(.borderedProminent)
                Button("Return to title", systemImage: "house") { model.returnToMenu() }
                    .buttonStyle(.bordered)
            }
        }
        .padding(36)
        .frame(maxWidth: 720, alignment: .leading)
        .background(.ultraThinMaterial, in: .rect(cornerRadius: 22))
        .padding(24)
        .accessibilityElement(children: .contain)
    }
}

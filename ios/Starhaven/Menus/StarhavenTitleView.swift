import SwiftUI

struct StarhavenTitleView: View {
    @ObservedObject var model: NativeHostModel

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            Spacer()
            Text("THE MERIDIAN BREACH")
                .font(.caption.weight(.bold))
                .tracking(4)
                .foregroundStyle(.teal)
            Text("Hold the\nbright frontier.")
                .font(.system(size: 60, weight: .regular, design: .serif))
                .foregroundStyle(.white)
            Text("A tactical real-time skirmish where two frontier cultures race to awaken the Meridian Engine.")
                .font(.title3)
                .foregroundStyle(.secondary)
                .frame(maxWidth: 560, alignment: .leading)
            Button {
                model.beginSetup()
            } label: {
                Label("Start skirmish", systemImage: "arrow.up.right")
                    .frame(maxWidth: 300)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color(red: 0.973, green: 0.839, blue: 0.427))
            .foregroundStyle(.black)
            .disabled(!model.cacheReady || model.isRefreshingPack)
            .accessibilityHint("Choose a faction and enter a local match")
            Button {
                Task { await model.reloadFrontierPack() }
            } label: {
                Label("Reload pack", systemImage: "arrow.clockwise")
                    .frame(maxWidth: 300)
            }
            .buttonStyle(.bordered)
            .disabled(model.isRefreshingPack)
            .accessibilityHint("Download the latest Starhaven pack without force-quitting")
            Picker("Pack source", selection: packChannelBinding) {
                ForEach(StarhavenPackChannel.allCases) { channel in
                    Text(channel.title).tag(channel)
                }
            }
            .pickerStyle(.segmented)
            .frame(maxWidth: 300)
            .disabled(model.isRefreshingPack)
            .accessibilityLabel("Pack source")
            cacheStatus
            Spacer()
            HStack {
                Text("OFFLINE SKIRMISH")
                Text("•")
                Text("CACHED PRIVATE RUNTIME")
                Text("•")
                Text(model.packChannel.title.uppercased())
                Spacer()
                Text("BUILD \(model.buildIdentity)")
            }
            .font(.caption2.weight(.bold))
            .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 48)
        .padding(.vertical, 32)
        .frame(maxWidth: 1100, alignment: .leading)
        .accessibilityElement(children: .contain)
    }

    private var packChannelBinding: Binding<StarhavenPackChannel> {
        Binding(
            get: { model.packChannel },
            set: { channel in
                Task { await model.setPackChannel(channel) }
            }
        )
    }

    @ViewBuilder
    private var cacheStatus: some View {
        VStack(alignment: .leading, spacing: 8) {
            ProgressView(value: model.cacheProgress.fraction)
                .tint(Color(red: 0.973, green: 0.839, blue: 0.427))
                .frame(maxWidth: 360)
            Text(model.cacheError ?? model.cacheProgress.detail)
                .font(.caption.weight(.semibold))
                .foregroundStyle(model.cacheError == nil ? Color.secondary : Color.orange)
            if model.cacheReady {
                Text("60 FPS native runtime · cached from \(model.packChannel.hostLabel)")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.teal)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(model.cacheReady ? "Frontier pack cached" : "Downloading frontier pack")
    }
}

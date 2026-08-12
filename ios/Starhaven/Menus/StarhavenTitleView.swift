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
            .accessibilityHint("Choose a faction and enter a local match")
            Spacer()
            HStack {
                Text("OFFLINE SKIRMISH")
                Text("•")
                Text("PRIVATE LOCAL RUNTIME")
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
}

import SwiftUI

struct StarhavenResultsView: View {
    @ObservedObject var model: NativeHostModel

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("MATCH COMPLETE")
                .font(.caption.weight(.bold))
                .tracking(3)
                .foregroundStyle(.teal)
            if let result = model.result {
                Text("\(result.faction) victorious.")
                    .font(.system(size: 52, weight: .regular, design: .serif))
                Text(result.outcome)
                    .font(.title3)
                    .foregroundStyle(.secondary)
                Grid(alignment: .leading, horizontalSpacing: 28, verticalSpacing: 10) {
                    GridRow { Text("Duration").foregroundStyle(.secondary); Text(result.duration) }
                    GridRow { Text("Balance").foregroundStyle(.secondary); Text(result.balance) }
                    GridRow { Text("Seed").foregroundStyle(.secondary); Text(result.seed) }
                    GridRow { Text("Checksum").foregroundStyle(.secondary); Text(result.checksum).lineLimit(1) }
                    GridRow { Text("Build").foregroundStyle(.secondary); Text(result.build) }
                }
            }
            HStack {
                Button("Rematch with new seed", systemImage: "arrow.clockwise") { model.rematch() }
                    .buttonStyle(.borderedProminent)
                Button("Return to title", systemImage: "house") { model.returnToMenu() }
                    .buttonStyle(.bordered)
            }
        }
        .padding(36)
        .frame(maxWidth: 760, alignment: .leading)
        .background(.ultraThinMaterial, in: .rect(cornerRadius: 22))
        .padding(24)
    }
}

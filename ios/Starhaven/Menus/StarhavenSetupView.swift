import SwiftUI

struct StarhavenSetupView: View {
    @ObservedObject var model: NativeHostModel
    @State private var faction = "sunwoven"
    @State private var difficulty = "standard"
    @State private var seedText = ""
    @State private var errorText: String?

    var body: some View {
        Form {
            Section("Choose your opening") {
                Picker("Faction", selection: $faction) {
                    Text("Sunwoven — agile frontier builders").tag("sunwoven")
                    Text("Gravemark — fortified breach keepers").tag("gravemark")
                }
                Picker("Difficulty", selection: $difficulty) {
                    Text("Explorer").tag("explorer")
                    Text("Standard").tag("standard")
                    Text("Vanguard").tag("vanguard")
                }
                TextField("Seed (optional)", text: $seedText)
                    .keyboardType(.numberPad)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }
            Section {
                Button {
                    launch()
                } label: {
                    Label("Enter staging view", systemImage: "arrow.up.right")
                }
                .buttonStyle(.borderedProminent)
                if let errorText {
                    Text(errorText)
                        .foregroundStyle(.red)
                        .accessibilityAddTraits(.isStaticText)
                }
            }
            Section("Match") {
                LabeledContent("Map", value: "Meridian Breach / 48 × 32")
                LabeledContent("Simulation", value: "20 Hz / 50 ms")
                LabeledContent("Starting flux", value: "260 Flux")
            }
        }
        .formStyle(.grouped)
        .scrollContentBackground(.hidden)
        .background(Color(red: 0.047, green: 0.063, blue: 0.137))
        .navigationTitle("Match setup")
        .safeAreaPadding(.horizontal, 24)
    }

    private func launch() {
        let seed: UInt32
        if seedText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            var generator = SystemRandomNumberGenerator()
            seed = UInt32.random(in: .min ... .max, using: &generator)
        } else if let parsed = UInt32(seedText), let value = UInt32(exactly: parsed) {
            seed = value
        } else {
            errorText = "Seed must be a 32-bit unsigned integer."
            return
        }
        errorText = nil
        model.startMatch(seed: seed, faction: faction, difficulty: difficulty)
    }
}

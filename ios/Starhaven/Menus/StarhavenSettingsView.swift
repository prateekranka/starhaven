import SwiftUI

struct StarhavenSettingsView: View {
    @ObservedObject var model: NativeHostModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Toggle("Sound cues", isOn: binding(\.soundEnabled))
                Toggle("Haptics", isOn: binding(\.hapticsEnabled))
                Toggle("Reduce motion", isOn: binding(\.reducedMotion))
            }
            .navigationTitle("Settings")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func binding(_ keyPath: WritableKeyPath<StarhavenNativeSettings, Bool>) -> Binding<Bool> {
        Binding(
            get: { model.settings[keyPath: keyPath] },
            set: { value in
                var next = model.settings
                next[keyPath: keyPath] = value
                model.updateSettings(next)
            }
        )
    }
}

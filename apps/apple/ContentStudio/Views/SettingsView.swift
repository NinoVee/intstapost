import SwiftUI

struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @State private var confirmSignOut = false

    var body: some View {
        Form {
            Section("Account") {
                LabeledContent("Signed in as", value: model.user?.email ?? "—")
                LabeledContent("Server", value: model.serverAddress)
                if let url = URL(string: model.serverAddress) {
                    Link("Open web dashboard", destination: url)
                }
            }

            Section("Safety") {
                LabeledContent("Publishing", value: model.publishingEnabled ? "Only after your approval" : "Off — nothing is posted automatically")
                Text("Faces are never reshaped, swapped, aged or de-aged. Edits on people stay subtle, and media with children is colour-corrected only.")
                    .font(.footnote).foregroundStyle(.secondary)
                Text("Music is recommended only. You add the song in Instagram when you post.")
                    .font(.footnote).foregroundStyle(.secondary)
            }

            Section("Privacy") {
                Text("Your session token is kept in this device's Keychain. Photos you pick are sent only to your own server, and nothing is cached to disk.")
                    .font(.footnote).foregroundStyle(.secondary)
            }

            Section {
                Button("Sign out", role: .destructive) { confirmSignOut = true }
            }

            Section {
                LabeledContent("Version", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—")
            }
        }
        .formStyle(.grouped)
        .navigationTitle("Settings")
        .confirmationDialog("Sign out of Content Studio?", isPresented: $confirmSignOut, titleVisibility: .visible) {
            Button("Sign out", role: .destructive) { Task { await model.signOut() } }
        }
    }
}

import SwiftUI

struct LoginView: View {
    @Environment(AppModel.self) private var model
    @State private var server = ""
    @State private var email = ""
    @State private var password = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("CONTENT STUDIO").font(.caption.weight(.bold)).tracking(1.5).foregroundStyle(.secondary)
                    Text("Sign in").font(.largeTitle.bold())
                    Text("Your private studio. AI creates, you approve.").foregroundStyle(.secondary)
                }

                VStack(alignment: .leading, spacing: 12) {
                    field("Server") {
                        TextField("https://studio.example.com", text: $server)
                            #if os(iOS)
                            .textContentType(.URL)
                            .keyboardType(.URL)
                            .textInputAutocapitalization(.never)
                            #endif
                            .autocorrectionDisabled()
                    }
                    Text("On the same Wi-Fi you can use your computer's address, e.g. http://192.168.1.20:3000")
                        .font(.footnote).foregroundStyle(.secondary)
                    field("Email") {
                        TextField("you@example.com", text: $email)
                            .textContentType(.username)
                            #if os(iOS)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            #endif
                            .autocorrectionDisabled()
                    }
                    field("Password") {
                        SecureField("Password", text: $password)
                            .textContentType(.password)
                            .onSubmit { Task { await submit() } }
                    }
                }

                if let error {
                    Text(error).foregroundStyle(.red).font(.callout)
                }

                Button {
                    Task { await submit() }
                } label: {
                    Text(busy ? "Signing in…" : "Sign in").frame(maxWidth: .infinity).padding(.vertical, 4)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(busy || server.isEmpty || email.isEmpty || password.isEmpty)
            }
            .padding(24)
            .frame(maxWidth: 440)
            .frame(maxWidth: .infinity)
        }
        .onAppear { if server.isEmpty { server = model.serverAddress } }
    }

    private func field<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.subheadline.weight(.semibold))
            content()
                .textFieldStyle(.roundedBorder)
        }
    }

    private func submit() async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            try await model.signIn(server: server, email: email, password: password)
            password = ""
        } catch {
            self.error = error.localizedDescription
        }
    }
}

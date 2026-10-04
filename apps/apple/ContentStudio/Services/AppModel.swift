import Foundation
import Observation

/// App-wide state: which server, who is signed in, and the API client.
@MainActor
@Observable
final class AppModel {
    enum Phase: Equatable { case launching, signedOut, signedIn }

    private(set) var phase: Phase = .launching
    private(set) var user: User?
    private(set) var publishingEnabled = false
    private(set) var maxUploadMb: Int?
    private(set) var client: APIClient?

    var serverAddress: String {
        didSet { UserDefaults.standard.set(serverAddress, forKey: Self.serverKey) }
    }

    private static let serverKey = "serverAddress"
    private static let tokenAccount = "session-token"

    init() {
        serverAddress = UserDefaults.standard.string(forKey: Self.serverKey) ?? ""
    }

    /// Restores a saved session on launch.
    func restore() async {
        guard let url = try? APIClient.normalizeServerURL(serverAddress),
              let token = KeychainStore.load(account: Self.tokenAccount)
        else {
            phase = .signedOut
            return
        }
        let client = APIClient(baseURL: url, token: token)
        do {
            let me = try await client.me()
            apply(me: me, client: client)
        } catch APIError.unauthorized {
            KeychainStore.delete(account: Self.tokenAccount)
            phase = .signedOut
        } catch {
            // Offline or server down: stay signed in so the user can retry.
            self.client = client
            phase = .signedIn
        }
    }

    func signIn(server: String, email: String, password: String) async throws {
        let url = try APIClient.normalizeServerURL(server)
        let login = try await APIClient(baseURL: url, token: nil).login(email: email, password: password)
        serverAddress = url.absoluteString
        KeychainStore.save(login.token, account: Self.tokenAccount)
        let client = APIClient(baseURL: url, token: login.token)
        user = login.user
        self.client = client
        phase = .signedIn
        if let me = try? await client.me() { apply(me: me, client: client) }
    }

    func signOut() async {
        await client?.logout() // revokes the token on the server
        signOutLocally()
    }

    /// Call when any request returns 401.
    func signOutLocally() {
        KeychainStore.delete(account: Self.tokenAccount)
        client = nil
        user = nil
        phase = .signedOut
    }

    /// Runs an API call, signing out automatically if the session has expired.
    func run<T>(_ work: (APIClient) async throws -> T) async throws -> T {
        guard let client else { throw APIError.unauthorized }
        do {
            return try await work(client)
        } catch APIError.unauthorized {
            signOutLocally()
            throw APIError.unauthorized
        }
    }

    private func apply(me: MeResponse, client: APIClient) {
        user = me.user
        publishingEnabled = me.publishingEnabled
        maxUploadMb = me.maxUploadMb
        self.client = client
        phase = .signedIn
    }
}

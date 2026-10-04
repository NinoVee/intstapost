import Foundation
import UniformTypeIdentifiers

enum APIError: LocalizedError {
    case invalidServerURL
    case insecureServerURL
    case unauthorized
    case server(status: Int, message: String)
    case transport(Error)
    case decoding(Error)
    case fileTooLarge(maxMb: Int)

    var errorDescription: String? {
        switch self {
        case .invalidServerURL: return "That server address doesn't look right. Example: https://studio.example.com"
        case .insecureServerURL: return "Use https:// for servers on the internet. Plain http:// only works on your local network."
        case .unauthorized: return "Your session has ended. Please sign in again."
        case let .server(_, message): return message
        case let .transport(error): return "Couldn't reach the server. \(error.localizedDescription)"
        case .decoding: return "The server sent an unexpected response. Is the app up to date with the server?"
        case let .fileTooLarge(maxMb): return "This file is larger than the server's \(maxMb) MB limit."
        }
    }
}

/// Thin, immutable HTTP client for the Content Studio JSON API.
/// A new instance is created whenever the server or token changes, so it is safe to share.
final class APIClient: @unchecked Sendable {
    let baseURL: URL
    let token: String?
    private let session: URLSession

    init(baseURL: URL, token: String?) {
        self.baseURL = baseURL
        self.token = token
        // Ephemeral: no cookies or responses are written to disk (private media).
        let config = URLSessionConfiguration.ephemeral
        config.httpShouldSetCookies = false
        config.httpCookieAcceptPolicy = .never
        config.timeoutIntervalForRequest = 60
        config.timeoutIntervalForResource = 60 * 30 // large video uploads
        session = URLSession(configuration: config)
    }

    /// Validates a user-entered server address.
    static func normalizeServerURL(_ raw: String) throws -> URL {
        var text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        while text.hasSuffix("/") { text.removeLast() }
        if !text.contains("://") {
            // No scheme typed: local-network servers default to http, everything else to https.
            let host = text.split(separator: "/").first.map { String($0.split(separator: ":").first ?? "") } ?? ""
            text = (isLocalHost(host) ? "http://" : "https://") + text
        }
        guard let url = URL(string: text), let scheme = url.scheme?.lowercased(), let host = url.host, !host.isEmpty,
              scheme == "https" || scheme == "http"
        else { throw APIError.invalidServerURL }
        if scheme == "http" && !isLocalHost(host) { throw APIError.insecureServerURL }
        return url
    }

    static func isLocalHost(_ host: String) -> Bool {
        let h = host.lowercased()
        if h == "localhost" || h.hasSuffix(".local") || h == "127.0.0.1" || h == "::1" { return true }
        let parts = h.split(separator: ".").compactMap { Int($0) }
        guard parts.count == 4 else { return false }
        switch (parts[0], parts[1]) {
        case (10, _), (192, 168), (127, _): return true
        case (172, let b) where (16...31).contains(b): return true
        case (100, let b) where (64...127).contains(b): return true // Tailscale / CGNAT
        default: return false
        }
    }

    /// Resolves an API path (or a relative signed media URL like "/api/media/file?...").
    func url(for path: String) -> URL {
        URL(string: path, relativeTo: baseURL)?.absoluteURL ?? baseURL
    }

    // MARK: - Core request

    private func makeRequest(_ path: String, method: String = "GET", json: Encodable? = nil) throws -> URLRequest {
        var request = URLRequest(url: url(for: path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let json {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(AnyEncodable(json))
        }
        return request
    }

    private func perform(_ request: URLRequest) async throws -> Data {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.transport(error)
        }
        try Self.check(response: response, data: data)
        return data
    }

    private static func check(response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else { return }
        if http.statusCode == 401 { throw APIError.unauthorized }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? JSONDecoder().decode(APIErrorBody.self, from: data))?.error ?? HTTPURLResponse.localizedString(forStatusCode: http.statusCode)
            throw APIError.server(status: http.statusCode, message: message)
        }
    }

    private func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do {
            return try Self.decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }

    static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { container in
            let raw = try container.singleValueContainer().decode(String.self)
            let withFraction = ISO8601DateFormatter()
            withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = withFraction.date(from: raw) { return date }
            let plain = ISO8601DateFormatter()
            if let date = plain.date(from: raw) { return date }
            throw DecodingError.dataCorrupted(.init(codingPath: container.codingPath, debugDescription: "Bad date \(raw)"))
        }
        return decoder
    }()

    private func get<T: Decodable>(_ path: String, as type: T.Type) async throws -> T {
        try decode(T.self, from: try await perform(try makeRequest(path)))
    }

    // MARK: - Endpoints

    func login(email: String, password: String) async throws -> LoginResponse {
        struct Body: Encodable { let email: String; let password: String }
        let request = try makeRequest("/api/auth/login", method: "POST", json: Body(email: email, password: password))
        // A 401 here means wrong credentials, not an expired session.
        do {
            return try decode(LoginResponse.self, from: try await perform(request))
        } catch APIError.unauthorized {
            throw APIError.server(status: 401, message: "Invalid email or password.")
        }
    }

    func logout() async {
        guard let request = try? makeRequest("/api/auth/logout", method: "POST") else { return }
        _ = try? await perform(request)
    }

    func me() async throws -> MeResponse { try await get("/api/me", as: MeResponse.self) }

    func today() async throws -> TodayResponse { try await get("/api/today", as: TodayResponse.self) }

    func media(filter: MediaFilter, before: Date? = nil, limit: Int = 60) async throws -> MediaListResponse {
        var components = URLComponents()
        components.path = "/api/media"
        var items = [URLQueryItem(name: "filter", value: filter.rawValue), URLQueryItem(name: "limit", value: String(limit))]
        if let before {
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            items.append(URLQueryItem(name: "before", value: formatter.string(from: before)))
        }
        components.queryItems = items
        return try await get(components.string ?? "/api/media", as: MediaListResponse.self)
    }

    func mediaDetail(id: String) async throws -> MediaDetailResponse {
        try await get("/api/media/\(id)", as: MediaDetailResponse.self)
    }

    func setExcluded(id: String, excluded: Bool) async throws {
        struct Body: Encodable { let excluded: Bool }
        _ = try await perform(try makeRequest("/api/media/\(id)", method: "PATCH", json: Body(excluded: excluded)))
    }

    func decide(draftId: String, _ decision: DraftDecision) async throws {
        struct Body: Encodable { let decision: String; let reasons: [String]?; let comment: String? }
        let body: Body
        switch decision {
        case .approve: body = Body(decision: "approve", reasons: nil, comment: nil)
        case .saveForLater: body = Body(decision: "save_for_later", reasons: nil, comment: nil)
        case let .reject(reasons, comment): body = Body(decision: "reject", reasons: reasons.map(\.rawValue), comment: comment)
        }
        _ = try await perform(try makeRequest("/api/drafts/\(draftId)/decision", method: "POST", json: body))
    }

    /// Fetches private media (signed URL + bearer token). Used for previews.
    func mediaData(path: String) async throws -> Data {
        try await perform(try makeRequest(path))
    }

    /// Downloads private media to a temporary file (used for video playback).
    func downloadMedia(path: String, fileExtension: String) async throws -> URL {
        let request = try makeRequest(path)
        let (tempURL, response): (URL, URLResponse)
        do {
            (tempURL, response) = try await session.download(for: request)
        } catch {
            throw APIError.transport(error)
        }
        try Self.check(response: response, data: Data())
        let destination = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension(fileExtension)
        try FileManager.default.moveItem(at: tempURL, to: destination)
        return destination
    }

    /// Streams one file to the server as multipart/form-data without loading it into memory.
    func upload(fileURL: URL, filename: String, maxUploadMb: Int?) async throws -> UploadResult {
        let size = (try? fileURL.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        if let maxUploadMb, size > maxUploadMb * 1024 * 1024 { throw APIError.fileTooLarge(maxMb: maxUploadMb) }

        let boundary = "ContentStudio-\(UUID().uuidString)"
        let bodyURL = try MultipartBody.write(fileURL: fileURL, filename: filename, boundary: boundary)
        defer { try? FileManager.default.removeItem(at: bodyURL) }

        var request = try makeRequest("/api/media/upload", method: "POST")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.upload(for: request, fromFile: bodyURL)
        } catch {
            throw APIError.transport(error)
        }
        try Self.check(response: response, data: data)
        let decoded = try decode(UploadResponse.self, from: data)
        guard let first = decoded.results.first else { throw APIError.server(status: 500, message: "Upload returned no result") }
        return first
    }
}

enum MultipartBody {
    static func write(fileURL: URL, filename: String, boundary: String) throws -> URL {
        let out = FileManager.default.temporaryDirectory.appendingPathComponent("upload-\(UUID().uuidString).multipart")
        guard FileManager.default.createFile(atPath: out.path, contents: nil) else { throw CocoaError(.fileWriteUnknown) }
        let writer = try FileHandle(forWritingTo: out)
        defer { try? writer.close() }

        let safeName = filename.replacingOccurrences(of: "\"", with: "").replacingOccurrences(of: "\r", with: "").replacingOccurrences(of: "\n", with: "")
        let mime = UTType(filenameExtension: fileURL.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        let header = "--\(boundary)\r\nContent-Disposition: form-data; name=\"files\"; filename=\"\(safeName)\"\r\nContent-Type: \(mime)\r\n\r\n"
        try writer.write(contentsOf: Data(header.utf8))

        let reader = try FileHandle(forReadingFrom: fileURL)
        defer { try? reader.close() }
        while let chunk = try reader.read(upToCount: 1 << 20), !chunk.isEmpty {
            try writer.write(contentsOf: chunk)
        }
        try writer.write(contentsOf: Data("\r\n--\(boundary)--\r\n".utf8))
        return out
    }
}

/// Type-erases Encodable values for JSONEncoder.
private struct AnyEncodable: Encodable {
    private let encodeFunc: (Encoder) throws -> Void
    init(_ wrapped: Encodable) { encodeFunc = { encoder in try wrapped.encode(to: encoder) } }
    func encode(to encoder: Encoder) throws { try encodeFunc(encoder) }
}

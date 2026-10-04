import CoreTransferable
import Foundation
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

/// A video handed over by the Photos picker as a file (avoids loading it into memory).
struct PickedMovie: Transferable {
    let url: URL

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(contentType: .movie) { movie in
            SentTransferredFile(movie.url)
        } importing: { received in
            let ext = received.file.pathExtension.isEmpty ? "mov" : received.file.pathExtension
            let copy = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathExtension(ext)
            try FileManager.default.copyItem(at: received.file, to: copy)
            return PickedMovie(url: copy)
        }
    }
}

/// A local temporary copy ready to upload. Deleted after upload.
struct PreparedUpload {
    let fileURL: URL
    let filename: String
}

enum MediaImport {
    /// Photos picker → temp file. Images keep their original encoding (e.g. HEIC); the
    /// picker runs out-of-process, so no full photo-library permission is needed.
    static func prepare(_ item: PhotosPickerItem, index: Int) async throws -> PreparedUpload? {
        let isMovie = item.supportedContentTypes.contains { $0.conforms(to: .movie) }
        let stamp = Self.timestamp()
        if isMovie {
            guard let movie = try await item.loadTransferable(type: PickedMovie.self) else { return nil }
            return PreparedUpload(fileURL: movie.url, filename: "VID_\(stamp)_\(index).\(movie.url.pathExtension)")
        }
        guard let data = try await item.loadTransferable(type: Data.self) else { return nil }
        let type = item.supportedContentTypes.first { $0.conforms(to: .image) }
        let ext = type?.preferredFilenameExtension ?? "jpg"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathExtension(ext)
        try data.write(to: url, options: .completeFileProtection)
        return PreparedUpload(fileURL: url, filename: "IMG_\(stamp)_\(index).\(ext)")
    }

    /// Files app / Finder / drag-and-drop → temp copy (handles security-scoped URLs).
    static func prepare(fileURL: URL) throws -> PreparedUpload {
        let scoped = fileURL.startAccessingSecurityScopedResource()
        defer { if scoped { fileURL.stopAccessingSecurityScopedResource() } }
        let copy = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathExtension(fileURL.pathExtension)
        try FileManager.default.copyItem(at: fileURL, to: copy)
        return PreparedUpload(fileURL: copy, filename: fileURL.lastPathComponent)
    }

    private static func timestamp() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyyMMdd_HHmmss"
        return formatter.string(from: Date())
    }
}

import SwiftUI

#if canImport(UIKit)
import UIKit
typealias PlatformImage = UIImage
extension Image {
    init(platformImage: PlatformImage) { self.init(uiImage: platformImage) }
}
#else
import AppKit
typealias PlatformImage = NSImage
extension Image {
    init(platformImage: PlatformImage) { self.init(nsImage: platformImage) }
}
#endif

/// In-memory only (private media is never cached to disk). NSCache is thread-safe.
final class ImageCache: @unchecked Sendable {
    static let shared = ImageCache()
    private let cache = NSCache<NSString, PlatformImage>()

    private init() { cache.countLimit = 400 }

    /// Signed URLs change every request; the storage key inside them is the stable identity.
    static func key(for path: String) -> String {
        URLComponents(string: path)?.queryItems?.first(where: { $0.name == "key" })?.value ?? path
    }

    func image(for path: String) -> PlatformImage? { cache.object(forKey: Self.key(for: path) as NSString) }
    func store(_ image: PlatformImage, for path: String) { cache.setObject(image, forKey: Self.key(for: path) as NSString) }
}

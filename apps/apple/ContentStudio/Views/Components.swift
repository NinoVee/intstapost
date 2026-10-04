import SwiftUI

struct Pill: View {
    enum Tone { case neutral, ok, warn, danger, info }
    let text: String
    var tone: Tone = .neutral
    var dot = false

    var body: some View {
        HStack(spacing: 5) {
            if dot { Circle().frame(width: 6, height: 6) }
            Text(text)
        }
        .font(.caption.weight(.semibold))
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .foregroundStyle(foreground)
        .background(background, in: Capsule())
    }

    private var foreground: Color {
        switch tone {
        case .neutral: return .primary
        case .ok: return .green
        case .warn: return .orange
        case .danger: return .red
        case .info: return .accentColor
        }
    }

    private var background: Color {
        switch tone {
        case .neutral: return .secondary.opacity(0.15)
        default: return foreground.opacity(0.15)
        }
    }
}

struct StatTile: View {
    let value: Int
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(value)").font(.title.bold()).monospacedDigit()
            Text(label).font(.footnote).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 14))
    }
}

struct ErrorBanner: View {
    let message: String
    var retry: (() -> Void)?

    var body: some View {
        HStack {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
            Text(message).font(.callout)
            Spacer()
            if let retry { Button("Retry", action: retry) }
        }
        .padding(12)
        .background(.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
    }
}

/// Loads a private image through the authenticated API client (AsyncImage can't send the token).
struct AuthorizedImage: View {
    @Environment(AppModel.self) private var model
    let path: String?
    var contentMode: ContentMode = .fill

    @State private var image: PlatformImage?
    @State private var failed = false

    var body: some View {
        ZStack {
            Rectangle().fill(.quaternary)
            if let image {
                Image(platformImage: image).resizable().aspectRatio(contentMode: contentMode)
            } else if failed || path == nil {
                Image(systemName: "photo").font(.title2).foregroundStyle(.secondary)
            } else {
                ProgressView()
            }
        }
        .clipped()
        .task(id: path) { await load() }
    }

    private func load() async {
        guard let path else { return }
        if let cached = ImageCache.shared.image(for: path) {
            image = cached
            return
        }
        do {
            let data = try await model.run { try await $0.mediaData(path: path) }
            if let decoded = PlatformImage(data: data) {
                ImageCache.shared.store(decoded, for: path)
                image = decoded
            } else {
                failed = true
            }
        } catch {
            failed = true
        }
    }
}

/// A fixed-aspect tile that crops its content (used in grids).
struct AspectTile<Content: View>: View {
    var ratio: CGFloat = 4.0 / 5.0
    var cornerRadius: CGFloat = 10
    @ViewBuilder var content: () -> Content

    var body: some View {
        Color.clear
            .aspectRatio(ratio, contentMode: .fit)
            .overlay { content() }
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
    }
}

func formatDuration(_ ms: Int?) -> String {
    guard let ms, ms > 0 else { return "" }
    let s = Int((Double(ms) / 1000).rounded())
    return String(format: "%d:%02d", s / 60, s % 60)
}

func statusLabel(_ status: String) -> String {
    switch status {
    case "ready_for_review": return "Ready for review"
    case "saved_for_later": return "Saved for later"
    default: return status.replacingOccurrences(of: "_", with: " ").capitalized
    }
}

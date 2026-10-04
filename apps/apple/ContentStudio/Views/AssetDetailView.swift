import AVKit
import SwiftUI

struct AssetDetailView: View {
    @Environment(AppModel.self) private var model
    let assetId: String

    @State private var detail: MediaDetailResponse?
    @State private var error: String?
    @State private var player: AVPlayer?
    @State private var loadingVideo = false
    @State private var localVideo: URL?

    var body: some View {
        ScrollView {
            if let detail {
                content(detail)
            } else if let error {
                ErrorBanner(message: error) { Task { await load() } }.padding()
            } else {
                ProgressView().padding(40)
            }
        }
        .navigationTitle(detail?.asset.originalFilename ?? "Media")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .task(id: assetId) { await load() }
        .onDisappear {
            player?.pause()
            if let localVideo { try? FileManager.default.removeItem(at: localVideo) }
        }
    }

    @ViewBuilder
    private func content(_ d: MediaDetailResponse) -> some View {
        let a = d.asset
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .top, spacing: 20) {
                media(d).frame(minWidth: 420)
                info(d).frame(width: 360)
            }
            .padding()
            VStack(alignment: .leading, spacing: 16) {
                media(d)
                info(d)
            }
            .padding()
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button(a.excluded ? "Allow again" : "Never use this", role: a.excluded ? nil : .destructive) {
                    Task { await setExcluded(!a.excluded) }
                }
            }
        }
    }

    @ViewBuilder
    private func media(_ d: MediaDetailResponse) -> some View {
        if d.asset.kind == "video" {
            ZStack {
                if let player {
                    VideoPlayer(player: player).aspectRatio(aspect(d.asset), contentMode: .fit)
                } else {
                    AuthorizedImage(path: d.previewUrl, contentMode: .fit)
                        .aspectRatio(aspect(d.asset), contentMode: .fit)
                    Button {
                        Task { await playVideo(d) }
                    } label: {
                        Label(loadingVideo ? "Loading…" : "Play", systemImage: "play.fill")
                            .padding(.horizontal, 10)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(loadingVideo)
                }
            }
            .frame(maxHeight: 640)
            .clipShape(RoundedRectangle(cornerRadius: 14))
        } else {
            AuthorizedImage(path: d.previewUrl, contentMode: .fit)
                .aspectRatio(aspect(d.asset), contentMode: .fit)
                .frame(maxHeight: 640)
                .clipShape(RoundedRectangle(cornerRadius: 14))
        }
    }

    private func info(_ d: MediaDetailResponse) -> some View {
        let a = d.asset
        return VStack(alignment: .leading, spacing: 16) {
            GroupBox("Scores") {
                VStack(spacing: 8) {
                    ForEach(d.scores.rows) { row in
                        HStack {
                            Text(row.label).font(.subheadline).frame(width: 140, alignment: .leading)
                            ProgressView(value: Double(row.value ?? 0), total: 100).opacity(row.value == nil ? 0.3 : 1)
                            Text(row.value.map(String.init) ?? "—").font(.subheadline.monospacedDigit()).foregroundStyle(.secondary).frame(width: 32, alignment: .trailing)
                        }
                    }
                    Text("Dashes are filled in by AI analysis, which only runs on the best picks.")
                        .font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(.top, 4)
            }

            GroupBox("Details") {
                Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 6) {
                    row("Status", [a.status, a.isBlurry == true ? "blurry" : nil, a.excluded ? "never use" : nil].compactMap { $0 }.joined(separator: " · "))
                    row("Size", [dimensions(a), ByteCountFormatter.string(fromByteCount: Int64(a.sizeBytes), countStyle: .file), a.durationMs.map { formatDuration($0) }].compactMap { $0 }.joined(separator: " · "))
                    row("Captured", a.capturedAt?.formatted(date: .abbreviated, time: .shortened) ?? "Unknown")
                    row("Source", a.source ?? "—")
                    if a.hasApproxLocation { row("Location", "Approximate only (≈1 km). Never added to captions automatically.") }
                }
                .font(.subheadline)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 4)
            }

            if !d.similar.isEmpty {
                GroupBox("Similar shots (\(d.similar.count))") {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(a.isRepresentative ? "This is one of the best in its group." : "A sharper version from this group will be used instead.")
                            .font(.caption).foregroundStyle(.secondary)
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 70), spacing: 6)], spacing: 6) {
                            ForEach(d.similar) { s in
                                NavigationLink(value: s.id) {
                                    AspectTile { AuthorizedImage(path: s.previewUrl).opacity(s.isRepresentative ? 1 : 0.45) }
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .padding(.top, 4)
                }
            }
        }
    }

    private func row(_ label: String, _ value: String) -> some View {
        GridRow {
            Text(label).foregroundStyle(.secondary)
            Text(value)
        }
    }

    private func dimensions(_ a: AssetDetail) -> String? {
        guard let w = a.width, let h = a.height else { return nil }
        return "\(w)×\(h)"
    }

    private func aspect(_ a: AssetDetail) -> CGFloat {
        guard let w = a.width, let h = a.height, w > 0, h > 0 else { return 4.0 / 5.0 }
        return CGFloat(w) / CGFloat(h)
    }

    private func load() async {
        do {
            detail = try await model.run { try await $0.mediaDetail(id: assetId) }
            error = nil
        } catch APIError.unauthorized {
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func setExcluded(_ excluded: Bool) async {
        do {
            try await model.run { try await $0.setExcluded(id: assetId, excluded: excluded) }
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Videos are private, so they're downloaded with the session token to a temp file, then played.
    private func playVideo(_ d: MediaDetailResponse) async {
        guard let path = d.originalUrl else { return }
        loadingVideo = true
        defer { loadingVideo = false }
        do {
            let ext = d.asset.mimeType == "video/quicktime" ? "mov" : (d.asset.mimeType.split(separator: "/").last.map(String.init) ?? "mp4")
            let url = try await model.run { try await $0.downloadMedia(path: path, fileExtension: ext) }
            localVideo = url
            let p = AVPlayer(url: url)
            player = p
            p.play()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

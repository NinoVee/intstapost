import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

struct LibraryView: View {
    @Environment(AppModel.self) private var model
    @State private var filter: MediaFilter = .all
    @State private var items: [MediaSummary] = []
    @State private var nextBefore: Date?
    @State private var loading = false
    @State private var error: String?

    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var showFileImporter = false
    @State private var upload = UploadProgress()
    @State private var dropTargeted = false

    private let columns = [GridItem(.adaptive(minimum: 110), spacing: 8)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Picker("Filter", selection: $filter) {
                    ForEach(MediaFilter.allCases) { Text($0.label).tag($0) }
                }
                .pickerStyle(.menu)

                if upload.isActive || upload.summary != nil { uploadStatus }
                if let error { ErrorBanner(message: error) { Task { await reload() } } }

                if items.isEmpty && !loading {
                    emptyState
                } else {
                    LazyVGrid(columns: columns, spacing: 8) {
                        ForEach(items) { item in
                            NavigationLink(value: item.id) { tile(item) }
                                .buttonStyle(.plain)
                                .onAppear { if item.id == items.last?.id { Task { await loadMore() } } }
                        }
                    }
                }
                if loading { ProgressView().frame(maxWidth: .infinity).padding() }
            }
            .padding()
        }
        .navigationTitle("Library")
        .navigationDestination(for: String.self) { AssetDetailView(assetId: $0) }
        .refreshable { await reload() }
        .task(id: filter) { await reload() }
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                PhotosPicker(selection: $pickerItems, maxSelectionCount: 50, matching: .any(of: [.images, .videos]), preferredItemEncoding: .current) {
                    Label("Add from Photos", systemImage: "photo.badge.plus")
                }
                .disabled(upload.isActive)
                Button { showFileImporter = true } label: { Label("Add files", systemImage: "folder.badge.plus") }
                    .disabled(upload.isActive)
            }
        }
        .onChange(of: pickerItems) { _, newItems in
            guard !newItems.isEmpty else { return }
            pickerItems = []
            Task { await uploadPhotos(newItems) }
        }
        .fileImporter(isPresented: $showFileImporter, allowedContentTypes: [.image, .movie], allowsMultipleSelection: true) { result in
            if case let .success(urls) = result { Task { await uploadFiles(urls) } }
        }
        // Drag photos/videos from Finder (Mac) or Files (iPad).
        .dropDestination(for: URL.self) { urls, _ in
            Task { await uploadFiles(urls) }
            return true
        } isTargeted: { dropTargeted = $0 }
        .overlay {
            if dropTargeted {
                RoundedRectangle(cornerRadius: 16).strokeBorder(Color.accentColor, style: StrokeStyle(lineWidth: 3, dash: [8]))
                    .padding(8)
                    .allowsHitTesting(false)
            }
        }
    }

    // MARK: - Pieces

    private func tile(_ item: MediaSummary) -> some View {
        AspectTile {
            AuthorizedImage(path: item.previewUrl)
                .opacity(item.isDimmed ? 0.45 : 1)
                .overlay(alignment: .bottomLeading) {
                    HStack(spacing: 3) {
                        if item.isVideo { badge("▶ \(formatDuration(item.durationMs))") }
                        if let score = item.technicalScore { badge("\(score)") }
                        if item.isBlurry == true { badge("Blurry") }
                        if !item.isRepresentative { badge("Duplicate") } else if item.clusterId != nil { badge("Similar") }
                        if item.excluded { badge("Never use") }
                    }
                    .padding(5)
                }
                .overlay {
                    if item.previewUrl == nil {
                        Text(item.status == "failed" ? "Analysis failed" : "Analysing…").font(.caption2).foregroundStyle(.secondary)
                    }
                }
        }
        .accessibilityLabel("\(item.isVideo ? "Video" : "Photo"), score \(item.technicalScore.map(String.init) ?? "pending")")
    }

    private func badge(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 10, weight: .semibold))
            .padding(.horizontal, 5)
            .padding(.vertical, 2)
            .foregroundStyle(.white)
            .background(.black.opacity(0.65), in: Capsule())
    }

    private var uploadStatus: some View {
        HStack(spacing: 10) {
            if upload.isActive {
                ProgressView(value: Double(upload.done), total: Double(max(upload.total, 1)))
                    .frame(maxWidth: 160)
                Text("Uploading \(min(upload.done + 1, upload.total)) of \(upload.total)…").font(.callout)
            } else if let summary = upload.summary {
                Image(systemName: upload.failures.isEmpty ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                    .foregroundStyle(upload.failures.isEmpty ? .green : .orange)
                VStack(alignment: .leading) {
                    Text(summary).font(.callout)
                    ForEach(upload.failures.prefix(3), id: \.self) { Text($0).font(.caption).foregroundStyle(.secondary) }
                }
                Spacer()
                Button("Dismiss") { upload.summary = nil; upload.failures = [] }.controlSize(.small)
            }
        }
        .padding(12)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 12))
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "photo.stack").font(.largeTitle).foregroundStyle(.secondary)
            Text("Nothing here yet").font(.headline)
            Text("Add photos and videos from your library. Originals are stored privately on your server and never modified.")
                .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
            PhotosPicker(selection: $pickerItems, maxSelectionCount: 50, matching: .any(of: [.images, .videos]), preferredItemEncoding: .current) {
                Text("Add from Photos").padding(.horizontal, 8)
            }
            .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity)
        .padding(32)
    }

    // MARK: - Loading

    private func reload() async {
        nextBefore = nil
        await fetch(replace: true)
    }

    private func loadMore() async {
        guard nextBefore != nil, !loading else { return }
        await fetch(replace: false)
    }

    private func fetch(replace: Bool) async {
        loading = true
        defer { loading = false }
        do {
            let before = replace ? nil : nextBefore
            let page = try await model.run { try await $0.media(filter: filter, before: before) }
            items = replace ? page.items : items + page.items.filter { new in !items.contains { $0.id == new.id } }
            nextBefore = page.nextBefore
            error = nil
        } catch APIError.unauthorized {
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: - Uploading

    private func uploadPhotos(_ picked: [PhotosPickerItem]) async {
        upload.start(total: picked.count)
        for (index, item) in picked.enumerated() {
            do {
                if let prepared = try await MediaImport.prepare(item, index: index + 1) {
                    await send(prepared)
                } else {
                    upload.fail("Item \(index + 1): couldn't be read")
                }
            } catch {
                upload.fail("Item \(index + 1): \(error.localizedDescription)")
            }
        }
        await finishUpload()
    }

    private func uploadFiles(_ urls: [URL]) async {
        let media = urls.filter { url in
            guard let type = UTType(filenameExtension: url.pathExtension) else { return false }
            return type.conforms(to: .image) || type.conforms(to: .movie)
        }
        guard !media.isEmpty else { return }
        upload.start(total: media.count)
        for url in media {
            do {
                await send(try MediaImport.prepare(fileURL: url))
            } catch {
                upload.fail("\(url.lastPathComponent): \(error.localizedDescription)")
            }
        }
        await finishUpload()
    }

    private func send(_ prepared: PreparedUpload) async {
        defer {
            try? FileManager.default.removeItem(at: prepared.fileURL)
            upload.done += 1
        }
        do {
            let maxMb = model.maxUploadMb
            let result = try await model.run { try await $0.upload(fileURL: prepared.fileURL, filename: prepared.filename, maxUploadMb: maxMb) }
            if let message = result.error { upload.fail("\(prepared.filename): \(message)") }
            else if result.duplicate == true { upload.duplicates += 1 }
            else { upload.added += 1 }
        } catch {
            upload.fail("\(prepared.filename): \(error.localizedDescription)")
        }
    }

    private func finishUpload() async {
        upload.finish()
        await reload()
    }
}

struct UploadProgress {
    var total = 0
    var done = 0
    var added = 0
    var duplicates = 0
    var failures: [String] = []
    var isActive = false
    var summary: String?

    mutating func start(total: Int) {
        self = UploadProgress()
        self.total = total
        isActive = true
    }

    mutating func fail(_ message: String) { failures.append(message) }

    mutating func finish() {
        isActive = false
        var parts = ["\(added) added — analysing"]
        if duplicates > 0 { parts.append("\(duplicates) already in library") }
        if !failures.isEmpty { parts.append("\(failures.count) failed") }
        summary = parts.joined(separator: " · ")
    }
}

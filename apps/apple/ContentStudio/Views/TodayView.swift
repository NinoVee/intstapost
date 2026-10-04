import SwiftUI

struct TodayView: View {
    @Environment(AppModel.self) private var model
    @State private var data: TodayResponse?
    @State private var error: String?
    @State private var loading = false

    private let columns = [GridItem(.adaptive(minimum: 280), spacing: 16)]
    private let statColumns = [GridItem(.adaptive(minimum: 140), spacing: 12)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                safetyBanner
                if let error { ErrorBanner(message: error) { Task { await load() } } }

                Text("Today's content").font(.title3.bold())
                if let drafts = data?.drafts, !drafts.isEmpty {
                    LazyVGrid(columns: columns, spacing: 16) {
                        ForEach(drafts) { draft in
                            DraftCardView(draft: draft) { await load() }
                        }
                    }
                } else if data != nil {
                    emptyDrafts
                } else if loading {
                    ProgressView().frame(maxWidth: .infinity).padding()
                }

                if let stats = data?.stats {
                    Text("Media pipeline").font(.title3.bold())
                    LazyVGrid(columns: statColumns, spacing: 12) {
                        StatTile(value: stats.total, label: "In library")
                        StatTile(value: stats.today, label: "Added in last 24h")
                        StatTile(value: stats.analyzed, label: "Analysed")
                        StatTile(value: stats.pending, label: "Awaiting analysis")
                        StatTile(value: stats.duplicates, label: "Near-duplicates skipped")
                        StatTile(value: stats.unusable, label: "Unusable")
                    }
                }

                if let runs = data?.runs, !runs.isEmpty {
                    Text("Recent agent runs").font(.title3.bold())
                    VStack(spacing: 0) {
                        ForEach(runs) { run in
                            HStack(alignment: .firstTextBaseline) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(run.kind).font(.subheadline.weight(.semibold))
                                    if let summary = run.summary { Text(summary).font(.caption).foregroundStyle(.secondary) }
                                }
                                Spacer()
                                Pill(text: run.status, tone: run.status == "succeeded" ? .ok : run.status == "failed" ? .danger : .neutral)
                            }
                            .padding(.vertical, 8)
                            Divider()
                        }
                    }
                }
            }
            .padding()
            .frame(maxWidth: 1200)
            .frame(maxWidth: .infinity)
        }
        .navigationTitle("Today")
        .refreshable { await load() }
        .task { await load() }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { Task { await load() } } label: { Label("Refresh", systemImage: "arrow.clockwise") }
                    .disabled(loading)
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(Date.now.formatted(.dateTime.weekday(.wide).month(.wide).day()).uppercased())
                .font(.caption.weight(.bold)).tracking(1.2).foregroundStyle(.secondary)
            Text("\((data?.greeting ?? "Hello").uppercased()), \(model.user?.firstName ?? "")")
                .font(.largeTitle.bold())
                .minimumScaleFactor(0.6)
                .lineLimit(2)
        }
    }

    private var safetyBanner: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("AI CREATES. YOU APPROVE.").font(.subheadline.weight(.bold))
                Pill(text: (data?.publishingEnabled ?? model.publishingEnabled) ? "Publishing only after approval" : "Auto-publishing off",
                     tone: (data?.publishingEnabled ?? model.publishingEnabled) ? .warn : .ok, dot: true)
            }
            Text("Every draft is an internal draft. You post to Instagram yourself and add music there.")
                .font(.footnote).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color.accentColor.opacity(0.1), in: RoundedRectangle(cornerRadius: 14))
    }

    private var emptyDrafts: some View {
        VStack(spacing: 6) {
            Text("No drafts waiting for review").font(.headline)
            Text("Your media is being organised. Drafts will appear here once the content engine is enabled on your server.")
                .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(28)
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [5])).foregroundStyle(.tertiary))
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            data = try await model.run { try await $0.today() }
            error = nil
        } catch APIError.unauthorized {
            // AppModel already signed out.
        } catch {
            self.error = error.localizedDescription
        }
    }
}

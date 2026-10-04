import SwiftUI

struct DraftCardView: View {
    @Environment(AppModel.self) private var model
    let draft: DraftSummary
    let onChange: () async -> Void

    @State private var confirmApprove = false
    @State private var showReject = false
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            AspectTile(ratio: 4.0 / 5.0, cornerRadius: 0) { AuthorizedImage(path: draft.coverUrl) }
                .clipShape(UnevenRoundedRectangle(topLeadingRadius: 14, topTrailingRadius: 14))

            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(draft.formatLabel.uppercased()).font(.caption.weight(.heavy)).tracking(1.4)
                    Spacer()
                    Pill(text: statusLabel(draft.status), tone: draft.status == "approved" ? .ok : draft.isReviewable ? .info : .neutral, dot: true)
                }
                Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 4) {
                    GridRow { Text("Theme").foregroundStyle(.secondary); Text(draft.theme ?? "—") }
                    if draft.format == "story" || draft.format == "carousel" {
                        GridRow { Text("Slides").foregroundStyle(.secondary); Text("\(draft.slides)") }
                    }
                    if let q = draft.qualityScore {
                        GridRow { Text("Quality").foregroundStyle(.secondary); Text("\(q)/100") }
                    }
                }
                .font(.subheadline)

                HStack(spacing: 6) {
                    Pill(text: "Internal draft")
                    if draft.aiModified { Pill(text: "AI-modified", tone: .warn) }
                    if draft.containsChildren || draft.containsFamily { Pill(text: "Family — review carefully", tone: .warn) }
                }

                if let error { Text(error).font(.caption).foregroundStyle(.red) }

                if draft.isReviewable {
                    HStack {
                        Button("Approve") { confirmApprove = true }
                            .buttonStyle(.borderedProminent)
                        Button("Save for later") { Task { await decide(.saveForLater) } }
                            .buttonStyle(.bordered)
                        Button("Reject…", role: .destructive) { showReject = true }
                            .buttonStyle(.bordered)
                    }
                    .controlSize(.small)
                    .disabled(busy)
                }
                Text("Approving never publishes. You post to Instagram yourself.")
                    .font(.caption2).foregroundStyle(.secondary)
            }
            .padding(14)
        }
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 14))
        .confirmationDialog("Approve this \(draft.formatLabel.lowercased())?", isPresented: $confirmApprove, titleVisibility: .visible) {
            Button("Approve") { Task { await decide(.approve) } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This marks it ready for you to post. Nothing is published automatically.")
        }
        .sheet(isPresented: $showReject) {
            RejectSheet { reasons, comment in
                Task { await decide(.reject(reasons: reasons, comment: comment)) }
            }
        }
    }

    private func decide(_ decision: DraftDecision) async {
        busy = true
        defer { busy = false }
        do {
            try await model.run { try await $0.decide(draftId: draft.id, decision) }
            error = nil
            await onChange()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct RejectSheet: View {
    @Environment(\.dismiss) private var dismiss
    let onReject: ([RejectionReason], String?) -> Void
    @State private var selected = Set<RejectionReason>()
    @State private var comment = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Why? (helps the studio learn your taste)") {
                    ForEach(RejectionReason.allCases) { reason in
                        Toggle(reason.label, isOn: Binding(
                            get: { selected.contains(reason) },
                            set: { on in if on { selected.insert(reason) } else { selected.remove(reason) } }
                        ))
                    }
                }
                Section("Note (optional)") {
                    TextField("e.g. less filter, different song", text: $comment, axis: .vertical)
                        .lineLimit(2...4)
                }
            }
            .navigationTitle("Reject draft")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Reject", role: .destructive) {
                        let trimmed = comment.trimmingCharacters(in: .whitespacesAndNewlines)
                        onReject(RejectionReason.allCases.filter(selected.contains), trimmed.isEmpty ? nil : String(trimmed.prefix(500)))
                        dismiss()
                    }
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 380, minHeight: 460)
        #endif
    }
}

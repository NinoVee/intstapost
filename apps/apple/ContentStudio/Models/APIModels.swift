import Foundation

// Mirrors the JSON returned by the Content Studio server (apps/web/app/api/*).

struct User: Codable, Hashable {
    let id: String
    let email: String
    let displayName: String
    let timezone: String

    var firstName: String { displayName.split(separator: " ").first.map(String.init) ?? displayName }
}

struct LoginResponse: Decodable {
    let token: String
    let expiresAt: Date
    let user: User
}

struct MeResponse: Decodable {
    let user: User
    let publishingEnabled: Bool
    let maxUploadMb: Int
}

struct PipelineStats: Decodable, Hashable {
    let total: Int
    let today: Int
    let analyzed: Int
    let pending: Int
    let unusable: Int
    let duplicates: Int
}

struct AgentRun: Decodable, Identifiable, Hashable {
    let id: String
    let kind: String
    let status: String
    let createdAt: Date
    let summary: String?
}

struct DraftSummary: Decodable, Identifiable, Hashable {
    let id: String
    let format: String
    let status: String
    let theme: String?
    let qualityScore: Int?
    let aiModified: Bool
    let containsChildren: Bool
    let containsFamily: Bool
    let coverUrl: String?
    let slides: Int
    let createdAt: Date

    var isReviewable: Bool { status == "ready_for_review" }

    var formatLabel: String {
        switch format {
        case "post": return "Post"
        case "carousel": return "Carousel"
        case "story": return "Stories"
        case "reel": return "Reel"
        default: return format.capitalized
        }
    }
}

struct TodayResponse: Decodable {
    let greeting: String
    let user: User
    let publishingEnabled: Bool
    let drafts: [DraftSummary]
    let stats: PipelineStats
    let runs: [AgentRun]
}

struct MediaSummary: Decodable, Identifiable, Hashable {
    let id: String
    let kind: String
    let status: String
    let previewUrl: String?
    let durationMs: Int?
    let isRepresentative: Bool
    let clusterId: String?
    let excluded: Bool
    let technicalScore: Int?
    let isBlurry: Bool?
    let createdAt: Date

    var isVideo: Bool { kind == "video" }
    var isDimmed: Bool { !isRepresentative || excluded || status == "unusable" }
}

struct MediaListResponse: Decodable {
    let items: [MediaSummary]
    let nextBefore: Date?
}

struct Scores: Decodable, Hashable {
    let technicalScore: Int?
    let compositionScore: Int?
    let personalRelevanceScore: Int?
    let instagramPotentialScore: Int?
    let themeMatchScore: Int?
    let uniquenessScore: Int?

    /// Several separate scores — never collapsed into one number.
    var rows: [ScoreRow] {
        [
            ScoreRow(label: "Technical quality", value: technicalScore),
            ScoreRow(label: "Composition", value: compositionScore),
            ScoreRow(label: "Personal relevance", value: personalRelevanceScore),
            ScoreRow(label: "Instagram potential", value: instagramPotentialScore),
            ScoreRow(label: "Theme match", value: themeMatchScore),
            ScoreRow(label: "Uniqueness", value: uniquenessScore),
        ]
    }
}

struct ScoreRow: Identifiable, Hashable {
    let label: String
    let value: Int?
    var id: String { label }
}

struct AssetDetail: Decodable, Hashable {
    let id: String
    let kind: String
    let status: String
    let mimeType: String
    let originalFilename: String?
    let width: Int?
    let height: Int?
    let durationMs: Int?
    let sizeBytes: Int
    let capturedAt: Date?
    let hasApproxLocation: Bool
    let excluded: Bool
    let isRepresentative: Bool
    let isBlurry: Bool?
    let source: String?
    let createdAt: Date
}

struct SimilarAsset: Decodable, Identifiable, Hashable {
    let id: String
    let isRepresentative: Bool
    let previewUrl: String?
}

struct MediaDetailResponse: Decodable {
    let asset: AssetDetail
    let scores: Scores
    let previewUrl: String?
    let originalUrl: String?
    let similar: [SimilarAsset]
}

struct UploadResult: Decodable, Hashable {
    let filename: String
    let assetId: String?
    let duplicate: Bool?
    let error: String?
}

struct UploadResponse: Decodable {
    let results: [UploadResult]
}

struct APIErrorBody: Decodable {
    let error: String
    let code: String?
}

enum MediaFilter: String, CaseIterable, Identifiable {
    case all, best, duplicates, unusable, excluded
    var id: String { rawValue }
    var label: String {
        switch self {
        case .all: return "All"
        case .best: return "Best picks"
        case .duplicates: return "Near-duplicates"
        case .unusable: return "Unusable"
        case .excluded: return "Never use"
        }
    }
}

/// Must match REJECTION_REASONS in packages/core/src/brand/profile.ts.
enum RejectionReason: String, CaseIterable, Identifiable {
    case tooEdited = "too_edited"
    case badSong = "bad_song"
    case badCaption = "bad_caption"
    case wrongTheme = "wrong_theme"
    case dontLikePhoto = "dont_like_photo"
    case tooPersonal = "too_personal"
    case notFlattering = "not_flattering"
    case repetitive = "repetitive"

    var id: String { rawValue }
    var label: String {
        switch self {
        case .tooEdited: return "Too edited"
        case .badSong: return "Bad song"
        case .badCaption: return "Bad caption"
        case .wrongTheme: return "Wrong theme"
        case .dontLikePhoto: return "Don't like photo"
        case .tooPersonal: return "Too personal"
        case .notFlattering: return "Not flattering"
        case .repetitive: return "Repetitive"
        }
    }
}

enum DraftDecision {
    case approve
    case saveForLater
    case reject(reasons: [RejectionReason], comment: String?)
}

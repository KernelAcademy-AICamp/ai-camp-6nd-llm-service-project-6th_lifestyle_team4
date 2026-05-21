import Foundation

nonisolated enum WorkFormat: String, Decodable, Sendable {
    case movie
    case drama
    case play
    case musical
    case opera

    var displayName: String {
        switch self {
        case .movie: return "영화"
        case .drama: return "드라마"
        case .play: return "연극"
        case .musical: return "뮤지컬"
        case .opera: return "오페라"
        }
    }
}

nonisolated struct Work: Decodable, Hashable, Sendable {
    let title: String
    let format: WorkFormat
    let author: String?
    let releaseYear: Int?
}

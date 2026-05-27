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
    let genres: [String]
    let characters: [String]

    init(
        title: String,
        format: WorkFormat,
        author: String?,
        releaseYear: Int?,
        genres: [String] = [],
        characters: [String] = []
    ) {
        self.title = title
        self.format = format
        self.author = author
        self.releaseYear = releaseYear
        self.genres = genres
        self.characters = characters
    }

    // Explicit snake_case keys (supabase-swift's decoder does not convert keys).
    enum CodingKeys: String, CodingKey {
        case title, format, author, characters
        case releaseYear = "release_year"
        case workGenres = "work_genres"
    }

    private struct WorkGenreLink: Decodable {
        let genres: GenreName
        struct GenreName: Decodable {
            let name: String
        }
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.title = try c.decode(String.self, forKey: .title)
        self.format = try c.decode(WorkFormat.self, forKey: .format)
        self.author = try c.decodeIfPresent(String.self, forKey: .author)
        self.releaseYear = try c.decodeIfPresent(Int.self, forKey: .releaseYear)
        let links = try c.decodeIfPresent([WorkGenreLink].self, forKey: .workGenres) ?? []
        self.genres = links.map(\.genres.name)
        // characters is a jsonb array of strings; be lenient on null/odd shapes.
        self.characters = (try? c.decodeIfPresent([String].self, forKey: .characters)) ?? []
    }
}

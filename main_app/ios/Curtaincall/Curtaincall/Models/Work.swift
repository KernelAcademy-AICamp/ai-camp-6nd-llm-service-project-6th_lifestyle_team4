import Foundation

nonisolated enum WorkFormat: String, Decodable, Sendable {
    case movie
    case drama
    case play
    case musical
    case opera
    case novel
    case poem
    case essay
    case prose
    case unknown

    var displayName: String {
        switch self {
        case .movie: return "영화"
        case .drama: return "드라마"
        case .play: return "연극"
        case .musical: return "뮤지컬"
        case .opera: return "오페라"
        case .novel: return "소설"
        case .poem: return "시"
        case .essay: return "에세이"
        case .prose: return "산문"
        case .unknown: return ""
        }
    }

    /// English genre label for the original-language (ENG) view, mirroring the
    /// PWA's `GENRE_LABEL_EN`. Used so an English work line reads "Movie <…>"
    /// rather than the Korean "영화 <…>".
    var displayNameEnglish: String {
        switch self {
        case .movie: return "Movie"
        case .drama: return "Drama"
        case .play: return "Play"
        case .musical: return "Musical"
        case .opera: return "Opera"
        case .novel: return "Novel"
        case .poem: return "Poem"
        case .essay: return "Essay"
        case .prose: return "Prose"
        case .unknown: return ""
        }
    }

    /// Genre label for the chosen language (ENG falls back to the Korean label
    /// only if it has no English form, which it always does here except `.unknown`).
    func label(original: Bool) -> String {
        original ? displayNameEnglish : displayName
    }

    /// Lenient decode: an unrecognized format string maps to `.unknown` instead
    /// of throwing, so one odd row never fails the whole `[Card]` fetch.
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = WorkFormat(rawValue: raw.lowercased()) ?? .unknown
    }
}

nonisolated struct Work: Decodable, Hashable, Sendable {
    let title: String
    let subtitle: String?
    let format: WorkFormat
    let author: String?
    let releaseYear: Int?
    let genres: [String]
    let characters: [String]

    // Original-language (typically English) source fields, mirroring the PWA's
    // works.*_original columns. Optional so works without them still decode.
    let titleOriginal: String?
    let subtitleOriginal: String?
    let authorOriginal: String?

    /// First-edition cover image URL (works.cover_url). Optional; nil/non-http →
    /// the BookCover leather fallback. Read-only; no new data collection.
    let coverUrl: String?

    init(
        title: String,
        subtitle: String? = nil,
        format: WorkFormat,
        author: String?,
        releaseYear: Int?,
        genres: [String] = [],
        characters: [String] = [],
        titleOriginal: String? = nil,
        subtitleOriginal: String? = nil,
        authorOriginal: String? = nil,
        coverUrl: String? = nil
    ) {
        self.title = title
        self.subtitle = subtitle
        self.format = format
        self.author = author
        self.releaseYear = releaseYear
        self.genres = genres
        self.characters = characters
        self.titleOriginal = titleOriginal
        self.subtitleOriginal = subtitleOriginal
        self.authorOriginal = authorOriginal
        self.coverUrl = coverUrl
    }

    /// True only when an original-language work field is present.
    var hasOriginalLanguage: Bool {
        [titleOriginal, subtitleOriginal, authorOriginal].contains {
            !($0 ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
    }

    /// Title for the chosen language, falling back to the Korean title so the
    /// work line is never blank.
    func displayTitle(original: Bool) -> String {
        original ? (titleOriginal.filledValue ?? title) : title
    }

    func displaySubtitle(original: Bool) -> String? {
        original ? (subtitleOriginal.filledValue ?? subtitle) : subtitle
    }

    func displayAuthor(original: Bool) -> String? {
        original ? (authorOriginal.filledValue ?? author) : author
    }

    // Explicit snake_case keys (supabase-swift's decoder does not convert keys).
    enum CodingKeys: String, CodingKey {
        case title, subtitle, format, author, characters
        case releaseYear = "release_year"
        case workGenres = "work_genres"
        case titleOriginal = "title_original"
        case subtitleOriginal = "subtitle_original"
        case authorOriginal = "author_original"
        case coverUrl = "cover_url"
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
        self.subtitle = try c.decodeIfPresent(String.self, forKey: .subtitle)
        self.format = try c.decode(WorkFormat.self, forKey: .format)
        self.author = try c.decodeIfPresent(String.self, forKey: .author)
        self.releaseYear = try c.decodeIfPresent(Int.self, forKey: .releaseYear)
        let links = try c.decodeIfPresent([WorkGenreLink].self, forKey: .workGenres) ?? []
        self.genres = links.map(\.genres.name)
        // characters is a jsonb array of strings; be lenient on null/odd shapes.
        self.characters = (try? c.decodeIfPresent([String].self, forKey: .characters)) ?? []
        self.titleOriginal = try c.decodeIfPresent(String.self, forKey: .titleOriginal)
        self.subtitleOriginal = try c.decodeIfPresent(String.self, forKey: .subtitleOriginal)
        self.authorOriginal = try c.decodeIfPresent(String.self, forKey: .authorOriginal)
        self.coverUrl = try c.decodeIfPresent(String.self, forKey: .coverUrl)
    }
}

private extension Optional where Wrapped == String {
    /// The string if it has non-whitespace content, otherwise nil — so a blank
    /// original never wins over the Korean fallback.
    var filledValue: String? {
        guard let s = self,
              !s.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return s
    }
}

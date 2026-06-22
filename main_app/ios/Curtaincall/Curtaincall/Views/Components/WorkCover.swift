import SwiftUI
import UIKit

/// 표지 이미지 메모리 캐시 — 디코드된 UIImage 를 URL 키로 재사용해 스크롤/셀 재사용
/// 시 재다운로드·취소·깜빡임을 없앤다(AsyncImage 무캐시 문제 해결).
enum WorkCoverCache {
    static let shared = NSCache<NSURL, UIImage>()
}

/// Shared book cover. Loads the first-edition `works.cover_url` when present (http
/// only), else a deterministic leather fallback (spine + inset border + centered
/// title/subtitle/author). Mirrors Android `ui/components/BookCover` so the feed —
/// and later the library (PR-I) — render the same "book". `compact` shrinks the type
/// and radii for small cells (grid / peeking thumbnail); the post thumbnail uses it
/// with no text, so only the leather block (or image) shows.
///
/// Named `WorkCover` (not `BookCover`) because iOS already has an unrelated
/// `ArchiveView.BookCover` — the opened-book gilt front cover for a ShelfWork/VOL.
struct WorkCover: View {
    let work: Work?
    var width: CGFloat = 132
    var height: CGFloat = 188
    var compact: Bool = false

    @State private var loadedImage: UIImage?

    private let bookCream = Color(hex: 0xFAF8F2)

    private var coverURL: URL? {
        guard let s = work?.coverUrl, s.hasPrefix("http") else { return nil }
        return URL(string: s)
    }

    var body: some View {
        let radius: CGFloat = compact ? 3 : 4
        Group {
            if let loadedImage {
                Image(uiImage: loadedImage).resizable().scaledToFill()
            } else {
                leather   // 로딩 중·표지 없음 — 빈 깜빡임 없이 가죽 표시
            }
        }
        .frame(width: width, height: height)
        .clipShape(RoundedRectangle(cornerRadius: radius))
        .shadow(color: Color.black.opacity(0.24), radius: compact ? 6 : 8, x: 0, y: compact ? 3 : 6)
        // URL 바뀔 때(셀 재사용)마다 재로드. 캐시 히트면 즉시, 미스면 받아서 캐시.
        .task(id: coverURL) { await loadCover() }
    }

    /// 표지 로드 — 메모리 캐시 우선, 미스면 1회 다운로드 후 캐시. 실패/취소는 latch 하지
    /// 않아(가죽 유지) 다음 표시 때 재시도된다(AsyncImage sticky 실패·무캐시 문제 해결).
    private func loadCover() async {
        loadedImage = nil
        guard let coverURL else { return }
        if let cached = WorkCoverCache.shared.object(forKey: coverURL as NSURL) {
            loadedImage = cached
            return
        }
        do {
            let (data, _) = try await URLSession.shared.data(from: coverURL)
            guard !Task.isCancelled, let image = UIImage(data: data) else { return }
            WorkCoverCache.shared.setObject(image, forKey: coverURL as NSURL)
            loadedImage = image
        } catch {
            // 일시 오류/스크롤 취소 — 가죽 유지, 다음 표시 때 재시도(latch 안 함).
        }
    }

    private var leather: some View {
        ZStack {
            Rectangle().fill(LinearGradient(
                colors: [blend(leatherHex, 0x000000, 0.24), Color(hex: leatherHex), blend(leatherHex, 0xFFFFFF, 0.08)],
                startPoint: .leading, endPoint: .trailing
            ))
            Rectangle().fill(Color.black.opacity(0.28))
                .frame(width: compact ? 3 : 5)
                .frame(maxWidth: .infinity, alignment: .leading)
            RoundedRectangle(cornerRadius: 2)
                .stroke(Color.white.opacity(0.22), lineWidth: 0.5)
                .padding(compact ? 4 : 7)
            if !compact {
                VStack(spacing: 10) {
                    Text(work?.title ?? "—")
                        .font(.titleSerif(17)).fontWeight(.bold)
                        .foregroundStyle(bookCream)
                        .multilineTextAlignment(.center).lineLimit(4)
                    if let subtitle = work?.subtitle, !subtitle.isEmpty {
                        Text(subtitle)
                            .font(.titleSerif(12))
                            .foregroundStyle(bookCream.opacity(0.90))
                            .multilineTextAlignment(.center).lineLimit(2)
                    }
                    if let author = work?.author, !author.isEmpty {
                        Text(author)
                            .labelCaps(color: bookCream.opacity(0.78), size: 9)
                            .multilineTextAlignment(.center).lineLimit(2)
                    }
                }
                .padding(.horizontal, 14).padding(.vertical, 18)
            }
        }
    }

    private var leatherHex: UInt32 { Self.leatherColor(for: work?.title ?? "?") }

    private static func leatherColor(for title: String) -> UInt32 {
        let palette: [UInt32] = [
            0x0E0C0A, 0x5A2A24, 0x2F3A30, 0x293541,
            0x6A4A30, 0x40303B, 0x3A463F, 0x1F2A3A,
            0x4A2B1A, 0x3D2E22, 0x26393B, 0x2E2538,
        ]
        let hash = title.unicodeScalars.reduce(0) { (($0 &* 31) &+ Int($1.value)) & 0x7fffffff }
        return palette[hash % palette.count]
    }

    private func blend(_ hex: UInt32, _ target: UInt32, _ amount: Double) -> Color {
        let a = min(1, max(0, amount))
        let r = Double((hex >> 16) & 0xFF), g = Double((hex >> 8) & 0xFF), b = Double(hex & 0xFF)
        let tr = Double((target >> 16) & 0xFF), tg = Double((target >> 8) & 0xFF), tb = Double(target & 0xFF)
        return Color(red: (r + (tr - r) * a) / 255, green: (g + (tg - g) * a) / 255, blue: (b + (tb - b) * a) / 255)
    }
}

import SwiftUI

/// First-run preference picker (Android `PreferenceOverlay` / PWA preferences.js).
/// Two steps — genres (2-column card grid), then themes (or "아직 잘 모르겠어요") —
/// feeding the local `UserPrefs` that weight recommendations. Skipping finishes with
/// `any = true` (recommend broadly) and never re-prompts. UI/layout/copy only — no
/// pref_* persistence here (the caller persists via onFinish).
struct OnboardingView: View {
    /// (genres, themes, any). Called on Done or Skip.
    let onFinish: (_ genres: [String], _ themes: [String], _ any: Bool) -> Void

    @State private var step = 1
    @State private var genres: Set<String> = []
    @State private var themes: Set<String> = []
    @State private var any = false

    // `en` shown under the Korean label; `full` spans the full grid width (산문).
    private struct Genre { let ko: String; let en: String; let format: String; var full = false }
    private let genreOptions: [Genre] = [
        Genre(ko: "소설", en: "Novel", format: "novel"),
        Genre(ko: "연극(희곡)", en: "Play", format: "play"),
        Genre(ko: "에세이", en: "Essay", format: "essay"),
        Genre(ko: "오페라(대본)", en: "Opera", format: "opera"),
        Genre(ko: "산문", en: "Prose", format: "prose", full: true),
    ]

    // ko must match CardTheme category names exactly so a saved theme weights cards.
    // color = the per-theme accent bar, mirroring Android's PrefTheme colors.
    private struct Theme { let ko: String; let kw: String; let color: Color }
    private let themeOptions: [Theme] = [
        Theme(ko: "관계·사랑", kw: "사랑 · 연애 · 가족 · 우정", color: Color(hex: 0xC75D4A)),
        Theme(ko: "상실·애도", kw: "죽음 · 이별 · 그리움 · 애도", color: Color(hex: 0x5E6B7A)),
        Theme(ko: "자기·정체성", kw: "자아 · 성장 · 자존 · 양심", color: Color(hex: 0xB98A3E)),
        Theme(ko: "결단·행동", kw: "결심 · 선택 · 복수 · 저항", color: Color(hex: 0xA64238)),
        Theme(ko: "세계관·환멸", kw: "권력 · 사회 · 운명 · 진실", color: Color(hex: 0x4A5240)),
        Theme(ko: "욕망·집착", kw: "욕망 · 유혹 · 소유 · 야망", color: Color(hex: 0x8E3B52)),
        Theme(ko: "시간·기억", kw: "시간 · 기억 · 추억 · 회상", color: Color(hex: 0x6E7B86)),
        Theme(ko: "희망·구원", kw: "희망 · 구원 · 믿음 · 치유", color: Color(hex: 0xC99A2E)),
        Theme(ko: "삶·일상", kw: "삶 · 노동 · 생계 · 생존", color: Color(hex: 0x7A6A52)),
        Theme(ko: "정서 상태", kw: "불안 · 분노 · 공허 · 권태", color: Color(hex: 0x88736B)),
    ]

    private var canAdvance: Bool {
        step == 1 ? !genres.isEmpty : (!themes.isEmpty || any)
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            progress
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        Color.clear.frame(height: 0).id("top")
                        if step == 1 { genreStep } else { themeStep }
                    }
                    .padding(.horizontal, 24)
                    .padding(.top, 6)
                    .padding(.bottom, 24)
                }
                .onChange(of: step) { _, _ in proxy.scrollTo("top", anchor: .top) }
            }
            footer
        }
        .background(Color.paper.ignoresSafeArea())
    }

    // MARK: - Chrome

    private var header: some View {
        HStack(alignment: .center) {
            BrandWordmark()
            Spacer()
            Button {
                // Skip = recommend broadly (any), keep any genres already tapped,
                // never re-prompt. Mirrors Android's 건너뛰기.
                onFinish(Array(genres), [], true)
            } label: {
                Text("건너뛰기").font(.bodySans(13)).foregroundStyle(.walnut)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 24)
        .padding(.top, 18)
        .padding(.bottom, 12)
    }

    private var progress: some View {
        HStack(spacing: 6) {
            segment(filled: step >= 1)
            segment(filled: step >= 2)
        }
        .padding(.horizontal, 24)
    }

    private func segment(filled: Bool) -> some View {
        RoundedRectangle(cornerRadius: 3)
            .fill(filled ? Color.cta : Color.latte)
            .frame(height: 3)
    }

    // MARK: - Steps

    private var genreStep: some View {
        VStack(alignment: .leading, spacing: 0) {
            stepHead(
                num: "STEP 1 / 2",
                title: "어떤 글을 즐겨 읽으세요?",
                desc: "읽고 싶은 장르를 골라주세요. 선택한 장르의 명대사를 더 자주 만나게 돼요."
            )
            genreGrid
        }
    }

    private var themeStep: some View {
        VStack(alignment: .leading, spacing: 0) {
            stepHead(
                num: "STEP 2 / 2",
                title: "어떤 이야기에 마음이 가나요?",
                desc: "관심 가는 주제를 골라주세요."
            )
            themeList
            anyButton
        }
    }

    private func stepHead(num: String, title: String, desc: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(num)
                .font(.custom("Pretendard-Medium", size: 11))
                .tracking(11 * 0.22)
                .foregroundStyle(.cta)
            Text(title)
                .font(.titleSerif(24))
                .foregroundStyle(.espresso)
                .padding(.vertical, 8)
            Text(desc)
                .font(.bodySans(13))
                .foregroundStyle(.walnut)
                .bookLeading(size: 13)
            Text("복수 선택 가능")
                .font(.bodySans(11.5))
                .foregroundStyle(.sand)
                .padding(.top, 8)
        }
        .padding(.top, 16)
        .padding(.bottom, 4)
    }

    // MARK: - Genre grid (2-column cards; 산문 full-width)

    private var genreGrid: some View {
        let halves = genreOptions.filter { !$0.full }
        let fulls = genreOptions.filter { $0.full }
        let rows = stride(from: 0, to: halves.count, by: 2).map { i in
            Array(halves[i ..< min(i + 2, halves.count)])
        }
        return VStack(spacing: 11) {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, rowItems in
                HStack(spacing: 11) {
                    ForEach(rowItems, id: \.format) { g in
                        genreTile(g)
                    }
                    if rowItems.count == 1 { Color.clear.frame(maxWidth: .infinity) }
                }
            }
            ForEach(fulls, id: \.format) { g in
                genreTile(g)
            }
        }
        .padding(.top, 18)
    }

    private func genreTile(_ g: Genre) -> some View {
        let sel = genres.contains(g.format)
        return Button { toggle(&genres, g.format) } label: {
            ZStack(alignment: .topTrailing) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(g.ko)
                        .font(.titleSerif(18))
                        .foregroundStyle(.espresso)
                    Text(g.en.uppercased())
                        .font(.custom("Pretendard-Regular", size: 10))
                        .tracking(10 * 0.16)
                        .foregroundStyle(.sand)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.trailing, 24)   // keep the label clear of the check
                checkCircle(selected: sel, size: 21)
            }
            .padding(.horizontal, 15)
            .padding(.vertical, 16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 16).fill(sel ? Color.cta.opacity(0.08) : Color.cardWarm))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(sel ? Color.cta : Color.latte, lineWidth: 1))
            .contentShape(RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Theme list + AnyButton

    private var themeList: some View {
        VStack(spacing: 9) {
            ForEach(themeOptions, id: \.ko) { t in
                themeRow(t)
            }
        }
        .padding(.top, 18)
        // "아직 잘 모르겠어요" 선택 중엔 흐리게 + 탭 차단 (Android muted).
        .opacity(any ? 0.4 : 1)
        .allowsHitTesting(!any)
    }

    private func themeRow(_ t: Theme) -> some View {
        let sel = themes.contains(t.ko)
        return Button { toggle(&themes, t.ko) } label: {
            HStack(spacing: 13) {
                RoundedRectangle(cornerRadius: 5)
                    .fill(t.color)
                    .frame(width: 9, height: 42)
                VStack(alignment: .leading, spacing: 4) {
                    Text(t.ko)
                        .font(.titleSerif(16.5))
                        .foregroundStyle(.espresso)
                    Text(t.kw)
                        .font(.bodySans(11.5))
                        .foregroundStyle(.walnut)
                        .lineLimit(1)
                }
                Spacer()
                checkCircle(selected: sel, size: 20)
            }
            .padding(.horizontal, 15)
            .padding(.vertical, 13)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 14).fill(sel ? Color.cta.opacity(0.08) : Color.cardWarm))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(sel ? Color.cta : Color.latte, lineWidth: 1))
            .contentShape(RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
    }

    private var anyButton: some View {
        VStack(spacing: 0) {
            Hairline()
            Button {
                any.toggle()
                if any { themes.removeAll() }
            } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("아직 잘 모르겠어요")
                            .font(.custom("Pretendard-Medium", size: 14))
                            .foregroundStyle(any ? Color.paper : .espresso)
                        Text("모든 주제에서 폭넓게 추천받기")
                            .font(.bodySans(11.5))
                            .foregroundStyle(any ? .sand : .walnut)
                    }
                    Spacer()
                    if any {
                        ZStack {
                            Circle().fill(Color.highlight)
                            Image(systemName: "checkmark")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(.espresso)
                        }
                        .frame(width: 20, height: 20)
                    } else {
                        Circle().stroke(Color.sand, lineWidth: 1.5).frame(width: 20, height: 20)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 13)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 14).fill(any ? Color.espresso : Color.clear))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(any ? Color.espresso : Color.latte, lineWidth: 1.5))
                .contentShape(RoundedRectangle(cornerRadius: 14))
            }
            .buttonStyle(.plain)
            .padding(.top, 14)
        }
        .padding(.top, 14)
    }

    private func checkCircle(selected: Bool, size: CGFloat) -> some View {
        Group {
            if selected {
                ZStack {
                    Circle().fill(Color.cta)
                    Image(systemName: "checkmark")
                        .font(.system(size: size * 0.5, weight: .bold))
                        .foregroundStyle(.white)
                }
            } else {
                Circle().stroke(Color.sand, lineWidth: 1.5)
            }
        }
        .frame(width: size, height: size)
    }

    // MARK: - Footer (info + CTA + back)

    private var footer: some View {
        VStack(spacing: 0) {
            Text(infoText)
                .font(.bodySans(11.5))
                .foregroundStyle(.walnut)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.bottom, 10)
            Button {
                if step == 1 {
                    step = 2
                } else {
                    onFinish(Array(genres), Array(themes), any)
                }
            } label: {
                Text(step == 1 ? "다음" : "내 추천 받기")
                    .font(.custom("Pretendard-Medium", size: 14.5))
                    .tracking(14.5 * 0.04)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(16)
                    .background(RoundedRectangle(cornerRadius: 14).fill(canAdvance ? Color.cta : Color.sand.opacity(0.7)))
            }
            .buttonStyle(.plain)
            .disabled(!canAdvance)
            if step == 2 {
                Button { step = 1 } label: {
                    Text("← 이전")
                        .font(.bodySans(13))
                        .foregroundStyle(.walnut)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                }
                .buttonStyle(.plain)
                .padding(.top, 2)
            }
        }
        .padding(.horizontal, 24)
        .padding(.top, 14)
        .padding(.bottom, 22)
    }

    private var infoText: String {
        if step == 1 {
            return genres.isEmpty ? "장르를 1개 이상 골라주세요" : "\(genres.count)개 장르 선택됨"
        }
        if any { return "모든 주제에서 추천받아요" }
        return themes.isEmpty ? "주제를 고르거나 '상관없음'을 눌러주세요" : "\(themes.count)개 주제 선택됨"
    }

    private func toggle(_ set: inout Set<String>, _ value: String) {
        if set.contains(value) { set.remove(value) } else { set.insert(value) }
    }
}

#if DEBUG
#Preview {
    OnboardingView { _, _, _ in }
}
#endif

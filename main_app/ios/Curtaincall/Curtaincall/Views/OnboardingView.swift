import SwiftUI

/// First-run preference picker (Android `PreferenceOverlay` / PWA preferences.js).
/// Two steps — genres, then themes (or "상관없음") — feeding the local `UserPrefs`
/// that weight recommendations. Skipping finishes with `any = true` (recommend
/// broadly) and never re-prompts.
struct OnboardingView: View {
    /// (genres, themes, any). Called on Done or Skip.
    let onFinish: (_ genres: [String], _ themes: [String], _ any: Bool) -> Void

    @State private var step = 1
    @State private var genres: Set<String> = []
    @State private var themes: Set<String> = []
    @State private var any = false

    // `en` shown under the Korean label (Android onboarding genre buttons).
    private struct Genre { let ko: String; let en: String; let format: String }
    private let genreOptions: [Genre] = [
        Genre(ko: "소설", en: "Novel", format: "novel"),
        Genre(ko: "연극(희곡)", en: "Play", format: "play"),
        Genre(ko: "에세이", en: "Essay", format: "essay"),
        Genre(ko: "오페라(대본)", en: "Opera", format: "opera"),
        Genre(ko: "산문", en: "Prose", format: "prose"),
    ]

    // ko must match CardTheme category names exactly so a saved theme weights cards.
    // color = the per-theme swatch, mirroring Android's PrefTheme colors.
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
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if step == 1 { genreStep } else { themeStep }
                }
                .padding(.horizontal, 24)
                .padding(.top, 20)
                .padding(.bottom, 24)
            }
            footer
        }
        .background(Color.paper.ignoresSafeArea())
    }

    // MARK: - Chrome

    private var header: some View {
        HStack(alignment: .center) {
            Text("CURTAINCALL").labelCaps(color: .espresso, size: 12)
            Spacer()
            Button {
                // Skip = recommend broadly (any), keep any genres already tapped,
                // never re-prompt. Mirrors Android's 건너뛰기.
                onFinish(Array(genres), [], true)
            } label: {
                Text("건너뛰기").labelCaps()
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
        RoundedRectangle(cornerRadius: 2)
            .fill(filled ? Color.espresso : Color.latte)
            .frame(height: 3)
    }

    // MARK: - Steps

    private var genreStep: some View {
        VStack(alignment: .leading, spacing: 0) {
            stepHead(title: "어떤 장르를 좋아하세요?",
                     subtitle: "고른 장르의 명대사를 더 자주 만나요. (복수 선택)")
            ForEach(genreOptions, id: \.format) { g in
                selectRow(label: g.ko, caption: g.en, selected: genres.contains(g.format)) {
                    toggle(&genres, g.format)
                }
            }
        }
    }

    private var themeStep: some View {
        VStack(alignment: .leading, spacing: 0) {
            stepHead(title: "어떤 주제에 끌리시나요?",
                     subtitle: "관심 주제를 고르거나 ‘상관없음’으로 폭넓게 받아보세요.")
            selectRow(label: "상관없음", sublabel: "모든 주제에서 추천", selected: any) {
                any.toggle()
                if any { themes.removeAll() }
            }
            ForEach(themeOptions, id: \.ko) { t in
                selectRow(label: t.ko, sublabel: t.kw, swatch: t.color, selected: themes.contains(t.ko)) {
                    if any { any = false }
                    toggle(&themes, t.ko)
                }
            }
        }
    }

    private func stepHead(title: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.headlineSerif(24))
                .foregroundStyle(.espresso)
            Text(subtitle)
                .font(.bodySans(13))
                .foregroundStyle(.walnut)
                .bookLeading(size: 13)
            Spacer().frame(height: 8)
        }
    }

    // Selectable row — filled (espresso) when selected, outlined when not.
    //  - caption: small uppercase tracked line under the label (genre English).
    //  - swatch: leading vertical color bar (theme color), mirroring Android.
    private func selectRow(
        label: String,
        sublabel: String? = nil,
        caption: String? = nil,
        swatch: Color? = nil,
        selected: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(alignment: .center, spacing: 12) {
                if let swatch {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(swatch)
                        .frame(width: 7, height: 38)
                }
                VStack(alignment: .leading, spacing: 3) {
                    Text(label)
                        .font(.titleSerif(16))
                        .foregroundStyle(selected ? Color.paper : .espresso)
                    if let caption {
                        Text(caption)
                            .labelCaps(color: selected ? Color.paper.opacity(0.6) : .sand, size: 10)
                    }
                    if let sublabel {
                        Text(sublabel)
                            .font(.bodySans(12))
                            .foregroundStyle(selected ? Color.paper.opacity(0.7) : .walnut)
                            .lineLimit(1)
                    }
                }
                Spacer()
                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundStyle(selected ? Color.paper : .sand)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(selected ? Color.espresso : Color.paper)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(selected ? Color.clear : Color.latte, lineWidth: 0.5)
            )
            .contentShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
        .padding(.bottom, 10)
    }

    // MARK: - Footer (info + next/done)

    private var footer: some View {
        VStack(spacing: 12) {
            Hairline()
            Text(infoText)
                .font(.bodySans(12))
                .foregroundStyle(.walnut)
            Button {
                if step == 1 {
                    step = 2
                } else {
                    onFinish(Array(genres), Array(themes), any)
                }
            } label: {
                Text(step == 1 ? "다음" : "시작하기")
            }
            .buttonStyle(EditorialButtonStyle(.filled))
            .disabled(!canAdvance)
            .opacity(canAdvance ? 1 : 0.4)
        }
        .padding(.horizontal, 24)
        .padding(.top, 12)
        .padding(.bottom, 20)
    }

    private var infoText: String {
        if step == 1 {
            return genres.isEmpty ? "장르를 1개 이상 골라주세요" : "\(genres.count)개 장르 선택됨"
        }
        if any { return "모든 주제에서 추천받아요" }
        return themes.isEmpty ? "주제를 고르거나 ‘상관없음’을 선택하세요" : "\(themes.count)개 주제 선택됨"
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

import SwiftUI

/// 탭별 장식 고양이 자세 — Android `BottomNavBar.kt` 의 `catPose` / PWA
/// `updateBottomNavCatForView` 미러. 위치/크기 수치는 실기기에서 미세조정 가능(조정 가능).
private struct NavCatPose: Equatable {
    /// Assets.xcassets imageset 이름.
    let asset: String
    /// 화면에 그릴 높이(pt). 폭은 `scaledToFit` 으로 비율 유지.
    let height: CGFloat
    /// 가로 위치 bias: -1=좌, 0=중앙, 1=우. (Android hBias 미러)
    let hBias: CGFloat
    /// 이미지에서 'ledge 선'(바 윗면에 닿는 지점)의 위→아래 비율.
    /// 이 비율만큼이 바 위로 솟고(protrude), 나머지가 바 위에 얹힌다.
    let ledgeFraction: CGFloat
}

struct EditorialTabBar: View {
    @Binding var selection: Tab
    /// Unread-notice dot on the MY tab (Notice is no longer its own tab).
    var noticeUnread: Bool = false
    /// Called when an already-selected tab is tapped again (e.g. to pop its
    /// navigation stack back to root).
    var onReselect: ((Tab) -> Void)? = nil

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// TODAY(center) 탭을 누를 때마다 1씩 증가 → 실타래 'jiggle' 트리거.
    @State private var yarnTapCount = 0
    /// jiggle 중 실타래에 적용하는 스케일/회전.
    @State private var yarnScale: CGFloat = 1
    @State private var yarnRotation: Double = 0

    private var poseAnimation: Animation? {
        reduceMotion ? nil : .spring(response: 0.42, dampingFraction: 0.72)
    }

    /// 가장 크게 솟는 고양이 자세의 돌출량(pt). 바 위에 이만큼 '투명 여백'을 둬서
    /// safeAreaInset 이 스크롤 콘텐츠를 그만큼 위로 밀어 — 고양이가 읽을 내용을 가리지 않는다.
    /// (각 자세 height*ledgeFraction ≤ 이 값이 되도록 catPose 수치를 잡는다.)
    private static let catClearance: CGFloat = 56

    var body: some View {
        VStack(spacing: 0) {
            // 고양이 돌출용 투명 여백 — 배경(paper)을 깔지 않아 솔리드 바처럼 보이지 않고,
            // 콘텐츠는 이 위에서 끝나므로 그 아래로 스크롤되지 않는다.
            Color.clear.frame(height: Self.catClearance)
            VStack(spacing: 0) {
                Hairline()
                HStack(spacing: 0) {
                    ForEach(Tab.allCases, id: \.self) { tab in
                        Button {
                            handleTap(tab)
                        } label: {
                            tabItem(tab: tab, active: tab == selection)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 6)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .frame(height: 64)
            }
            .background(Color.paper)
        }
        // 장식 고양이 — 위 투명 여백 안에 앉아 바 윗면에 걸친다. 여백 높이만큼만 솟으므로
        // 콘텐츠 영역을 침범하지 않는다. click-through(allowsHitTesting=false)라 탭을 가리지 않음.
        .overlay { navCat }
        // 탭 전환 시 잔잔한 셀렉션 햅틱 (시스템 설정 자동 반영).
        .sensoryFeedback(.selection, trigger: selection)
    }

    // MARK: - Tap handling

    private func handleTap(_ tab: Tab) {
        if selection == tab {
            onReselect?(tab)
        } else {
            selection = tab
        }
        // TODAY(center) 를 누르면 실타래를 톡 흔든다 (재탭 포함 = '새 명대사' 신호).
        if tab.isCenter {
            yarnTapCount += 1
            jiggleYarn()
        }
    }

    /// 실타래 한 번 'jiggle' — 스프링으로 살짝 키웠다 회전했다 제자리로. Reduce Motion 시 생략.
    private func jiggleYarn() {
        guard !reduceMotion else { return }
        withAnimation(.spring(response: 0.18, dampingFraction: 0.38)) {
            yarnScale = 1.18
            yarnRotation = 12
        } completion: {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.55)) {
                yarnScale = 1
                yarnRotation = 0
            }
        }
    }

    // MARK: - Tab items

    @ViewBuilder
    private func tabItem(tab: Tab, active: Bool) -> some View {
        if tab.isCenter {
            centerItem(tab: tab, active: active)
        } else {
            standardItem(tab: tab, active: active)
        }
    }

    private func standardItem(tab: Tab, active: Bool) -> some View {
        let tint: Color = active ? .espresso : .walnut
        return VStack(spacing: 4) {
            Image(systemName: tab.iconName)
                .font(.system(size: 19, weight: .regular))
                .foregroundStyle(tint)
                .overlay(alignment: .topTrailing) {
                    if tab == .settings && noticeUnread {
                        Circle()
                            .fill(Color.cta)
                            .frame(width: 6, height: 6)
                            .offset(x: 5, y: -2)
                    }
                }
            Text(tab.title.uppercased())
                .font(.custom("Pretendard-Medium", size: 10))
                .tracking(1.6)
                .foregroundStyle(tint)
                .lineLimit(1)
                .minimumScaleFactor(0.82)
            Circle()
                .fill(active ? Color.cta : Color.clear)
                .frame(width: 4, height: 4)
        }
    }

    /// Prominent center tab (TODAY) — a raised filled medallion holding the
    /// daily-script (yarn-ball) graphic, mirroring the PWA/Android center button.
    private func centerItem(tab: Tab, active: Bool) -> some View {
        VStack(spacing: 2) {
            ZStack {
                Circle()
                    .fill(active ? Color.espresso : Color.roast)
                    .frame(width: 44, height: 44)
                    .shadow(color: Color.black.opacity(0.18), radius: 4, x: 0, y: 2)
                Image("daily-script-bar")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 30, height: 30)
                    .scaleEffect(yarnScale)
                    .rotationEffect(.degrees(yarnRotation))
            }
            .offset(y: -6)
            Text(tab.title.uppercased())
                .font(.custom("Pretendard-Medium", size: 10))
                .tracking(1.6)
                .foregroundStyle(active ? .espresso : .walnut)
                .lineLimit(1)
                .offset(y: -4)
        }
    }

    // MARK: - Decorative nav cat

    /// 선택된 탭에 따른 고양이 자세 — Android/PWA 미러.
    ///   feed=cat_pen · archive(Library)=cat_struck · daily/settings=cat_empty(코너) · 그 외=cat_today(중앙 약간 우측)
    private func catPose(for tab: Tab) -> NavCatPose {
        // 각 자세의 돌출량 = height * ledgeFraction ≤ catClearance(56pt) 이 되도록 잡는다
        // (그래야 고양이가 위 투명 여백 안에 머물고 콘텐츠를 가리지 않는다).
        switch tab {
        case .feed:
            return NavCatPose(asset: "cat_pen", height: 64, hBias: 0.92, ledgeFraction: 0.86)    // 돌출 ≈ 55
        case .archive:
            return NavCatPose(asset: "cat_struck", height: 64, hBias: 0.78, ledgeFraction: 0.86) // 돌출 ≈ 55
        case .daily, .settings:
            return NavCatPose(asset: "cat_empty", height: 52, hBias: 0.92, ledgeFraction: 0.46)  // 돌출 ≈ 24
        case .home:
            return NavCatPose(asset: "cat_today", height: 60, hBias: 0.30, ledgeFraction: 0.72)  // 돌출 ≈ 43
        }
    }

    private var navCat: some View {
        let pose = catPose(for: selection)
        return GeometryReader { geo in
            let w = geo.size.width
            // 바 윗면(hairline)은 투명 여백 아래, 즉 geo y = catClearance 지점.
            // ledge 선이 거기에 오도록: 중심 y = catClearance + height*(0.5 - ledgeFraction).
            let centerY = Self.catClearance + pose.height * (0.5 - pose.ledgeFraction)
            // bias 를 좌우 위치로: 0=중앙, ±1=가장자리에서 inset 만큼 안쪽.
            let inset: CGFloat = 44
            let centerX = w / 2 + pose.hBias * (w / 2 - inset)
            Image(pose.asset)
                .resizable()
                .scaledToFit()
                .frame(height: pose.height)
                .id(pose.asset)                                  // 자세 바뀌면 새 뷰 → 크로스페이드
                .transition(reduceMotion ? .identity : .opacity)
                .position(x: centerX, y: centerY)
        }
        .allowsHitTesting(false)                                  // click-through
        .animation(poseAnimation, value: selection)
    }
}

#Preview {
    @Previewable @State var sel: Tab = .daily
    return EditorialTabBar(selection: $sel, noticeUnread: true)
}

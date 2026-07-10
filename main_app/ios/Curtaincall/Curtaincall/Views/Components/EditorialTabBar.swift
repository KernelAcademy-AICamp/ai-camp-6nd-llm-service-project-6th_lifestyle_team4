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

extension Animation {
    /// 센터 실타래 네비 버튼 '탭' 1회 회전 스펙 — Android HomeCenterButton
    /// CubicBezierEasing(0.34, 1.4, 0.5, 1), 600ms(overshoot). (당겨서 새로고침
    /// 인디케이터는 별개 — refreshing 동안 750ms linear 연속 회전.)
    static var yarnSpin: Animation { .timingCurve(0.34, 1.4, 0.5, 1, duration: 0.6) }
}

struct EditorialTabBar: View {
    @Binding var selection: Tab
    /// Unread-notice dot on the MY tab (Notice is no longer its own tab).
    var noticeUnread: Bool = false
    /// Draw the decorative cat. The cat belongs on the tab ROOTS (Feed=open book,
    /// Library=on book stack, My Page=lying in margin, Daily/Today) — matching
    /// Android — but is hidden on pushed reading views (Card Detail has no cat).
    var showCat: Bool = true
    /// Called when an already-selected tab is tapped again (e.g. to pop its
    /// navigation stack back to root).
    var onReselect: ((Tab) -> Void)? = nil

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// 선택 로진지 글라이드용 네임스페이스 (matchedGeometryEffect).
    @Namespace private var selectionNS

    /// TODAY(center) 탭을 누를 때마다 1씩 증가 → 실타래 'jiggle' 트리거.
    @State private var yarnTapCount = 0
    /// jiggle 중 실타래에 적용하는 스케일/회전.
    @State private var yarnScale: CGFloat = 1
    @State private var yarnRotation: Double = 0

    /// 고양이 long-press 이스터에그 — 활성 시 깜짝 자세(cat_confused)로 잠깐 바뀐다.
    @State private var catEggActive = false
    /// long-press 햅틱 트리거(증가 시 soft impact).
    @State private var catEggCount = 0

    private var poseAnimation: Animation? {
        reduceMotion ? nil : .spring(response: 0.42, dampingFraction: 0.72)
    }

    /// 가장 크게 솟는 고양이 자세의 돌출량(pt). 바 위에 이만큼 '투명 여백'을 둬서
    /// safeAreaInset 이 스크롤 콘텐츠를 그만큼 위로 밀어 — 고양이가 읽을 내용을 가리지 않는다.
    /// (각 자세 height*ledgeFraction ≤ 이 값이 되도록 catPose 수치를 잡는다.)
    private static let catClearance: CGFloat = 56

    /// long-press 이스터에그용 깜짝 자세 (cat_confused). 돌출 60*0.72≈43 ≤ clearance.
    private static let catEggPose = NavCatPose(asset: "cat_confused", height: 60, hBias: 0.30, ledgeFraction: 0.72)

    // (idle 모션은 Android BottomNavBar 와 동일한 '호흡 only'(2.2s, 발끝 기준) —
    //  기존 flick 사이클은 Android 에 없어 제거. 기기 QA: 고양이 모션 크로스플랫폼 통일.)

    var body: some View {
        VStack(spacing: 0) {
            // 고양이 돌출용 투명 여백 — 배경(paper)을 깔지 않아 솔리드 바처럼 보이지 않고,
            // 콘텐츠는 이 위에서 끝나므로 그 아래로 스크롤되지 않는다. click-through 라
            // 이 여백 아래의 콘텐츠(예: 피드 글쓰기 pill) 탭을 가로채지 않는다.
            Color.clear.frame(height: Self.catClearance).allowsHitTesting(false)
            // 플로팅 필 — Android 필 네비바 미러 + iOS 글래스(26+ Liquid Glass /
            // 18-25 ultraThinMaterial 폴백). 풀-폭 솔리드 바 + 헤어라인 대신 좌우
            // 인셋 캡슐이 바닥에서 살짝 떠 있다. 고양이 ledge 선(catClearance)은
            // 그대로 필 윗면이라 자세 수치·롱프레스 캐처·코치 앵커 전부 무변경.
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
                    // .plain 이 아니라 커스텀 bare 스타일 — iOS 26 글래스 위 버튼에
                    // 시스템이 씌우는 눌림 하이라이트를 차단한다. 피드백은 은은한 딤만.
                    .buttonStyle(BareNavButtonStyle())
                    // 선택 로진지 — 네이티브 iOS 26 탭바의 회색 알약을 '우리 것'으로 재현
                    // (기기 QA: 유령 네이티브 바의 알약은 우리 버튼과 정렬 불가 → 직접
                    // 그려 항상 아이템 정중앙). 센터(TODAY)는 메달리온이 지표라 제외.
                    // matchedGeometryEffect 로 탭 전환 시 아이템 사이를 미끄러진다.
                    .background {
                        if tab == selection && !tab.isCenter {
                            Capsule()
                                .fill(Color.espresso.opacity(0.10))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 8)
                                .matchedGeometryEffect(id: "navSelection", in: selectionNS)
                        }
                    }
                    .coachAnchor(navAnchorId(tab))
                }
            }
            .frame(height: 64)
            // 로진지 글라이드 — selection 변경을 애니메이션화(matchedGeometry 이동).
            .animation(reduceMotion ? nil : .spring(response: 0.32, dampingFraction: 0.82), value: selection)
            .navPillSurface()
            // 지오메트리(라운드4, 기기 QA 눈대중 보정): 좌우 20(14 는 과폭) ·
            // 바닥 6(네이티브 iOS 탭바 높이에 근접하게 하강; 12 는 과부양).
            .padding(.horizontal, 20)
            .padding(.bottom, 6)
        }
        // 장식 고양이 — 위 투명 여백 안에 앉아 바 윗면에 걸친다. 여백 높이만큼만 솟으므로
        // 콘텐츠 영역을 침범하지 않는다. click-through(allowsHitTesting=false)라 탭을 가리지 않음.
        .overlay { if showCat { navCat } }
        // 고양이 long-press 이스터에그 캐처 — '투명 여백'(바 위쪽)에만 둔다. 그 영역엔
        // 탭 버튼이 없으므로 탭 히트테스트를 가리지 않는다(탭은 그 아래 64pt 바에 있음).
        .overlay(alignment: .top) { if showCat { catLongPressCatcher } }
        // 탭 전환 시 잔잔한 셀렉션 햅틱 (시스템 설정 자동 반영).
        .sensoryFeedback(.selection, trigger: selection)
        // 실타래 톡 — jiggle 에 '보잉' 감을 더하는 soft impact (yarnTapCount 와 동기).
        .sensoryFeedback(.impact(flexibility: .soft), trigger: yarnTapCount)
        // 고양이 long-press 이스터에그 — soft impact.
        .sensoryFeedback(.impact(flexibility: .soft), trigger: catEggCount)
    }

    /// 고양이를 길게 누르면 깜짝 자세로 바뀌고 햅틱이 울린다 — ~1초 후 원래 자세로 복귀.
    /// 캐처는 바 위 투명 여백에만 있어 탭/메달리온 히트테스트를 사실상 건드리지 않는다.
    private var catLongPressCatcher: some View {
        GeometryReader { geo in
            let pose = catPose(for: selection)
            let inset: CGFloat = 44
            let centerX = geo.size.width / 2 + pose.hBias * (geo.size.width / 2 - inset)
            Color.clear
                .frame(width: 88, height: Self.catClearance)
                .contentShape(Rectangle())
                .position(x: centerX, y: Self.catClearance / 2)   // 여백 안(바 윗면 위)에만
                .onLongPressGesture(minimumDuration: 0.45) { triggerCatEgg() }
        }
    }

    /// 이스터에그 발동 — 깜짝 자세 + soft impact, 1초 뒤 복귀. (Reduce Motion 이어도
    /// 동작하되, 자세 전환 애니메이션만 생략된다 — 사용자 의도 인터랙션이라 끄지 않는다.)
    private func triggerCatEgg() {
        guard !catEggActive else { return }
        catEggActive = true
        catEggCount += 1
        Task {
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            catEggActive = false
        }
    }

    // MARK: - Tap handling

    private func handleTap(_ tab: Tab) {
        if selection == tab {
            onReselect?(tab)
        } else {
            selection = tab
        }
        // TODAY(center) 를 누르면 실타래를 한 바퀴 돌린다 (재탭 포함 = '새 명대사' 신호).
        if tab.isCenter {
            yarnTapCount += 1
            spinYarn()
        }
    }

    /// 실타래 한 바퀴 회전 — 360°, 600ms, 살짝 튕기는(overshoot) 이징. Android HomeCenterButton
    /// (spin.animateTo(360f, tween(600, CubicBezierEasing(0.34,1.4,0.5,1)))) 미러. Reduce Motion 시 생략.
    private func spinYarn() {
        guard !reduceMotion else { return }
        yarnRotation = 0
        withAnimation(.yarnSpin) {
            yarnRotation = 360
        } completion: {
            yarnRotation = 0   // 360 ≡ 0 — 다음 탭이 0 에서 다시 돌도록 즉시 리셋(무애니).
        }
    }

    /// 코치 투어 앵커 id — 스텝은 nav_home/nav_archive/nav_feed 만 참조(나머지는 무해한 여분).
    private func navAnchorId(_ tab: Tab) -> String {
        switch tab {
        case .home: return "nav_home"
        case .archive: return "nav_archive"
        case .feed: return "nav_feed"
        case .daily: return "nav_daily"
        case .settings: return "nav_settings"
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
                // Android 아이콘 20 · 알림 도트 7 미러.
                .font(.system(size: 20, weight: .regular))
                .foregroundStyle(tint)
                .overlay(alignment: .topTrailing) {
                    if tab == .settings && noticeUnread {
                        Circle()
                            .fill(Color.cta)
                            .frame(width: 7, height: 7)
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
                // 페이퍼 백킹 링 — 메달리온이 필 위로 솟은 부분 뒤로 스크롤 콘텐츠의
                // 선(카드 테두리 등)이 그대로 지나가 '줄이 관통'해 보이던 문제(기기 QA).
                // 컷아웃 노치처럼 3pt 페이퍼 링으로 분리해 배경과 절연한다.
                Circle()
                    .fill(Color.paper)
                    .frame(width: 60, height: 60)
                Circle()
                    .fill(Color.latte)
                    .frame(width: 54, height: 54)
                    .shadow(color: Color.black.opacity(0.18), radius: 4, x: 0, y: 2)
                // 실타래가 메달리온을 가득 채우도록 fill+clip (이미지 좌우 투명 여백은 잘라낸다).
                Image("daily-script-bar")
                    .resizable()
                    .scaledToFill()
                    .frame(width: 54, height: 54)
                    .clipShape(Circle())
            }
            // jiggle 은 메달리온 전체에 적용 — fill+clip 이라 이미지만 돌리면 모서리가 비므로.
            .scaleEffect(yarnScale)
            .rotationEffect(.degrees(yarnRotation))
            // Android HomeProtrusion=16 미러 — 메달리온이 필 윗면 위로 16pt 솟도록
            // (자연 상단 겹침 ≈2pt + 오프셋 14). 라벨은 2pt 간격 유지하며 함께 올린다.
            .offset(y: -14)
            Text(tab.title.uppercased())
                .font(.custom("Pretendard-Medium", size: 10))
                .tracking(1.6)
                .foregroundStyle(active ? .cta : .espresso)
                .lineLimit(1)
                .offset(y: -12)
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
            // hBias 0.74 — LIBRARY↔MY 중간에서 MY 쪽으로 기울던 것 한 눈금 좌측(기기
            // QA 라운드4; 0.60 과이동 → 0.77 소폭 우편향 → 0.74).
            return NavCatPose(asset: "cat_struck", height: 90, hBias: 0.74, ledgeFraction: 0.86) // Android CatHeightLibrary=90
        case .daily, .settings:
            return NavCatPose(asset: "cat_empty", height: 52, hBias: 0.92, ledgeFraction: 0.46)  // 돌출 ≈ 24
        case .home:
            return NavCatPose(asset: "cat_today", height: 60, hBias: 0.30, ledgeFraction: 0.72)  // 돌출 ≈ 43
        }
    }

    private var navCat: some View {
        // long-press 이스터에그 중엔 깜짝 자세, 아니면 탭별 자세.
        let pose = catEggActive ? Self.catEggPose : catPose(for: selection)
        return GeometryReader { geo in
            let w = geo.size.width
            // 바 윗면(hairline)은 투명 여백 아래, 즉 geo y = catClearance 지점.
            // ledge 선이 거기에 오도록: 중심 y = catClearance + height*(0.5 - ledgeFraction).
            let centerY = Self.catClearance + pose.height * (0.5 - pose.ledgeFraction)
            // bias 를 좌우 위치로: 0=중앙, ±1=가장자리에서 inset 만큼 안쪽.
            let inset: CGFloat = 44
            let centerX = w / 2 + pose.hBias * (w / 2 - inset)
            idleCat(pose: pose)
                .position(x: centerX, y: centerY)
        }
        .allowsHitTesting(false)                                  // click-through
        // Android BottomNavBar 미러 — 위치·크기는 '연속 보간'(catSpring: damping 0.72),
        // 에셋은 아래 idleCat 의 280ms 크로스페이드. pose(Equatable) 하나로 트리거해
        // 모든 자세 전환이 동일한 글라이드+페이드로 움직인다(자세별 상이 거동 제거).
        .animation(poseAnimation, value: pose)
    }

    /// 고양이 이미지 — Android Crossfade(tween 280) 미러: **컨테이너 identity 는 유지**
    /// (위치·높이는 navCat 의 스프링으로 글라이드)하고, 이미지 원본만 .id 교체로
    /// 280ms 크로스페이드한다. idle 은 Android 와 동일한 '호흡 only'(2.2s, 발끝 기준
    /// 1.0↔1.03). **Reduce Motion 시 페이드·호흡 모두 비활성**(즉시 교체·정지).
    @ViewBuilder
    private func idleCat(pose: NavCatPose) -> some View {
        let crossfading = ZStack {
            Image(pose.asset)
                .resizable()
                .scaledToFit()
                .id(pose.asset)
                .transition(reduceMotion ? .identity : .opacity)
        }
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.28), value: pose.asset)
        .frame(height: pose.height)

        if reduceMotion {
            crossfading
        } else {
            crossfading.phaseAnimator([false, true]) { view, inhale in
                view.scaleEffect(inhale ? 1.03 : 1.0, anchor: .bottom)   // 호흡(발끝 기준)
            } animation: { _ in
                .easeInOut(duration: 2.2)
            }
        }
    }
}

/// iOS 26 글래스 위 버튼에 시스템이 그리는 회색 하이라이트 필 차단용 bare 스타일 —
/// 라벨만 그대로 그리고, 눌림은 은은한 딤(0.6)으로만 표시한다.
private struct BareNavButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.6 : 1)
    }
}

/// 네비 필 표면 — 형태는 Android BottomNavBar 와 동일(BarCornerRadius=28 라운드
/// 사각, 캡슐 아님). 표면만 iOS 글래스: 26+ 는 시스템 Liquid Glass(glassEffect),
/// 18-25 는 ultraThinMaterial + latte 스트로크 + 부드러운 그림자(Android
/// BarElevation=8 상당) 폴백. 콘텐츠(탭 아이템·센터 메달리온)는 클립하지 않는다 —
/// 메달리온이 필 윗면 위로 솟는 오버플로(Android HomeProtrusion=16)와 뱃지 도트가
/// 잘리지 않아야 한다.
private extension View {
    @ViewBuilder
    func navPillSurface() -> some View {
        if #available(iOS 26.0, *) {
            // 시스템 글래스가 자체 림 라이트/스펙큘러를 그리므로 스트로크·그림자 추가 없음.
            // 글래스를 '배경 레이어'로 분리 — 콘텐츠 뷰에 직접 glassEffect 를 걸면
            // 콘텐츠가 글래스 표면에 합성돼, 도형 밖으로 솟은 센터 메달리온에
            // 경계선(seam)이 그였다(기기 QA: 실타래에 줄). 배경 분리면 콘텐츠는
            // 글래스 '위'에 그려져 seam 없음. .clear = 더 투명한 변형(기기 QA:
            // .regular 는 밋밋). 스트로크·그림자는 시스템이 그림.
            self.background {
                ZStack {
                    // 페이퍼 35% 언더레이 — .clear 글래스 단독은 과투명(기기 QA '아주
                    // 약간만 불투명하게'). 바디감이 생기면 글래스 아래 시스템 그림자가
                    // '이중 필'로 읽히던 착시도 함께 줄어든다.
                    RoundedRectangle(cornerRadius: 28).fill(Color.paper.opacity(0.35))
                    Color.clear.glassEffect(.clear, in: .rect(cornerRadius: 28))
                }
            }
        } else {
            self
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 28))
                .overlay(RoundedRectangle(cornerRadius: 28).stroke(Color.latte.opacity(0.85), lineWidth: 0.5))
                .shadow(color: .black.opacity(0.12), radius: 8, x: 0, y: 4)
        }
    }
}

#Preview {
    @Previewable @State var sel: Tab = .daily
    return EditorialTabBar(selection: $sel, noticeUnread: true)
}

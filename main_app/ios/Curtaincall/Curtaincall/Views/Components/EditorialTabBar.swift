import SwiftUI
import UIKit

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
    @Environment(\.colorScheme) private var colorScheme

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
    /// 호흡(breath) **공유 위상** — 모든 고양이 레이어가 같은 값을 읽는다. 레이어마다
    /// 타임라인(phaseAnimator)을 두면 크로스페이드 도중 두 고양이의 호흡 위상이 어긋나
    /// 크기가 튀어 보인다(Android 도 breathScale 하나를 두 이미지가 함께 읽는다).
    @State private var breathIn = false

    /// 탭바 고양이 ↔ 피드 고양이 **핸드오프** 커브 — 두 레이어(EditorialTabBar.navCat 과
    /// RootView.FeedWriteCat)가 같은 값을 써야 교대가 한 동작으로 읽힌다.
    /// (자세 전환 자체는 catLayer 의 0.28 페이드가 담당한다.)
    static let catHandoffAnimation: Animation = .easeInOut(duration: 0.26)

    /// FEED 진입/이탈 시 탭바 고양이 ↔ 피드 고양이 교대 트랜지션 — **페이드만**.
    /// 한때 좌우 ±40 슬라이드를 얹어 '한 마리가 건너간' 방향감을 줬으나, 탭 전환 중
    /// 메인스레드 정체로 이동 애니메이션이 그대로 버벅였다(위 '제자리 페이드' 주석과 동일
    /// 원인). 앱 전체에서 고양이 이동 연출을 걷어내는 결정에 맞춰 페이드로 통일한다.
    static func catHandoff(reduceMotion: Bool) -> AnyTransition { .opacity }

    /// 가장 크게 솟는 고양이 자세의 돌출량(pt). 바 위에 이만큼 '투명 여백'을 둬서
    /// safeAreaInset 이 스크롤 콘텐츠를 그만큼 위로 밀어 — 고양이가 읽을 내용을 가리지 않는다.
    /// (각 자세 height*ledgeFraction ≤ 이 값이 되도록 catPose 수치를 잡는다.)
    private static let catClearance: CGFloat = 56

    // MARK: - Shared pill geometry (기기 적응)

    /// 홈 인디케이터 유무 — ⚠️ UIApplication/keyWindow 접근 금지: body 평가 중의
    /// 정적 초기화가 윈도우 레이아웃을 유발 → 같은 body 재진입 → dispatch_once
    /// 재진입 트랩(SIGTRAP) 즉사(26.5 심 셀프체크에서 검출·수정). 레이아웃을
    /// 유발하지 않는 화면 치수 휴리스틱: iOS 18+ 지원 iPhone 중 홈 버튼(safe
    /// bottom=0)은 SE 2·3세대(논리 높이 667pt)뿐 — 700pt 초과면 인디케이터 기기.
    private static let hasHomeIndicator: Bool = UIScreen.main.bounds.height > 700

    /// 필 바닥 부양 — 인디케이터 기기는 6(이미 34pt 인디케이터 지대 위), 홈 버튼
    /// 기기는 12(safe bottom=0 이라 6 은 화면 모서리에 과밀착). 기기별 눈대중 값이
    /// 아니라 safe-area 유무 기준이라 전 iPhone 에서 일관된 시각 간격이 나온다.
    // 라운드7: 필을 살짝 낮춰(6→4 / 12→10) 콘텐츠 가독 영역 확보(QA). pillTopInset
    // 파생이라 고양이·FAB·페이지 바가 함께 내려온다.
    static let barBottomMargin: CGFloat = hasHomeIndicator ? 4 : 10

    /// safe-area bottom → 필 '윗면'까지의 거리 — 필 위에 얹히는 모든 동반 요소
    /// (피드 고양이·연필 FAB·Library 페이지 바)가 이 값에서 파생해야 한다.
    /// (매직 넘버 60/78/70 하드코딩이 기기/마진 변경마다 어긋나던 문제의 단일화.)
    static let pillTopInset: CGFloat = barBottomMargin + 64

    /// long-press 이스터에그용 깜짝 자세 (cat_confused). 돌출 60*0.72≈43 ≤ clearance.
    private static let catEggPose = NavCatPose(asset: "cat_confused", height: 60, hBias: 0.30, ledgeFraction: 0.72)

    // MARK: - 자세 전환은 '제자리 페이드' 다 (글라이드 폐기, 기기 QA 결론)
    //
    // 고양이는 **이동하지 않는다.** 각 자세는 자기 자리에 고정돼 있고 전환은 불투명도 교차뿐이다.
    //
    // 왜 글라이드를 버렸나: 탭 전환은 목적지 화면의 빌드/로드가 같은 메인스레드를 점유하는
    // 순간이다(FEED 는 appear 마다 피드+북마크 재조회 — FeedView.swift). .position 이동은
    // **레이아웃 애니메이션**이라 매 프레임 메인스레드 지오메트리 재계산이 필요한데, 스레드가
    // 100ms 막히면 스프링은 첫 프레임만 그려지고 풀리는 순간 종료값으로 점프한다. 기기에서
    // "1프레임만 보이고 순간이동"으로 관측됐고(목적지가 무거울수록 심함: FEED > LIBRARY >
    // TODAY), 이동 거리를 줄이거나 커브를 바꿔도 근본 원인(스레드 정체)이 남아 재발했다.
    // 불투명도는 합성이라 렌더 서버가 이어받을 수 있어 정체에 강하다 — 프레임이 빠져도
    // '조금 급한 페이드'로 보일 뿐 깨지지 않는다.
    //
    // ⚠️ 글라이드를 되살리고 싶다면 화면 로드 비용부터 줄여야 한다(전환 애니메이션 창
    // ~300ms 동안 메인스레드를 비우기). 그 전에 이동 애니메이션을 다시 넣으면 같은 증상이
    // 그대로 재발한다. 구현 참고는 PR #192 히스토리(f63146e 이전 커밋)에 남아 있다.

    /// 페이드 레이어로 '항상' 트리에 올려둘 전체 고양이 **자세** — 왜 전부 올려두는지는
    /// navCat 주석 참조. catPose/catEggPose 에서 **자동 도출**한다: 하드코딩 목록을 두면
    /// 나중에 자세를 추가할 때 목록 갱신을 잊어 그 고양이가 영구히 안 보이는 사고가 난다.
    /// (에셋 문자열이 아니라 자세를 담는 이유: 각 레이어가 '자기 자세'의 좌표·크기에
    ///  고정돼야 제자리 페이드가 된다.)
    private static let catLayers: [NavCatPose] = {
        var out: [NavCatPose] = []
        for tab in Tab.allCases {
            let pose = EditorialTabBar.catPose(for: tab)
            if !out.contains(where: { $0.asset == pose.asset }) { out.append(pose) }
        }
        let egg = EditorialTabBar.catEggPose
        if !out.contains(where: { $0.asset == egg.asset }) { out.append(egg) }
        return out
    }()

    /// 자세 → 좌표. 각 레이어가 **자기 자세**를 넣어 제자리에 고정된다(전환은 페이드뿐).
    private static func centerX(for pose: NavCatPose, width: CGFloat) -> CGFloat {
        let inset: CGFloat = 44
        return width / 2 + pose.hBias * (width / 2 - inset)
    }
    /// 바 윗면(hairline)은 투명 여백 아래, 즉 y = catClearance 지점. ledge 선이 거기에
    /// 오도록: 중심 y = catClearance + height*(0.5 - ledgeFraction).
    private static func centerY(for pose: NavCatPose) -> CGFloat {
        catClearance + pose.height * (0.5 - pose.ledgeFraction)
    }

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
                            // 인셋 3/3(라운드6: 더 크고 '덜 눌린' 비율) + 불투명도
                            // 0.10→0.08(필 워밍과 함께 은은하게 — 기기 QA).
                            Capsule()
                                .fill(Color.espresso.opacity(0.08))
                                .padding(.horizontal, 3)
                                .padding(.vertical, 2)   // 라운드7: 세로 3→2 (로진지 살짝 키 ↑)
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
            // 바닥 barBottomMargin(인디케이터 기기 6 / 홈 버튼 기기 12 — 기기 적응).
            .padding(.horizontal, 20)
            .padding(.bottom, Self.barBottomMargin)
        }
        // 장식 고양이 — 위 투명 여백 안에 앉아 바 윗면에 걸친다. 여백 높이만큼만 솟으므로
        // 콘텐츠 영역을 침범하지 않는다. click-through(allowsHitTesting=false)라 탭을 가리지 않음.
        // ⚠️ 여기에 .ignoresSafeArea(.keyboard) 를 걸지 말 것: navCat 은 GeometryReader
        // + .position 이라 ignore 가 오히려 GR 의 bounds 를 키보드 애니메이션의 함수로
        // 만들어 고양이가 '독립적으로' 움직인다(한 번 시도했다 롤백). 고양이 고정은
        // 바 자체의 프레임 안정으로 해결한다 — RootView 의 overlay(bottom) + 탐욕
        // 프레임 + keyboard-ignore 호스팅 참조. 바가 안 움직이면 고양이도 공짜로 고정.
        // FEED 진입/이탈만은 '같은 고양이의 이동'이 아니다 — FEED 고양이는 PR #76 결정에
        // 따라 RootView 의 FeedWriteCat(별도 온-톱 레이어, 화면 좌측 끝)이 담당하므로
        // 여기서는 showCat 이 false 가 되어 navCat 이 트리에서 통째로 빠진다. 즉 보간할
        // 대상이 없어 위 스프링이 개입할 수 없고, 아무 처치도 없으면 툭 사라졌다 툭
        // 나타난다(기기 QA: "DAILY→FEED, MY→FEED 는 글라이드가 없다").
        // → 두 레이어에 **방향이 맞물리는** 슬라이드+페이드를 걸어 '왼쪽으로 넘겨주는'
        // 핸드오프로 읽히게 한다. navCat 은 왼쪽으로 빠지고(왼쪽에서 들어오고),
        // FeedWriteCat 은 오른쪽에서 들어온다(오른쪽으로 빠진다) — RootView 참조.
        .overlay {
            ZStack {
                if showCat { navCat.transition(Self.catHandoff(reduceMotion: reduceMotion)) }
            }
            .animation(reduceMotion ? nil : Self.catHandoffAnimation, value: showCat)
        }
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
            let pose = Self.catPose(for: selection)
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
                // 라떼 헤일로 — 노치 틈으로 배경이 비쳐 다크에서 공 둘레가 '검은 테'로
                // 읽히던 문제(기기 QA). Android 센터 버튼의 라떼 서클(다크=브라운) 미러.
                // 라운드7: 더 얇게(QA) → 56pt(가시 1pt). 노치 홀도 54(r27) 동반 축소 —
                // 헤일로가 항상 1pt 겹침으로 홀을 꽉 채워야 배경 틈(다크 검은 선)이
                // 재발하지 않는다(헤일로 = 노치홀+2 짝 유지 필수).
                Circle()
                    .fill(Color.latte)
                    .frame(width: 56, height: 56)
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

    /// LIBRARY(cat_struck) 자세가 필 윗면 위로 솟는 실제 높이(90 × 0.86 ≈ 77pt).
    /// 이 자세는 아래 '돌출 ≤ catClearance(56)' 규칙의 **유일한 예외**(Android
    /// CatHeightLibrary=90 parity)라, 필 위층에 앉는 다른 요소(도서관 페이지 바)가 이 값
    /// 위로 피해야 한다 — 안 그러면 바의 오른쪽 화살표가 고양이 뒤에 숨는다(외부 QA Z-5,
    /// SE 실측: 화살표는 눌리지만 보이지 않았다). 하드코딩 대신 자세에서 파생해 드리프트를 막는다.
    static var libraryCatProtrusion: CGFloat {
        let pose = catPose(for: .archive)
        return pose.height * pose.ledgeFraction
    }

    /// 선택된 탭에 따른 고양이 자세 — Android/PWA 미러.
    ///   feed=cat_pen · archive(Library)=cat_struck · daily/settings=cat_empty(코너) · 그 외=cat_today(중앙 약간 우측)
    private static func catPose(for tab: Tab) -> NavCatPose {
        // 각 자세의 돌출량 = height * ledgeFraction ≤ catClearance(56pt) 이 되도록 잡는다
        // (그래야 고양이가 위 투명 여백 안에 머물고 콘텐츠를 가리지 않는다).
        switch tab {
        case .feed:
            return NavCatPose(asset: "cat_pen", height: 64, hBias: 0.92, ledgeFraction: 0.86)    // 돌출 ≈ 55
        case .archive:
            // hBias 0.74 — LIBRARY↔MY 중간에서 MY 쪽으로 기울던 것 한 눈금 좌측(기기
            // QA 라운드4; 0.60 과이동 → 0.77 소폭 우편향 → 0.74).
            // hBias 1.0 — 페이지 바 내용이 **가운데 정렬**(Spacer 없는 HStack, 총 240pt)이라
            // 오른쪽 화살표는 화면 끝이 아니라 x≈272~316 에 있다. 0.74 일 때 고양이(폭 54.5pt,
            // 306×505 비율)가 x≈282~337 로 그 화살표를 정통으로 덮었다(외부 QA Z-5).
            // 끝으로 밀면 x≈322~376 이 되어 겹침 0 — 화면 끝까지 16.7pt 여유가 남는다.
            // height 90→78: SE(375pt)에선 1.0 에서도 3.8pt 모자라서 폭을 함께 줄인다.
            // 부수 효과로 돌출 90×0.86=77 → 67 이 되어 catClearance(56) 불변식에도 가까워진다.
            return NavCatPose(asset: "cat_struck", height: 78, hBias: 1.0, ledgeFraction: 0.86)
        case .daily, .settings:
            return NavCatPose(asset: "cat_empty", height: 52, hBias: 0.92, ledgeFraction: 0.46)  // 돌출 ≈ 24
        case .home:
            return NavCatPose(asset: "cat_today", height: 60, hBias: 0.30, ledgeFraction: 0.72)  // 돌출 ≈ 43
        }
    }

    private var navCat: some View {
        // long-press 이스터에그 중엔 깜짝 자세, 아니면 탭별 자세.
        let pose = catEggActive ? Self.catEggPose : Self.catPose(for: selection)
        return GeometryReader { geo in
            let w = geo.size.width
            // ⚠️ 전체 에셋을 '항상' 스택에 올려두고 보이는 것만 opacity 1 로 고른다.
            //
            // 왜: 예전엔 Image 에 .id(pose.asset) + .transition(.opacity) 를 걸어 자세가
            // 바뀔 때 view identity 를 교체했다. SwiftUI 는 이를 insert/remove 로 처리하고,
            // **remove 되는 레이어는 레이아웃에서 빠져 컨테이너의 이동 애니메이션을 따라가지
            // 못한다.** 결과: 나가는 고양이는 옛 자리에 그대로 멈춘 채 페이드아웃하고, 들어오는
            // 고양이는 '거의 투명한 상태로' 새 자리까지 날아간다 → 사용자에겐 "사라졌다가 다시
            // 나타난다"로 보였다(기기 QA 지적: Android 는 나는데 iOS 는 안 난다).
            //
            // Android 는 animateFloatAsState(bias)/animateDpAsState(height·protrusion) 를
            // Crossfade **내부**에서 읽어, 나가는 이미지와 들어오는 이미지가 같은 좌표를
            // 공유하며 함께 날아간다(BottomNavBar.kt: biasAnim/protrusionAnim + tween 280).
            // identity 를 고정하면 같은 구조가 된다 — 나가는 레이어도 살아 있으므로 위치
            // 스프링을 함께 타고, 두 레이어의 불투명도 합이 항상 ~1 이라 '이동 중인 위치'에
            // 언제나 고양이가 보인다. 이게 그 '스르륵 나는' 느낌의 정체다.
            ZStack {
                ForEach(Self.catLayers, id: \.asset) { layer in
                    // 각 레이어는 **자기 자세의 좌표에 고정**된다(현재 자세를 따라가지 않는다).
                    // 그래서 전환할 게 불투명도밖에 없고, 애니메이션할 지오메트리가 아예 없다.
                    // 위치를 레이어별로 잡는 또 다른 이유(Android 주석과 동일): ZStack 에
                    // 걸면 박스가 '가장 넓은 자세' 기준으로 커져 좁은 고양이가 밀린다.
                    catLayer(layer: layer, current: pose.asset)
                        .position(x: Self.centerX(for: layer, width: w),
                                  y: Self.centerY(for: layer))
                }
            }
            // 호흡 구동 — .task(id:)라 showCat 토글로 사라졌다 돌아와도 다시 시작한다
            // (onAppear + repeatForever 는 재등장 시 정지된 채 남는 함정이 있다).
            .task(id: reduceMotion) {
                guard !reduceMotion else { return }
                breathIn = false
                withAnimation(.easeInOut(duration: 2.2).repeatForever(autoreverses: true)) {
                    breathIn = true
                }
            }
        }
        .allowsHitTesting(false)                                  // click-through
        // 위치·크기 스프링 없음 — 각 레이어가 자기 좌표·크기에 고정이라 애니메이션할
        // 지오메트리 자체가 없다(메인스레드 부담 0). 전환은 catLayer 의 불투명도뿐.
    }

    /// 고양이 한 레이어 — Android Crossfade 내부의 Image 미러. 전체 에셋이 각각 한 레이어로
    /// 상주하고(navCat 주석 참조), 현재 자세만 불투명하다.
    ///
    /// 모디파이어 순서가 핵심이다: `.animation(…, value: pose.asset)` 을 `.frame(height:)`
    /// **아래(=안쪽)** 에 둬서 280ms 트윈이 '페이드만' 담당하게 하고, 크기·위치는 그대로
    /// navCat 의 스프링을 타게 한다. 순서를 바꾸면 크기까지 트윈이 가로채 글라이드가 죽는다.
    /// idle 호흡은 공유 위상(breathIn, 2.2s, 발끝 기준 1.0↔1.03)을 읽는다.
    /// **Reduce Motion 시 페이드·호흡 모두 비활성**(즉시 교체·정지).
    private func catLayer(layer: NavCatPose, current: String) -> some View {
        Image(layer.asset)
            .resizable()
            .scaledToFit()
            .opacity(layer.asset == current ? 1 : 0)
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.28), value: current)
            .frame(height: layer.height)     // 자기 자세의 크기로 고정 — 애니메이션 없음
            // 호흡(발끝 기준)은 **보이는 레이어만** 애니메이션한다. 예전엔 5개 레이어가
            // 각자 repeatForever 스케일을 돌려 항상 5개의 트랜스폼이 틱하고 있었다 —
            // 탭 전환처럼 메인스레드가 빠듯한 순간에 그대로 경쟁 비용이 된다.
            // 안 보이는 레이어는 값이 고정(1.0)이라 애니메이션 자체가 생기지 않는다.
            .scaleEffect(layer.asset == current && breathIn ? 1.03 : 1.0, anchor: .bottom)
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

/// 필 도형 — Android BarCornerRadius=28 라운드 사각에서 상단 중앙, 실타래 메달리온
/// 자리만큼 원형 노치를 뺀 형태(Android/PWA '컷아웃 노치' 룩). 글래스 림 하이라이트가
/// 공 둘레를 따라 휘어 지나가므로, 백킹 링 없이도 라인이 공을 관통하지 않는다.
/// 노치 원 중심 = 메달리온 중심과 동일: 공 54pt 가 필 위로 16pt 돌출(HomeProtrusion)
/// → 중심은 필 윗면에서 11pt 아래. 반경 27 = 공 지름 54 와 동일 — ⚠️ 라떼
/// 헤일로(56pt, centerItem)와 짝: 홀(54)을 헤일로가 1pt 겹침으로 채우는 관계 유지.
struct NotchedPillShape: Shape {
    func path(in rect: CGRect) -> Path {
        let pill = Path(roundedRect: rect, cornerRadius: 28)
        let r: CGFloat = 27
        let notch = Path(ellipseIn: CGRect(x: rect.midX - r, y: 11 - r, width: r * 2, height: r * 2))
        return pill.subtracting(notch)
    }
}

/// 네비 필 표면 — 형태는 NotchedPillShape(위 참조). 표면: 26+ 는 시스템 Liquid
/// Glass(glassEffect), 18-25 는 ultraThinMaterial + latte 스트로크 + 그림자 폴백.
/// 콘텐츠(탭 아이템·센터 메달리온)는 클립하지 않는다 — 메달리온 오버플로와 뱃지
/// 도트가 잘리지 않아야 한다.
private extension View {
    @ViewBuilder
    func navPillSurface() -> some View {
        if #available(iOS 26.0, *) {
            // 시스템 글래스가 자체 림 라이트/스펙큘러를 그리므로 스트로크·그림자 추가 없음.
            // 글래스를 '배경 레이어'로 분리 — 콘텐츠에 직접 걸면 도형 밖 메달리온에
            // 합성 seam 이 그였다(기기 QA). .clear = 투명 변형.
            self.background {
                ZStack {
                    // 라떼 30% 언더레이(기존 paper 35%) — 필이 크림 배경 위에서
                    // '하얗게' 떠 보이던 문제(기기 QA) 워밍. 라떼(웜 베이지)가
                    // 글래스 밝힘을 상쇄해 페이지 크림과 한 톤으로 가라앉는다.
                    NotchedPillShape().fill(Color.latte.opacity(0.30))
                    Color.clear.glassEffect(.clear, in: NotchedPillShape())
                }
            }
        } else {
            self
                .background(.ultraThinMaterial, in: NotchedPillShape())
                .overlay(NotchedPillShape().stroke(Color.latte.opacity(0.85), lineWidth: 0.5))
                .shadow(color: .black.opacity(0.12), radius: 8, x: 0, y: 4)
        }
    }
}

#Preview {
    @Previewable @State var sel: Tab = .daily
    return EditorialTabBar(selection: $sel, noticeUnread: true)
}

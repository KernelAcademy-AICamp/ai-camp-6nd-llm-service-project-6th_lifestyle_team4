import Combine
import SwiftUI

/// Interactive spotlight onboarding tour — a SwiftUI port of Android `CoachTour.kt`
/// (itself a port of the PWA onboarding.js coachmark). Dims the screen, cuts a
/// spotlight hole over a real on-screen element, shows a numbered badge + tooltip,
/// and advances when the highlighted element is tapped (or 건너뛰기 to skip).
///
/// Cross-screen: the overlay lives at the app root (RootView) so it survives tab
/// switches and detail pushes; each screen publishes its element frames via
/// `.coachAnchor(_:)`, and the controller drives navigation between screens through
/// registered action handlers (openDetail / saveHighlight / setFeedToday /
/// openFeedComposer). Steps whose anchor never appears are skipped, matching Android.
///
/// Gated: navigation + gesture + animation → device-QA before merge. Spotlight
/// perch/anchor offsets are tuned on device.

// MARK: - Step model

struct CoachStep: Identifiable {
    let anchorId: String?
    let scr: String
    var n: Int
    var tot: Int
    let title: String
    let desc: String
    var final = false
    var cta: String? = nil
    /// Run `controller.performAction(action)` when the spotlight is tapped.
    var action: String? = nil
    /// Advance immediately after the action (false = the action host advances later,
    /// e.g. after a highlight is saved).
    var advanceAfterAction = true
    /// Pass touches through to the real element (the 구절 하이라이트 step) and advance
    /// when a selection is made, rather than swallowing the tap.
    var advanceOnSelect = false
    /// Member-only step (feed composer) — dropped for anonymous users.
    var requiresMember = false

    var id: String { "\(scr)|\(title)|\(anchorId ?? "final")" }
}

/// n/tot are placeholders here — `numberedSteps` recomputes them per screen so
/// dropping a member step (feed composer) renumbers the 피드 group cleanly.
let TOUR_STEPS: [CoachStep] = [
    // ── 홈 ──
    CoachStep(anchorId: "nav_home", scr: "홈", n: 1, tot: 4, title: "HOME",
              desc: "여기가 홈이에요. 매일 새로운 고전 명대사 한 장이 도착해요. 홈 탭을 다시 누르면 다른 명대사로 바뀌어요."),
    CoachStep(anchorId: "today_bookmark", scr: "홈", n: 2, tot: 4, title: "북마크해 두기",
              desc: "마음에 들었다면 이 책갈피를 탭하세요. 나중에 다시 꺼내볼 수 있어요."),
    CoachStep(anchorId: "nav_archive", scr: "홈", n: 3, tot: 4, title: "내 서재(LIBRARY)",
              desc: "북마크한 명대사는 여기 LIBRARY에 작품별 책으로 모여요."),
    CoachStep(anchorId: "today_read", scr: "홈", n: 4, tot: 4, title: "전문 읽으러 가기",
              desc: "한 줄만으론 아쉽죠. 이 버튼을 누르면 그 장면 전체가 펼쳐져요.", action: "openDetail"),
    // ── 전문(상세) ──
    CoachStep(anchorId: "detail_scene", scr: "전문", n: 1, tot: 5, title: "장면 설명(SCENE)",
              desc: "이 명대사가 언제·어떤 상황에서 나온 말인지 먼저 짚어줘요."),
    CoachStep(anchorId: "detail_script", scr: "전문", n: 2, tot: 5, title: "명대사가 나온 장면",
              desc: "그 장면의 대본을 그대로 옮겼어요. 명대사를 맥락 속에서 읽어보세요."),
    CoachStep(anchorId: "detail_significance", scr: "전문", n: 3, tot: 5, title: "작품의 의의",
              desc: "이 작품이 왜 오래 사랑받는 고전인지, 그 의미까지 담았어요."),
    CoachStep(anchorId: "detail_script", scr: "전문", n: 4, tot: 5, title: "구절 하이라이트",
              desc: "대본에서 마음에 닿는 문장을 길게 눌러 보세요. 노란 형광펜으로 표시되며 그 구절을 하이라이트할 수 있어요.",
              advanceOnSelect: true),
    CoachStep(anchorId: "detail_hl_button", scr: "전문", n: 5, tot: 5, title: "하이라이트 추가",
              desc: "선택하면 오른쪽 아래에 뜨는 이 [하이라이트 추가] 버튼을 누르면 나만의 하이라이트로 저장돼요.",
              action: "saveHighlight", advanceAfterAction: false),
    // ── 피드 ──
    CoachStep(anchorId: "nav_feed", scr: "피드", n: 1, tot: 3, title: "피드에 담겼어요",
              desc: "저장한 하이라이트는 여기 FEED에 모여요. 다른 독자들의 명장면도 함께 볼 수 있어요."),
    CoachStep(anchorId: "feed_today_chip", scr: "피드", n: 2, tot: 3, title: "나의 감상평",
              desc: "이 ‘나의 감상평’ 탭을 눌러보세요. 북마크한 명대사에 짧은 한 줄 감상을 남기는 곳이에요.",
              action: "setFeedToday"),
    CoachStep(anchorId: "feed_fab", scr: "피드", n: 3, tot: 3, title: "한 줄 남기기",
              desc: "이제 오른쪽 아래 + 버튼을 눌러보세요. 북마크한 명대사를 골라 나의 감상평을 남길 수 있어요.",
              action: "openFeedComposer", requiresMember: true),
    // ── 마침 ──
    CoachStep(anchorId: nil, scr: "", n: 0, tot: 0, title: "오늘의 명대사",
              desc: "준비 끝!\n이제 오늘의 고전 명작을 만나러 가볼까요?", final: true, cta: "읽으러 가기"),
]

/// Renumber each screen group so a dropped member step doesn't leave a gap
/// (mirrors Android `numberedSteps`).
private func numberedSteps(_ steps: [CoachStep]) -> [CoachStep] {
    var totals: [String: Int] = [:]
    for s in steps where !s.final && !s.scr.isEmpty { totals[s.scr, default: 0] += 1 }
    var seen: [String: Int] = [:]
    return steps.map { step in
        guard !step.final, !step.scr.isEmpty else { return step }
        var s = step
        let n = (seen[step.scr] ?? 0) + 1
        seen[step.scr] = n
        s.n = n
        s.tot = totals[step.scr] ?? step.tot
        return s
    }
}

// MARK: - Controller

@MainActor
final class CoachController: ObservableObject {
    @Published var active = false
    @Published var index = 0
    @Published var pending = false
    @Published var memberActionsEnabled = true
    /// Element frames in the "coachRoot" coordinate space, keyed by anchor id.
    @Published var anchors: [String: CGRect] = [:]

    private var actionHandlers: [String: () -> Void] = [:]

    /// The actual today card the user sees (set from HomeView), so the tour opens
    /// its detail directly — not via a separate, possibly-stale pool lookup.
    var tourCard: Card?
    /// Host hooks: run a step action, and clean up on finish/skip.
    var onAction: ((String) -> Void)?
    var onEnd: (() -> Void)?

    var steps: [CoachStep] {
        numberedSteps(TOUR_STEPS.filter { memberActionsEnabled || !$0.requiresMember })
    }
    var current: CoachStep? { steps.indices.contains(index) ? steps[index] : nil }

    func configure(memberActionsEnabled: Bool) {
        self.memberActionsEnabled = memberActionsEnabled
        if index > steps.count - 1 { index = max(0, steps.count - 1) }
    }
    func requestStart() { pending = true }
    func start() { pending = false; index = 0; active = true }
    func next() { if index < steps.count - 1 { index += 1 } else { end() } }
    func prev() { if index > 0 { index -= 1 } }
    func end() { active = false; index = 0; pending = false; onEnd?() }

    func setActionHandler(_ action: String, _ handler: (() -> Void)?) {
        actionHandlers[action] = handler
    }
    func performAction(_ action: String) {
        if let h = actionHandlers[action] { h() } else { onAction?(action) }
    }
}

// MARK: - Anchor plumbing

/// Collects `.coachAnchor(_:)` frames into one dictionary at the root.
struct CoachAnchorKey: PreferenceKey {
    static var defaultValue: [String: CGRect] = [:]
    static func reduce(value: inout [String: CGRect], nextValue: () -> [String: CGRect]) {
        value.merge(nextValue()) { _, new in new }
    }
}

/// 앵커 프레임 발행 전역 게이트 — 투어가 돌지 않을 때 스크롤 안 앵커(홈·카드 상세)가
/// 매 프레임 global frame preference 를 발행 → RootView 리렌더 → 글래스 필 재합성으로
/// 스크롤이 버벅였다(기기 QA: TODAY·카드 상세). RootView 가 `coach.active` 를 주입하고,
/// 비활성 시 모든 앵커가 상수 빈 값을 내 전파 비용이 0 이 된다. 기본 true(프리뷰 안전).
private struct CoachAnchorsActiveKey: EnvironmentKey {
    static let defaultValue = true
}

extension EnvironmentValues {
    var coachAnchorsActive: Bool {
        get { self[CoachAnchorsActiveKey.self] }
        set { self[CoachAnchorsActiveKey.self] = newValue }
    }
}

private struct CoachAnchorModifier: ViewModifier {
    let id: String
    let active: Bool
    @Environment(\.coachAnchorsActive) private var anchorsActive

    func body(content: Content) -> some View {
        content.background(
            GeometryReader { geo in
                Color.clear.preference(
                    key: CoachAnchorKey.self,
                    value: (active && anchorsActive) ? [id: geo.frame(in: .global)] : [:]
                )
            }
        )
    }
}

extension View {
    /// Publish this view's frame in **global (screen) coordinates** under `id` so the
    /// tour can spotlight it. Global — not a named space — so it aligns with the
    /// overlay's `.ignoresSafeArea()` geometry (both measured from the screen top-left);
    /// a safe-area-relative space would offset every hole by the top inset. `active`
    /// lets a caller drop the anchor when hidden. 발행 자체는 `coachAnchorsActive`
    /// 환경 게이트(투어 중에만 true — RootView 주입)와 AND 된다.
    func coachAnchor(_ id: String, active: Bool = true) -> some View {
        modifier(CoachAnchorModifier(id: id, active: active))
    }
}

// MARK: - Overlay

struct CoachTourOverlay: View {
    @ObservedObject var controller: CoachController
    @State private var pulse: CGFloat = 0
    @State private var screenH: CGFloat = 0

    /// Fixed dim — light enough that the screen behind stays recognizable while the
    /// spotlight still reads (device QA: 0.68 was too dark to tell what screen you're on).
    private let scrim = Color(hex: 0x0E0C0A).opacity(0.45)
    private let pad: CGFloat = 8
    private let holeRadius: CGFloat = 12
    private let ringMaxInset: CGFloat = 8

    var body: some View {
        if controller.active, let step = controller.current {
            ZStack {
                // Scrim + spotlight + badge — full-screen layer aligned to the .global anchors.
                GeometryReader { proxy in
                    let size = proxy.size
                    let hole = holeRect(for: step)
                    ZStack(alignment: .topLeading) {
                        scrimLayer(hole: hole).allowsHitTesting(false)
                        interactionLayer(step: step, hole: hole, size: size)
                        if let hole { ringLayer(hole) }
                        if let hole { badgeLayer(step, hole, size, tooltipAtTop: tooltipAtTop(step)) }
                    }
                    .frame(width: size.width, height: size.height)
                    // Glide the spotlight between targets on step change (slick, iOS-native spring).
                    .animation(.spring(response: 0.45, dampingFraction: 0.82), value: controller.index)
                    .onAppear { screenH = size.height }
                    .onChange(of: size.height) { _, h in screenH = h }
                }
                .ignoresSafeArea()

                // Tooltip in a SAFE-AREA-respecting layer → auto-clears the notch & home
                // indicator (no manual inset math). Cross-fades on each step change.
                tooltipContainer(step: step)
                    .id(controller.index)
                    .transition(.opacity)
                    .animation(.easeInOut(duration: 0.25), value: controller.index)
            }
            .transition(.opacity)
            .onAppear { startPulse() }
            .task(id: controller.index) { await skipIfAnchorMissing(step) }
        }
    }

    // MARK: Layers

    @ViewBuilder
    private func scrimLayer(hole: CGRect?) -> some View {
        Rectangle()
            .fill(scrim)
            .overlay {
                if let hole {
                    RoundedRectangle(cornerRadius: holeRadius)
                        .frame(width: hole.width, height: hole.height)
                        .position(x: hole.midX, y: hole.midY)
                        .blendMode(.destinationOut)
                }
            }
            .compositingGroup()
    }

    /// Touch layer: block stray controls without disabling the whole overlay.
    /// advanceOnSelect keeps the spotlight target usable (script long-press → highlight);
    /// other steps swallow touches and advance on a tap in the hole. Either way the
    /// tooltip (drawn above this) stays interactive.
    @ViewBuilder
    private func interactionLayer(step: CoachStep, hole: CGRect?, size: CGSize) -> some View {
        if step.advanceOnSelect {
            // Pass the hole through to the real script; block only around it. Advance
            // is driven by the host observing the selection (not a tap here).
            touchBlockers(hole: hole, size: size)
        } else {
            Color.clear
                .frame(width: size.width, height: size.height)
                .contentShape(Rectangle())
                .gesture(
                    SpatialTapGesture().onEnded { v in
                        guard !step.final, let hole, hole.contains(v.location) else { return }
                        advance(step)
                    }
                )
        }
    }

    /// Four rects around the hole that consume touches, leaving the hole open — SwiftUI
    /// has no non-rectangular hit region (mirrors Android `TouchBlockersAround`).
    @ViewBuilder
    private func touchBlockers(hole: CGRect?, size: CGSize) -> some View {
        if let hole {
            let l = min(max(hole.minX, 0), size.width)
            let t = min(max(hole.minY, 0), size.height)
            let r = min(max(hole.maxX, 0), size.width)
            let b = min(max(hole.maxY, 0), size.height)
            ZStack(alignment: .topLeading) {
                blocker(x: 0, y: 0, w: size.width, h: t)                 // above
                blocker(x: 0, y: b, w: size.width, h: size.height - b)   // below
                blocker(x: 0, y: t, w: l, h: b - t)                      // left
                blocker(x: r, y: t, w: size.width - r, h: b - t)         // right
            }
            .frame(width: size.width, height: size.height, alignment: .topLeading)
        } else {
            Color.clear
                .frame(width: size.width, height: size.height)
                .contentShape(Rectangle())
                .gesture(DragGesture(minimumDistance: 0))
        }
    }

    private func blocker(x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat) -> some View {
        let cw = max(w, 0), ch = max(h, 0)
        return Color.clear
            .frame(width: cw, height: ch)
            .contentShape(Rectangle())
            .position(x: x + cw / 2, y: y + ch / 2)
            .gesture(DragGesture(minimumDistance: 0))   // consume tap/drag/long-press
    }

    private func ringLayer(_ hole: CGRect) -> some View {
        let inset = ringMaxInset * pulse
        return RoundedRectangle(cornerRadius: holeRadius + inset)
            .stroke(Color.cta.opacity(0.85 * (1 - pulse)), lineWidth: 2)
            .frame(width: hole.width + inset * 2, height: hole.height + inset * 2)
            .position(x: hole.midX, y: hole.midY)
            .allowsHitTesting(false)
    }

    private func badgeLayer(_ step: CoachStep, _ hole: CGRect, _ size: CGSize, tooltipAtTop: Bool) -> some View {
        let d: CGFloat = 30
        let bx = min(max(hole.minX - d * 0.5, 6), size.width - d - 6)
        // Put the badge on the hole edge AWAY from the tooltip so the bubble never covers it:
        // tooltip on top → badge at the hole's bottom-left; tooltip on bottom → top-left.
        let rawY = tooltipAtTop ? (hole.maxY - d * 0.5) : (hole.minY - d * 0.5)
        let by = min(max(rawY, 6), size.height - d - 6)
        return ZStack {
            Circle().fill(Color.cta)
            Text("\(step.n)")
                .font(.system(size: 15, weight: .black))
                .foregroundStyle(.white)
        }
        .frame(width: d, height: d)
        .position(x: bx + d / 2, y: by + d / 2)
        .allowsHitTesting(false)
    }

    /// Tooltip laid out with alignment in a safe-area-respecting layer (not `.position`),
    /// so it always sits fully inside the safe area — top zone clears the notch, bottom
    /// zone clears the home indicator — without any manual inset math. Two stable zones
    /// (top / bottom) chosen from the target's on-screen position so the bubble and '다음'
    /// don't chase the target: target in the bottom half → bubble on top; else above the
    /// tab bar. Final/anchorless: centered.
    @ViewBuilder
    private func tooltipContainer(step: CoachStep) -> some View {
        let placeAtTop = tooltipAtTop(step)
        let canPrev = !step.final && controller.index > 0
            && controller.steps[controller.index - 1].scr == step.scr
        let card = CoachTooltip(
            step: step,
            canPrev: canPrev,
            onPrev: { controller.prev() },
            onNext: { advance(step) },
            onEnd: { controller.end() },
            onCta: { controller.end() }
        )
        .padding(.horizontal, 16)

        VStack(spacing: 0) {
            if step.final {
                Spacer(minLength: 0); card; Spacer(minLength: 0)
            } else if placeAtTop {
                card.padding(.top, 8)
                Spacer(minLength: 0)
            } else {
                Spacer(minLength: 0)
                // 필 윗면(pillTopInset) + 2pt — 하드코딩 72 는 SE(pillTopInset 76)에서
                // 필 위로 4pt 겹쳤다(셀프체크 리뷰 지적). 파생값으로 기기 자동 추종.
                card.padding(.bottom, EditorialTabBar.pillTopInset + 2)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: Helpers

    /// Step progression shared by the spotlight-hole tap and the tooltip "다음" button:
    /// run the step's action (if any), then advance unless the action host advances later.
    private func advance(_ step: CoachStep) {
        if let action = step.action { controller.performAction(action) }
        if step.advanceAfterAction { controller.next() }
    }

    private func holeRect(for step: CoachStep) -> CGRect? {
        guard !step.final, let id = step.anchorId, let r = controller.anchors[id] else { return nil }
        return r.insetBy(dx: -pad, dy: -pad)
    }

    /// Tooltip sits at the top when the target is in the bottom half. Shared by the tooltip
    /// layout and the badge (badge goes on the opposite hole edge so the bubble never covers it).
    private func tooltipAtTop(_ step: CoachStep) -> Bool {
        let maxY = step.anchorId.flatMap { controller.anchors[$0] }?.maxY
        return !step.final && screenH > 0 && (maxY ?? 0) > screenH * 0.5
    }

    private func startPulse() {
        pulse = 0
        withAnimation(.linear(duration: 1.5).repeatForever(autoreverses: false)) { pulse = 1 }
    }

    /// A step whose target never appears is skipped after a short wait (PWA/Android parity).
    private func skipIfAnchorMissing(_ step: CoachStep) async {
        guard !step.final, let id = step.anchorId else { return }
        var waited = 0
        while waited < 1500, controller.anchors[id] == nil {
            try? await Task.sleep(nanoseconds: 100_000_000)
            waited += 100
        }
        if controller.active, controller.current?.id == step.id, controller.anchors[id] == nil {
            controller.next()
        }
    }
}

// MARK: - Tooltip

private struct CoachTooltip: View {
    let step: CoachStep
    var canPrev: Bool = false
    let onPrev: () -> Void
    let onNext: () -> Void
    /// End the whole tour (explicit "투어 종료" / final-card skip).
    let onEnd: () -> Void
    let onCta: () -> Void

    var body: some View {
        VStack(alignment: step.final ? .center : .leading, spacing: 0) {
            Text((step.final ? "사용법" : "사용법 · \(step.scr)"))
                .labelCaps(color: .cta)
                .multilineTextAlignment(step.final ? .center : .leading)
            Spacer().frame(height: step.final ? 14 : 8)
            Text(step.title)
                .font(.titleSerif(step.final ? 26 : 19))
                .fontWeight(.bold)
                .foregroundStyle(.espresso)
                .multilineTextAlignment(step.final ? .center : .leading)
            Spacer().frame(height: step.final ? 16 : 7)
            Text(step.desc)
                .font(.bodySans(step.final ? 16 : 14))
                .foregroundStyle(.walnut)
                .lineSpacing(step.final ? 5 : 2)   // 부제는 한 덩어리로 — 줄 간격 좁게
                .fixedSize(horizontal: false, vertical: true)
                .multilineTextAlignment(step.final ? .center : .leading)

            if step.final {
                Spacer().frame(height: 24)
                Button(action: onCta) {
                    Text(step.cta ?? "읽으러 가기")
                        .font(.titleSerif(18))
                        .foregroundStyle(.paper)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 18)
                        .background(RoundedRectangle(cornerRadius: 12).fill(Color.espresso))
                }
                .buttonStyle(.plain)
                Spacer().frame(height: 14)
                Button(action: onEnd) { Text("건너뛰기").labelCaps() }
                    .buttonStyle(.plain)
            } else {
                Spacer().frame(height: 8)
                Text("강조된 곳을 탭하거나 ‘다음’으로 넘어가세요")
                    .font(.bodySans(12))
                    .fontWeight(.medium)
                    .foregroundStyle(.cta)
                Spacer().frame(height: 12)
                // 내비게이션 — 이전 / 단계 표시 / 다음. '다음'은 스포트라이트 홀 탭과 동일 진행.
                HStack(spacing: 12) {
                    if canPrev {
                        Button(action: onPrev) { Text("이전").labelCaps() }
                            .buttonStyle(.plain)
                    }
                    Text("\(step.scr) \(step.n) / \(step.tot)").labelCaps()
                    Spacer()
                    Button(action: onNext) {
                        Text("다음")
                            .font(.custom("Pretendard-Medium", size: 13))
                            .foregroundStyle(.paper)
                            .padding(.horizontal, 18)
                            .padding(.vertical, 8)
                            .background(Capsule().fill(Color.espresso))
                    }
                    .buttonStyle(.plain)
                }
                Spacer().frame(height: 8)
                // '투어 종료'는 별도 줄(작게)로 유지 — '다음' 옆에 붙이면 오터치로 투어가 끊길
                // 위험이 커서 분리(간격만 좁혀 컴팩트하게).
                Button(action: onEnd) { Text("투어 종료").labelCaps() }
                    .buttonStyle(.plain)
                    .frame(maxWidth: .infinity, alignment: .center)
            }
        }
        .frame(maxWidth: .infinity, alignment: step.final ? .center : .leading)
        .padding(.horizontal, step.final ? 30 : 18)
        .padding(.top, step.final ? 30 : 16)
        .padding(.bottom, step.final ? 30 : 11)
        .background(
            RoundedRectangle(cornerRadius: step.final ? 20 : 14).fill(Color.paper)
        )
        .overlay(
            RoundedRectangle(cornerRadius: step.final ? 20 : 14).stroke(Color.latte, lineWidth: 0.5)
        )
    }
}

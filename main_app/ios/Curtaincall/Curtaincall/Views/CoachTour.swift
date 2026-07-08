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

extension View {
    /// Publish this view's frame (in the root "coachRoot" space) under `id` so the
    /// tour can spotlight it. `active` lets a caller drop the anchor when hidden.
    func coachAnchor(_ id: String, active: Bool = true) -> some View {
        background(
            GeometryReader { geo in
                Color.clear.preference(
                    key: CoachAnchorKey.self,
                    value: active ? [id: geo.frame(in: .named("coachRoot"))] : [:]
                )
            }
        )
    }
}

// MARK: - Overlay

struct CoachTourOverlay: View {
    @ObservedObject var controller: CoachController
    @State private var pulse: CGFloat = 0
    @State private var tipHeight: CGFloat = 0

    /// Fixed dark dim (PWA rgba(14,12,10,0.68)) — theme-independent.
    private let scrim = Color(hex: 0x0E0C0A).opacity(0.68)
    private let pad: CGFloat = 8
    private let holeRadius: CGFloat = 12
    private let ringMaxInset: CGFloat = 8

    var body: some View {
        if controller.active, let step = controller.current {
            GeometryReader { proxy in
                let size = proxy.size
                let hole = holeRect(for: step)
                ZStack(alignment: .topLeading) {
                    // Visual only — never intercepts touches (interaction is its own layer).
                    scrimLayer(hole: hole)
                        .allowsHitTesting(false)
                    // Touch handling. Sits BELOW the tooltip so 건너뛰기/CTA stay tappable
                    // in every step, including the advanceOnSelect (구절 하이라이트) step.
                    interactionLayer(step: step, hole: hole, size: size)
                    if let hole { ringLayer(hole) }
                    if let hole { badgeLayer(step, hole, size) }
                    tooltipLayer(step, hole, size)
                }
                .frame(width: size.width, height: size.height)
            }
            .ignoresSafeArea()
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
                        if let action = step.action { controller.performAction(action) }
                        if step.advanceAfterAction { controller.next() }
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

    private func badgeLayer(_ step: CoachStep, _ hole: CGRect, _ size: CGSize) -> some View {
        let d: CGFloat = 30
        let bx = min(max(hole.minX - d * 0.5, 6), size.width - d - 6)
        let by = min(max(hole.minY - d * 0.5, 6), size.height - d - 6)
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

    private func tooltipLayer(_ step: CoachStep, _ hole: CGRect?, _ size: CGSize) -> some View {
        let gap: CGFloat = 18
        let edge: CGFloat = 16
        let belowTarget = (hole?.midY ?? 0) < size.height / 2
        let tipY: CGFloat = {
            if step.final || hole == nil { return max((size.height - tipHeight) / 2, edge) }
            if belowTarget { return min(hole!.maxY + gap, size.height - tipHeight - edge) }
            return max(hole!.minY - tipHeight - gap, edge)
        }()
        return CoachTooltip(step: step,
                            onSkip: { controller.end() },
                            onCta: { controller.end() })
            .background(
                GeometryReader { g in
                    Color.clear.preference(key: TipHeightKey.self, value: g.size.height)
                }
            )
            .onPreferenceChange(TipHeightKey.self) { tipHeight = $0 }
            .padding(.horizontal, 16)
            .frame(width: size.width)
            .position(x: size.width / 2, y: tipY + tipHeight / 2)
    }

    // MARK: Helpers

    private func holeRect(for step: CoachStep) -> CGRect? {
        guard !step.final, let id = step.anchorId, let r = controller.anchors[id] else { return nil }
        return r.insetBy(dx: -pad, dy: -pad)
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

private struct TipHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

// MARK: - Tooltip

private struct CoachTooltip: View {
    let step: CoachStep
    let onSkip: () -> Void
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
                .bookLeading(size: step.final ? 16 : 14)
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
                Button(action: onSkip) { Text("건너뛰기").labelCaps() }
                    .buttonStyle(.plain)
            } else {
                Spacer().frame(height: 12)
                Text("✋ 강조된 버튼을 눌러보세요")
                    .font(.bodySans(12))
                    .fontWeight(.medium)
                    .foregroundStyle(.cta)
                Spacer().frame(height: 14)
                HStack {
                    Text("\(step.scr) \(step.n) / \(step.tot)").labelCaps()
                    Spacer()
                    Button(action: onSkip) { Text("건너뛰기").labelCaps() }
                        .buttonStyle(.plain)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: step.final ? .center : .leading)
        .padding(.horizontal, step.final ? 30 : 18)
        .padding(.vertical, step.final ? 30 : 16)
        .background(
            RoundedRectangle(cornerRadius: step.final ? 20 : 14).fill(Color.paper)
        )
        .overlay(
            RoundedRectangle(cornerRadius: step.final ? 20 : 14).stroke(Color.latte, lineWidth: 0.5)
        )
    }
}

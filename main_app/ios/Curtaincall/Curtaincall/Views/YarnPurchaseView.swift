import SwiftUI

/// 상단바 실타래 잔액 칩 — Android `YarnChip` / PWA yarn chip 미러.
/// 작은 라운드 알약(sand 35%), 실타래 아이콘 + 잔액. 탭 → 충전 화면.
struct YarnChip: View {
    let balance: Int
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                Image("daily-script-bar")
                    .resizable()
                    .scaledToFill()
                    .frame(width: 15, height: 15)
                    .clipShape(Circle())
                Text("\(balance)")
                    .font(.custom("Pretendard-Medium", size: 12))
                    .foregroundStyle(.espresso)
            }
            .padding(.horizontal, 9)
            .padding(.vertical, 4)
            .background(Capsule().fill(Color.sand.opacity(0.35)))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("실타래 \(balance)개, 충전하기")
    }
}

/// 실타래 충전 화면 — 티어 목록 + "준비 중" 안내. 결제(StoreKit) 없이 grant_yarn 으로
/// 즉시 충전하는 mock (PWA `renderYarnTiers` / Android YarnPurchaseScreen 미러).
struct YarnPurchaseView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var yarn: YarnStore
    @State private var toast: String?
    @State private var purchasing = false
    /// 충전 탭(false) ↔ ABOUT 탭(true) — Android `aboutTab` 미러.
    @State private var aboutTab = false

    var body: some View {
        VStack(spacing: 0) {
            topBar
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Spacer().frame(height: 20)
                    if aboutTab {
                        aboutContent
                    } else {
                        chargeContent
                    }
                    Spacer().frame(height: 40)
                }
                .padding(.horizontal, 20)
            }
        }
        .background(Color.paper)
        .overlay(alignment: .bottom) {
            if let toast {
                Text(toast)
                    .font(.bodySans(13))
                    .foregroundStyle(.paper)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 12)
                    .background(Capsule().fill(Color.espresso))
                    .padding(.bottom, 40)
                    .transition(.opacity)
            }
        }
    }

    // Android: 탭 라벨(충전/ABOUT)을 상단 바 안에 둔다(별도 타이틀 없음).
    // 명조 굵은 글자체가 없어 선택 강조는 Pretendard Medium↔Regular 굵기 + 색 대비.
    private var topBar: some View {
        HStack(spacing: 4) {
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .regular))
                    .foregroundStyle(.espresso)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            Spacer()
            tabLabel("충전", selected: !aboutTab) { aboutTab = false }
            tabLabel("ABOUT", selected: aboutTab) { aboutTab = true }
        }
        .padding(.horizontal, 8)
        .frame(height: 44)
        .background(Color.paper)
        .overlay(alignment: .bottom) { Hairline() }
    }

    private func tabLabel(_ text: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(text)
                .font(.custom(selected ? "Pretendard-Medium" : "Pretendard-Regular", size: 12))
                .tracking(1.2)
                .foregroundStyle(selected ? Color.espresso : Color.walnut)
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
        }
        .buttonStyle(.plain)
    }

    // 충전 탭 본문(Android ChargeContent): 제목·설명 + 보유 실타래 박스 +
    // 안내 노트(yarn_daily_note) + 티어 목록 + 결제 준비중 고지.
    private var chargeContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("실타래")
                .font(.displaySerif(32))
                .foregroundStyle(.espresso)
            Spacer().frame(height: 6)
            Text("실타래로 명장면 전문을 열람하세요")
                .font(.bodySans(13))
                .foregroundStyle(.walnut)
            Spacer().frame(height: 18)
            balanceBox
            Spacer().frame(height: 8)
            dailyNote
            Spacer().frame(height: 8)
            ForEach(YarnStore.tiers, id: \.count) { tier in
                tierRow(count: tier.count, won: tier.won)
                Hairline()
            }
            Spacer().frame(height: 16)
            purchaseDisclaimer
        }
    }

    // 보유 실타래 — Sand 0.3 박스(Android balance row): 실타래 아이콘 + 잔액.
    private var balanceBox: some View {
        HStack(spacing: 10) {
            Image("daily-script-bar")
                .resizable()
                .scaledToFill()
                .frame(width: 20, height: 20)
                .clipShape(Circle())
            Text("보유 실타래 \(yarn.balance)")
                .font(.titleSerif(18))
                .foregroundStyle(.espresso)
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color.sand.opacity(0.3)))
    }

    // Android yarn_daily_note — 결제 UI 대신 매일 출석 적립을 안내(좌측 정렬).
    private var dailyNote: some View {
        Text("매일 출석으로 실타래를 모아보세요.\n\n실타래로 나만의 공간을 꾸며보세요.")
            .font(.bodySans(13))
            .foregroundStyle(.walnut)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    // yarn_daily_note 는 결제가 실서비스인지 말하지 않으므로, 테스터에게
    // "준비 중 · 즉시 충전(mock)" 의미를 잃지 않도록 작은 고지를 유지한다.
    private var purchaseDisclaimer: some View {
        HStack(spacing: 6) {
            Image(systemName: "hourglass")
                .font(.system(size: 11, weight: .regular))
                .foregroundStyle(.walnut)
            Text("결제 기능 준비 중 · 지금은 바로 충전됩니다.")
                .font(.bodySans(11))
                .foregroundStyle(.walnut)
            Spacer()
        }
    }

    private func tierRow(count: Int, won: Int) -> some View {
        HStack(spacing: 12) {
            Image("daily-script-bar")
                .resizable()
                .scaledToFill()
                .frame(width: 28, height: 28)
                .clipShape(Circle())
            Text("실타래 \(count)개")
                .font(.titleSerif(18))
                .foregroundStyle(.espresso)
            Spacer()
            Button {
                purchase(count: count)
            } label: {
                Text("₩\(won.formatted())")
                    .font(.custom("Pretendard-Medium", size: 12))
                    .foregroundStyle(.paper)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(RoundedRectangle(cornerRadius: 6).fill(Color.cta))
            }
            .buttonStyle(.plain)
            .disabled(purchasing)
        }
        .padding(.vertical, 16)
    }

    // ABOUT 탭 — Android AboutContent 미러(제목/리드/본문/노트/아웃트로).
    // 명조엔 굵은 글자체가 없어 제목 강조는 크기로만 준다(.bold 미사용).
    private var aboutContent: some View {
        VStack(spacing: 0) {
            Text("실타래")
                .font(.displaySerif(32))
                .foregroundStyle(.espresso)
                .multilineTextAlignment(.center)
            Spacer().frame(height: 8)
            Text("DAILY SCRIPT의 화폐")
                .font(.custom("Pretendard-Medium", size: 11))
                .tracking(2.2)
                .foregroundStyle(.cta)
                .multilineTextAlignment(.center)
            Spacer().frame(height: 20)
            Text("실타래는 명대사가 포함된 명장면을 읽을 때\n지급되는 한 올입니다.")
                .font(.bodySans(16))
                .foregroundStyle(.walnut)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Spacer().frame(height: 20)
            Text("text(텍스트)의 어원은 라틴어 textere ‘짜다’. 문장은 한 올, 한 올을 엮은 것입니다.")
                .font(.bodySans(14))
                .foregroundStyle(.espresso)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(18)
                .frame(maxWidth: .infinity)
                .background(RoundedRectangle(cornerRadius: 10).fill(Color.sand.opacity(0.3)))
            Spacer().frame(height: 20)
            Text("한올의 실타래로 나만의 공간을 꾸며보세요")
                .font(.bodySans(14))
                .foregroundStyle(.walnut)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }

    private func purchase(count: Int) {
        guard !purchasing else { return }
        purchasing = true
        Task {
            let ok = await yarn.grant(count)
            showToast(ok ? "실타래 \(count)개를 충전했어요." : "충전에 실패했어요. 잠시 후 다시 시도해주세요.")
            purchasing = false
        }
    }

    private func showToast(_ msg: String) {
        withAnimation { toast = msg }
        Task {
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            withAnimation { toast = nil }
        }
    }
}

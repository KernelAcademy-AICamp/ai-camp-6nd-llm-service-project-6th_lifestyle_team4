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

    var body: some View {
        VStack(spacing: 0) {
            topBar
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Spacer().frame(height: 20)
                    header
                    Spacer().frame(height: 20)
                    preparingBanner
                    Spacer().frame(height: 8)
                    ForEach(YarnStore.tiers, id: \.count) { tier in
                        tierRow(count: tier.count, won: tier.won)
                        Hairline()
                    }
                    Spacer().frame(height: 28)
                    aboutNote
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

    private var topBar: some View {
        HStack {
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .regular))
                    .foregroundStyle(.espresso)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            Spacer()
            Text("실타래 충전").labelCaps()
            Spacer()
            // 균형용 더미(타이틀 가운데 정렬).
            Color.clear.frame(width: 44, height: 44)
        }
        .padding(.horizontal, 8)
        .frame(height: 44)
        .background(Color.paper)
        .overlay(alignment: .bottom) { Hairline() }
    }

    private var header: some View {
        HStack(spacing: 12) {
            Image("daily-script-bar")
                .resizable()
                .scaledToFill()
                .frame(width: 44, height: 44)
                .clipShape(Circle())
            VStack(alignment: .leading, spacing: 4) {
                Text("실타래")
                    .font(.displaySerif(28))
                    .foregroundStyle(.espresso)
                Text("보유 \(yarn.balance)개")
                    .font(.bodySans(14))
                    .foregroundStyle(.walnut)
            }
            Spacer()
        }
    }

    private var preparingBanner: some View {
        HStack(spacing: 8) {
            Image(systemName: "hourglass")
                .font(.system(size: 13, weight: .regular))
                .foregroundStyle(.walnut)
            Text("결제 기능은 준비 중이에요. 지금은 바로 충전됩니다.")
                .font(.bodySans(13))
                .foregroundStyle(.walnut)
            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(RoundedRectangle(cornerRadius: 8).fill(Color.sand.opacity(0.25)))
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
                    .background(Capsule().fill(Color.cta))
            }
            .buttonStyle(.plain)
            .disabled(purchasing)
        }
        .padding(.vertical, 16)
    }

    private var aboutNote: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("실타래란?").labelCaps()
            Text("실타래는 명대사 카드를 여는 데 쓰여요. 카드를 처음 열면 +1, 한 번 연 카드는 3일간 다시 무료로 볼 수 있어요.")
                .font(.bodySans(14))
                .foregroundStyle(.walnut)
                .bookLeading(size: 14)
                .fixedSize(horizontal: false, vertical: true)
        }
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

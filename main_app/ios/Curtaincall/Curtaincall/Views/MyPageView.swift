import SwiftUI

struct MyPageView: View {
    @State private var pushNotificationsOn = true

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                topBar
                userBlock
                Hairline()
                sectionHeader("일반 설정")
                pushNotificationsRow
                Hairline()
                themeSettingsRow
                Hairline()
                sectionHeader("약관 및 정보")
                termsRow
                Hairline()
                versionRow
                Hairline()
                signOutButton
            }
            .padding(.bottom, 32)
        }
        .background(Color.paperWhite)
        .toolbar(.hidden, for: .navigationBar)
    }

    private var topBar: some View {
        HStack(alignment: .center) {
            Text("Daily Script")
                .font(.editorialSerif(28, weight: .regular))
                .foregroundStyle(.inkBlack)
            Spacer()
            ZStack {
                Color.inkBlack
                Text("박")
                    .font(.system(size: 12, weight: .bold))
                    .tracking(1)
                    .foregroundStyle(.paperWhite)
            }
            .frame(width: 36, height: 36)
        }
        .padding(.horizontal, 24)
        .padding(.top, 16)
        .padding(.bottom, 32)
    }

    private var userBlock: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("박지윤")
                .font(.editorialSerif(32, weight: .semibold))
                .foregroundStyle(.inkBlack)
            Text("현대 각본의 큐레이터. 지문이 가진 조용한 힘을 믿습니다.")
                .font(.system(size: 15))
                .foregroundStyle(.onSurfaceVariant)
                .lineSpacing(2)
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 32)
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .labelCaps()
            .padding(.horizontal, 24)
            .padding(.top, 32)
            .padding(.bottom, 16)
    }

    private var pushNotificationsRow: some View {
        HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text("푸시 알림")
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(.inkBlack)
                Text("매일 아침 8시, 한 편의 각본을 받아보세요")
                    .font(.system(size: 13))
                    .foregroundStyle(.onSurfaceVariant)
            }
            Spacer()
            Toggle("", isOn: $pushNotificationsOn)
                .labelsHidden()
                .tint(.inkBlack)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 16)
    }

    private var themeSettingsRow: some View {
        Button(action: {}) {
            HStack(alignment: .center, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("테마 설정")
                        .font(.system(size: 15, weight: .regular))
                        .foregroundStyle(.inkBlack)
                    Text("시스템 기본값 (라이트)")
                        .font(.system(size: 13))
                        .foregroundStyle(.onSurfaceVariant)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .light))
                    .foregroundStyle(.onSurfaceVariant)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 16)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var termsRow: some View {
        Button(action: {}) {
            HStack(alignment: .center, spacing: 16) {
                Text("이용약관")
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(.inkBlack)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .light))
                    .foregroundStyle(.onSurfaceVariant)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 16)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var versionRow: some View {
        HStack(alignment: .center, spacing: 16) {
            Text("버전 정보")
                .font(.system(size: 15, weight: .regular))
                .foregroundStyle(.inkBlack)
            Spacer()
            Text("v2.4.0 (안정 버전)")
                .font(.system(size: 13))
                .foregroundStyle(.onSurfaceVariant)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 16)
    }

    private var signOutButton: some View {
        Button(action: {}) {
            Text("로그아웃").editorialButton(style: .outlined)
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 24)
        .padding(.top, 32)
    }
}

#Preview {
    NavigationStack { MyPageView() }
}

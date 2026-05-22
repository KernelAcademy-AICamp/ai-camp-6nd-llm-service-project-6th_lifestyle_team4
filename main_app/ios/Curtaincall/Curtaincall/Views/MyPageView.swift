import SwiftUI

struct MyPageView: View {
    @State private var pushNotificationsOn = true

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                topBar
                userBlock
                membershipStatusCard
                    .padding(.horizontal, 20)
                    .padding(.bottom, 24)
                Hairline()
                libraryRow
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
        .background(Color.paper)
        .toolbar(.hidden, for: .navigationBar)
    }

    private var topBar: some View {
        HStack(alignment: .center) {
            Text("Daily Script")
                .font(.headlineSerif(24))
                .foregroundStyle(.espresso)
            Spacer()
            ZStack {
                Color.espresso
                Text("박")
                    .font(.titleSerif(15))
                    .foregroundStyle(.paper)
            }
            .frame(width: 36, height: 36)
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 32)
    }

    private var userBlock: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("박지윤")
                .font(.displaySerif(34))
                .foregroundStyle(.espresso)
            Text("현대 각본의 큐레이터. 지문이 가진 조용한 힘을 믿어요.")
                .font(.bodySans(14))
                .foregroundStyle(.walnut)
                .bookLeading(size: 14)
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 24)
    }

    private var membershipStatusCard: some View {
        NavigationLink {
            MembershipView()
        } label: {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .firstTextBaseline) {
                    Text("무제한 노트")
                        .labelCaps(color: .highlight)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 14, weight: .light))
                        .foregroundStyle(.sand)
                }
                Text("다음 결제일 5월 27일")
                    .font(.titleSerif(18))
                    .foregroundStyle(.paper)
                Text("9,900원 / 월 · 자동 결제")
                    .font(.metaSans(12))
                    .foregroundStyle(.sand)
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 12).fill(Color.espresso)
            )
        }
        .buttonStyle(.plain)
    }

    private var libraryRow: some View {
        NavigationLink {
            LibraryView()
        } label: {
            HStack(alignment: .center, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("내 라이브러리")
                        .font(.bodySans(15))
                        .foregroundStyle(.espresso)
                    Text("저장한 노트 모아 보기")
                        .font(.metaSans(12))
                        .foregroundStyle(.walnut)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .light))
                    .foregroundStyle(.walnut)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .labelCaps()
            .padding(.horizontal, 20)
            .padding(.top, 32)
            .padding(.bottom, 16)
    }

    private var pushNotificationsRow: some View {
        HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text("푸시 알림")
                    .font(.bodySans(15))
                    .foregroundStyle(.espresso)
                Text("매일 아침 8시, 한 편의 각본을 받아보세요")
                    .font(.metaSans(12))
                    .foregroundStyle(.walnut)
            }
            Spacer()
            Toggle("", isOn: $pushNotificationsOn)
                .labelsHidden()
                .tint(.espresso)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
    }

    private var themeSettingsRow: some View {
        Button(action: {}) {
            HStack(alignment: .center, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("테마 설정")
                        .font(.bodySans(15))
                        .foregroundStyle(.espresso)
                    Text("시스템 기본값 (라이트)")
                        .font(.metaSans(12))
                        .foregroundStyle(.walnut)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .light))
                    .foregroundStyle(.walnut)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var termsRow: some View {
        Button(action: {}) {
            HStack(alignment: .center, spacing: 16) {
                Text("이용약관")
                    .font(.bodySans(15))
                    .foregroundStyle(.espresso)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .light))
                    .foregroundStyle(.walnut)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var versionRow: some View {
        HStack(alignment: .center, spacing: 16) {
            Text("버전 정보")
                .font(.bodySans(15))
                .foregroundStyle(.espresso)
            Spacer()
            Text("v2.4.0 (안정 버전)")
                .font(.metaSans(12))
                .foregroundStyle(.walnut)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
    }

    private var signOutButton: some View {
        Button(action: {}) {
            Text("로그아웃").editorialButton(style: .outlined)
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 20)
        .padding(.top, 32)
    }
}

#Preview {
    NavigationStack { MyPageView() }
}

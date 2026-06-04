import SwiftUI

struct MyPageView: View {
    @Binding var selectedTab: Tab
    @EnvironmentObject private var session: AuthSession
    @EnvironmentObject private var bookmarks: BookmarkStore
    @EnvironmentObject private var prefs: PrefsStore

    @State private var loginId = ""
    @State private var loginPassword = ""
    @State private var signUpMode = false
    @State private var showNicknameSheet = false

    var body: some View {
        VStack(spacing: 0) {
            settingsTopBar
            Hairline()
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Spacer().frame(height: 16)

                    if !session.isAnonymous {
                        HStack(alignment: .top, spacing: 12) {
                            Text(session.nickname.isEmpty ? "Signed In" : session.nickname)
                                .font(.displaySerif(32))
                                .foregroundStyle(.espresso)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            Button { showNicknameSheet = true } label: {
                                Text("프로필 편집")
                                    .font(.custom("Pretendard-Medium", size: 10))
                                    .tracking(2)
                                    .foregroundStyle(.walnut)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 7)
                                    .overlay(Rectangle().stroke(Color.walnut, lineWidth: 0.5))
                            }
                            .buttonStyle(.plain)
                        }
                        Spacer().frame(height: 10)
                        Text("매일 한 장의 명대사로 하루를 시작합니다.")
                            .font(.bodySans(12))
                            .foregroundStyle(.walnut.opacity(0.6))
                            .bookLeading(size: 12)
                        Spacer().frame(height: 16)
                        Hairline()
                    }

                    if session.isAnonymous {
                        signInBlock
                        Spacer().frame(height: 32)
                        Hairline()
                    }

                    if let msg = session.authMessage {
                        Spacer().frame(height: 12)
                        Text(msg).font(.bodySans(12)).foregroundStyle(.cta)
                    }

                    if !session.isAnonymous {
                        Spacer().frame(height: 20)
                        sectionLabel("내 활동")
                        activityRow(
                            title: "내 서재",
                            subtitle: "보관한 명대사와 작품별 책장 보기"
                        ) {
                            selectedTab = .archive
                        }
                    }

                    Spacer().frame(height: 40)
                    sectionLabel("GENERAL PREFERENCES")
                    settingRow(
                        title: "취향 추천",
                        subtitle: prefs.tasteEnabled ? tasteProfileText : "북마크 기반 맞춤 추천"
                    ) {
                        EditorialToggle(isOn: $prefs.tasteEnabled)
                    }
                    settingRow(
                        title: "Theme Settings",
                        subtitle: prefs.darkTheme ? "Dark · espresso night" : "Light · cream paper"
                    ) {
                        EditorialToggle(isOn: $prefs.darkTheme)
                    }

                    Spacer().frame(height: 40)
                    sectionLabel("LEGAL & ABOUT")
                    settingRow(title: "Terms of Service")
                    settingRow(title: "Version Info", trailingText: "v2.4.0")

                    Spacer().frame(height: 40)
                    Button {
                        Task { await session.signOut() }
                    } label: {
                        Text(session.isAnonymous ? "Reset Anonymous" : "Sign Out")
                            .editorialButton(style: .outlined)
                    }
                    .buttonStyle(.plain)
                    Spacer().frame(height: 40)
                }
                .padding(.horizontal, 20)
            }
        }
        .background(Color.paper)
        .toolbar(.hidden, for: .navigationBar)
        .sheet(isPresented: $showNicknameSheet) {
            NicknameEditor(initial: session.nickname) { newName in
                Task { await session.updateNickname(newName) }
                showNicknameSheet = false
            } onCancel: {
                showNicknameSheet = false
            }
        }
        .task { await bookmarks.load(userId: session.userId) }
        .onChange(of: session.userId) { _, newValue in
            Task { await bookmarks.load(userId: newValue) }
        }
    }

    private var tasteProfileText: String {
        guard let t = Recommend.computeTaste(bookmarks.bookmarkCards) else {
            return "아직 북마크가 없어요 — 카드를 수집하면 분석이 시작됩니다."
        }
        return String(format: "온도 %.1f · 강도 %.1f (북마크 %d개 기반)", t.avgTemperature, t.avgIntensity, t.count)
    }

    private var signInBlock: some View {
        VStack(alignment: .leading, spacing: 8) {
            Spacer().frame(height: 16)
            sectionLabel("ACCOUNT")
            Text("아이디와 비밀번호로 로그인하면 다른 기기에서도 북마크가 동기화됩니다.")
                .font(.bodySans(12))
                .foregroundStyle(.walnut)
            Spacer().frame(height: 4)
            FieldBox(placeholder: "아이디", text: $loginId)
            FieldBox(placeholder: "비밀번호", text: $loginPassword, isSecure: true)
            Button {
                Task { await session.signIn(id: loginId, password: loginPassword, signUp: signUpMode) }
            } label: {
                Text(session.authInProgress ? "⋯" : (signUpMode ? "가입" : "로그인"))
                    .editorialButton(style: .filled)
            }
            .buttonStyle(.plain)
            .disabled(session.authInProgress || loginId.isEmpty || loginPassword.isEmpty)
            Button { signUpMode.toggle() } label: {
                Text(signUpMode ? "이미 계정이 있나요? 로그인" : "계정이 없으신가요? 회원가입")
                    .labelCaps()
            }
            .buttonStyle(.plain)
        }
    }

    private var settingsTopBar: some View {
        HStack(alignment: .center) {
            Text("Daily Script")
                .font(.headlineSerif(22))
                .foregroundStyle(.espresso)
            Spacer()
            ZStack {
                Rectangle().stroke(Color.walnut, lineWidth: 0.5)
                Text(String(session.nickname.prefix(1)).uppercased().isEmpty ? "D" : String(session.nickname.prefix(1)).uppercased())
                    .labelCaps(color: .espresso)
            }
            .frame(width: 36, height: 36)
        }
        .padding(.horizontal, 20)
        .frame(height: 64)
        .background(Color.paper)
    }

    private func sectionLabel(_ text: String) -> some View {
        Text(text).labelCaps().padding(.bottom, 12)
    }

    private func activityRow(title: String, subtitle: String, action: @escaping () -> Void) -> some View {
        VStack(spacing: 0) {
            Button(action: action) {
                HStack(alignment: .center, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(title)
                            .font(.titleSerif(16))
                            .foregroundStyle(.espresso)
                        Text(subtitle)
                            .font(.bodySans(12))
                            .foregroundStyle(.walnut)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 15, weight: .regular))
                        .foregroundStyle(.walnut)
                }
                .padding(.vertical, 14)
            }
            .buttonStyle(.plain)
            Hairline()
        }
    }

    @ViewBuilder
    private func settingRow(
        title: String,
        subtitle: String? = nil,
        trailingText: String? = nil,
        @ViewBuilder trailing: () -> some View = { EmptyView() }
    ) -> some View {
        VStack(spacing: 0) {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.titleSerif(16))
                        .foregroundStyle(.espresso)
                    if let subtitle {
                        Text(subtitle)
                            .font(.bodySans(12))
                            .foregroundStyle(.walnut)
                    }
                }
                Spacer()
                if let trailingText {
                    Text(trailingText.uppercased()).labelCaps()
                } else {
                    trailing()
                }
            }
            .padding(.vertical, 18)
            Hairline()
        }
    }
}

private struct EditorialToggle: View {
    @Binding var isOn: Bool
    var body: some View {
        Button { isOn.toggle() } label: {
            ZStack(alignment: isOn ? .trailing : .leading) {
                RoundedRectangle(cornerRadius: 12)
                    .fill(isOn ? Color.espresso : Color.latte)
                Circle()
                    .fill(Color.paper)
                    .frame(width: 18, height: 18)
                    .padding(3)
            }
            .frame(width: 44, height: 24)
        }
        .buttonStyle(.plain)
    }
}

private struct FieldBox: View {
    let placeholder: String
    @Binding var text: String
    var isSecure: Bool = false

    var body: some View {
        Group {
            if isSecure {
                SecureField(placeholder, text: $text)
            } else {
                TextField(placeholder, text: $text)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled(true)
            }
        }
        .font(.bodySans(14))
        .foregroundStyle(.espresso)
        .padding(.horizontal, 14)
        .padding(.vertical, 14)
        .background(RoundedRectangle(cornerRadius: 8).fill(Color.paper))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.latte, lineWidth: 0.5))
    }
}

private struct NicknameEditor: View {
    let initial: String
    let onSave: (String) -> Void
    let onCancel: () -> Void
    @State private var draft: String

    init(initial: String, onSave: @escaping (String) -> Void, onCancel: @escaping () -> Void) {
        self.initial = initial
        self.onSave = onSave
        self.onCancel = onCancel
        _draft = State(initialValue: initial)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("이름 변경").font(.headlineSerif(22)).foregroundStyle(.espresso)
            FieldBox(placeholder: "표시할 이름", text: $draft)
            Button { draft = AuthSession.randomCuteNickname() } label: {
                Text("랜덤 이름 생성").labelCaps()
            }
            .buttonStyle(.plain)
            HStack {
                Button { onCancel() } label: {
                    Text("취소").editorialButton(style: .outlined)
                }
                .buttonStyle(.plain)
                Button { onSave(draft) } label: {
                    Text("저장").editorialButton(style: .filled)
                }
                .buttonStyle(.plain)
            }
            Spacer()
        }
        .padding(24)
        .background(Color.paper.ignoresSafeArea())
        .presentationDetents([.height(280)])
    }
}

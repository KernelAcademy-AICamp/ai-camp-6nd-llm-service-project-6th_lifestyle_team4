import SwiftUI

struct MyPageView: View {
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
                    Spacer().frame(height: 40)

                    // Identity
                    HStack(alignment: .firstTextBaseline) {
                        Text(session.isAnonymous ? "익명 독자" : (session.nickname.isEmpty ? "익명 독자" : session.nickname))
                            .font(.displaySerif(32))
                            .foregroundStyle(.espresso)
                        Spacer()
                        if !session.isAnonymous {
                            Button { showNicknameSheet = true } label: {
                                Text("EDIT").labelCaps()
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    Spacer().frame(height: 10)
                    Text("매일 한 장의 명대사로 하루를 시작합니다.")
                        .font(.bodySans(16))
                        .foregroundStyle(.walnut)
                        .bookLeading(size: 16)

                    // 로그인 상태에선 합성 이메일 대신 사람이 정한 아이디(login_id)만 노출.
                    if !session.isAnonymous, !session.loginId.isEmpty {
                        Spacer().frame(height: 6)
                        Text("아이디 · \(session.loginId)")
                            .font(.bodySans(13))
                            .foregroundStyle(.walnut)
                    }

                    if session.isAnonymous {
                        Spacer().frame(height: 28)
                        signInBlock
                    }

                    if let msg = session.authMessage {
                        Spacer().frame(height: 12)
                        Text(msg).font(.bodySans(12)).foregroundStyle(.cta)
                    }

                    Spacer().frame(height: 32)
                    Hairline()

                    Spacer().frame(height: 40)
                    sectionLabel("GENERAL PREFERENCES")
                    settingRow(title: "Push Notifications", subtitle: "Daily digest and breaking insights") {
                        EditorialToggle(isOn: $prefs.pushEnabled)
                    }
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
            ProfileEditor(
                initialNickname: session.nickname,
                initialGender: session.gender,
                initialAge: session.ageGroup
            ) { name, g, a in
                Task { await session.updateProfile(name, gender: g, ageGroup: a) }
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
            sectionLabel("SIGN IN")
            Text("아이디와 비밀번호로 로그인하면 다른 기기에서도 같은 계정을 쓸 수 있어요.")
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

            // 소셜 로그인 (Supabase OAuth — 시크릿은 대시보드에)
            Spacer().frame(height: 14)
            Text("또는 소셜 계정으로")
                .font(.bodySans(12))
                .foregroundStyle(.walnut)
            Spacer().frame(height: 10)
            // 구글 — 공식 컬러 G 로고, 흰 배경 + 회색 테두리, 둥근 모서리(10)
            Button {
                Task { await session.signInWithOAuth(.google) }
            } label: {
                HStack(spacing: 10) {
                    Image("GoogleLogo").resizable().renderingMode(.original).frame(width: 18, height: 18)
                    Text("Google로 로그인").font(.bodySans(15)).foregroundStyle(Color(red: 0.12, green: 0.12, blue: 0.12))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 13)
                .background(Color.white, in: RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(red: 0.855, green: 0.863, blue: 0.878), lineWidth: 1))
            }
            .buttonStyle(.plain)
            .disabled(session.authInProgress)
            // 카카오 — 옐로우(#FEE500) + 말풍선 심볼. 비즈앱 전까진 "준비 중"(흐림).
            Spacer().frame(height: 8)
            Button {
                session.authMessage = "카카오 로그인은 준비 중입니다."
            } label: {
                HStack(spacing: 8) {
                    Image("KakaoSymbol").resizable().renderingMode(.original).frame(width: 18, height: 18)
                    Text("카카오로 로그인 (준비 중)").font(.bodySans(15)).foregroundStyle(.black)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 13)
                .background(Color(red: 0.996, green: 0.898, blue: 0.0), in: RoundedRectangle(cornerRadius: 10))
                .opacity(0.55)
            }
            .buttonStyle(.plain)
            Spacer().frame(height: 14)
            Text("소셜 로그인은 회원 식별 및 로그인 목적으로만 사용되며, 소셜 계정의 프로필 정보는 사용하지 않습니다.")
                .font(.bodySans(12))
                .foregroundStyle(.walnut)
                .bookLeading(size: 12)
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

struct ProfileEditor: View {
    let initialNickname: String
    let initialGender: String   // "" | male | female | other
    let initialAge: String      // "" | 10s..90s
    let onSave: (String, String?, String?) -> Void
    let onCancel: () -> Void

    @State private var nickname: String
    @State private var gender: String
    @State private var age: String

    init(initialNickname: String, initialGender: String, initialAge: String,
         onSave: @escaping (String, String?, String?) -> Void, onCancel: @escaping () -> Void) {
        self.initialNickname = initialNickname
        self.initialGender = initialGender
        self.initialAge = initialAge
        self.onSave = onSave
        self.onCancel = onCancel
        _nickname = State(initialValue: initialNickname)
        _gender = State(initialValue: initialGender)
        _age = State(initialValue: initialAge)
    }

    private let genderValues = ["", "male", "female", "other"]
    private let ageValues = ["", "10s", "20s", "30s", "40s", "50s", "60s", "70s", "80s", "90s"]

    private func genderLabel(_ v: String) -> String {
        switch v {
        case "male": return "남성"
        case "female": return "여성"
        case "other": return "기타"
        default: return "선택 안 함"
        }
    }
    private func ageLabel(_ v: String) -> String { v.isEmpty ? "선택 안 함" : String(v.dropLast()) + "대" }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("프로필 편집").font(.headlineSerif(22)).foregroundStyle(.espresso)
            FieldBox(placeholder: "표시할 이름", text: $nickname)
            Button { nickname = AuthSession.randomCuteNickname() } label: {
                Text("랜덤 이름 생성").labelCaps()
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 6) {
                Text("성별 · 선택").labelCaps()
                Menu {
                    ForEach(genderValues, id: \.self) { v in
                        Button(genderLabel(v)) { gender = v }
                    }
                } label: { menuLabel(genderLabel(gender)) }
            }
            VStack(alignment: .leading, spacing: 6) {
                Text("나이대 · 선택").labelCaps()
                Menu {
                    ForEach(ageValues, id: \.self) { v in
                        Button(ageLabel(v)) { age = v }
                    }
                } label: { menuLabel(ageLabel(age)) }
            }
            Text("성별·나이대를 알려주시면 취향에 맞는 명대사를 추천해드려요. (선택 입력)")
                .font(.bodySans(12))
                .foregroundStyle(.walnut)

            HStack {
                Button { onCancel() } label: {
                    Text("취소").editorialButton(style: .outlined)
                }
                .buttonStyle(.plain)
                Button {
                    onSave(nickname, gender.isEmpty ? nil : gender, age.isEmpty ? nil : age)
                } label: {
                    Text("저장").editorialButton(style: .filled)
                }
                .buttonStyle(.plain)
            }
            Spacer()
        }
        .padding(24)
        .background(Color.paper.ignoresSafeArea())
        .presentationDetents([.medium, .large])
    }

    private func menuLabel(_ text: String) -> some View {
        HStack {
            Text(text).font(.bodySans(14)).foregroundStyle(.espresso)
            Spacer()
            Image(systemName: "chevron.down").font(.system(size: 11)).foregroundStyle(.walnut)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(RoundedRectangle(cornerRadius: 8).fill(Color.paper))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.latte, lineWidth: 0.5))
    }
}

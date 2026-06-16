import SwiftUI
import UIKit

struct MyPageView: View {
    @Binding var selectedTab: Tab
    @EnvironmentObject private var session: AuthSession
    @EnvironmentObject private var bookmarks: BookmarkStore
    @EnvironmentObject private var prefs: PrefsStore

    @State private var loginId = ""
    @State private var loginPassword = ""
    @State private var signUpMode = false
    @State private var showNicknameSheet = false
    @State private var showDeleteConfirm = false

    var body: some View {
        VStack(spacing: 0) {
            AppMasthead()
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

                    // 로그인 상태에선 합성 이메일 대신 사람이 정한 아이디(login_id)만 노출.
                    if !session.isAnonymous, !session.loginId.isEmpty {
                        Spacer().frame(height: 6)
                        Text("아이디 · \(session.loginId)")
                            .font(.bodySans(13))
                            .foregroundStyle(.walnut)
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
                        activityLink(title: "내 댓글", subtitle: "내가 남긴 댓글 보기") {
                            MyCommentsView()
                        }
                        activityLink(title: "내 피드", subtitle: "내가 쓴 한줄과 하이라이트 보기") {
                            MyFeedView()
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
                    sectionLabel("약관 및 정보")
                    legalRow(title: "공지사항") { NoticeView() }
                    legalRow(title: "이용약관") { LegalView(doc: .terms) }
                    legalRow(title: "개인정보 처리방침") { LegalView(doc: .privacy) }
                    settingRow(title: "버전 정보", trailingText: appVersion)

                    Spacer().frame(height: 40)
                    Button {
                        Task { await session.signOut() }
                    } label: {
                        Text(session.isAnonymous ? "Reset Anonymous" : "Sign Out")
                    }
                    .buttonStyle(EditorialButtonStyle(.outlined))

                    // Account deletion (App Store Guideline 5.1.1(v)). Members
                    // only, and gated behind a flag that stays OFF until the
                    // delete-account Edge Function is deployed (no non-functional
                    // control ships).
                    if FeatureFlags.accountDeletionEnabled && !session.isAnonymous {
                        Spacer().frame(height: 16)
                        Button {
                            showDeleteConfirm = true
                        } label: {
                            Text("회원 탈퇴")
                                .labelCaps(color: .cta)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                        }
                        .buttonStyle(.plain)
                        .disabled(session.authInProgress)
                    }
                    Spacer().frame(height: 40)
                    // Bottom room so the submit button can scroll clear of the
                    // keyboard (keyboard avoidance insets the scroll content).
                    Spacer().frame(height: 24)
                }
                .padding(.horizontal, 20)
                // Dismiss the keyboard on tap WITHOUT consuming the tap — a
                // simultaneousGesture fires alongside the button's own tap, so
                // the 로그인/가입 button still triggers. (A plain .onTapGesture on
                // this container swallowed the button's tap.)
                .contentShape(Rectangle())
                .simultaneousGesture(TapGesture().onEnded { dismissKeyboard() })
            }
            .scrollDismissesKeyboard(.interactively)
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
        .alert("회원 탈퇴", isPresented: $showDeleteConfirm) {
            Button("취소", role: .cancel) {}
            Button("탈퇴하기", role: .destructive) {
                Task { await session.deleteAccount() }
            }
        } message: {
            Text("계정과 모든 데이터(북마크·댓글·하트·피드)가 영구 삭제되며 되돌릴 수 없습니다.")
        }
    }

    private func dismissKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }

    /// Real app version from the bundle (CFBundleShortVersionString), so the row
    /// can never drift from the shipped build. `settingRow` upper-cases trailing
    /// text, so "v1.0" renders as "V1.0".
    private var appVersion: String {
        let v = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—"
        return "v\(v)"
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
            }
            .buttonStyle(EditorialButtonStyle(.filled))
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

    /// Like `activityRow`, but pushes a destination view onto the navigation
    /// stack (e.g. 내 댓글 → MyCommentsView) instead of switching tabs.
    private func activityLink<Destination: View>(
        title: String,
        subtitle: String,
        @ViewBuilder destination: @escaping () -> Destination
    ) -> some View {
        VStack(spacing: 0) {
            NavigationLink {
                destination()
            } label: {
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
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Hairline()
        }
    }

    /// A settings row that pushes a destination (mirrors Android's trailing-arrow
    /// rows). Matches `settingRow`'s metrics but is tappable, so the Legal docs
    /// read as navigable rather than the old dead "Terms of Service" label.
    private func legalRow<Destination: View>(
        title: String,
        @ViewBuilder destination: @escaping () -> Destination
    ) -> some View {
        VStack(spacing: 0) {
            NavigationLink {
                destination()
            } label: {
                HStack(alignment: .center, spacing: 12) {
                    Text(title)
                        .font(.titleSerif(16))
                        .foregroundStyle(.espresso)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 14, weight: .regular))
                        .foregroundStyle(.sand)
                }
                .padding(.vertical, 18)
                .contentShape(Rectangle())
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
                    Text("취소")
                }
                .buttonStyle(EditorialButtonStyle(.outlined))
                Button {
                    onSave(nickname, gender.isEmpty ? nil : gender, age.isEmpty ? nil : age)
                } label: {
                    Text("저장")
                }
                .buttonStyle(EditorialButtonStyle(.filled))
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

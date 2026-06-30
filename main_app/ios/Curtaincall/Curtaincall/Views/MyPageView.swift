import SwiftUI
import UIKit
import AuthenticationServices

/// 설정 내비게이션 스택에 push 되는 라우트(값 기반). 값 기반이라야 settingsPath 가
/// 추적해 MY 탭 재탭 시 popToRoot(스택 비우기)로 한 번에 닫힌다 — 다른 탭과 동일.
enum MyRoute: Hashable {
    case bookshelf, notice, myComments, myFeed, feedback, terms, privacy   // v1: yarn(충전) 제거
}

struct MyPageView: View {
    @Binding var selectedTab: Tab
    @Binding var path: NavigationPath
    @EnvironmentObject private var session: AuthSession
    @EnvironmentObject private var bookmarks: BookmarkStore
    @EnvironmentObject private var prefs: PrefsStore
    @EnvironmentObject private var yarn: YarnStore

    @State private var showSignIn = false   // 로그인/회원가입 모달 (Android SignInDialog)
    @State private var showNicknameSheet = false
    @State private var showDeleteConfirm = false
    @State private var showAttendance = false
    @State private var latestNoticeId: Int?

    /// Unread-notice dot for the 공지 row — same signal as RootView's MY-tab dot.
    private var hasUnreadNotice: Bool { (latestNoticeId ?? 0) > prefs.noticeLastSeenId }

    var body: some View {
        VStack(spacing: 0) {
            // MY 본문 yarnPill이 잔액 표면을 담당하므로 상단 중복 칩은 숨긴다.
            AppMasthead(showsYarnChip: false)
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

                    if let msg = session.authMessage {
                        Spacer().frame(height: 12)
                        Text(msg).font(.bodySans(12)).foregroundStyle(.cta)
                    }

                    // 실타래 잔액 — ACCOUNT/공지 위에 본문 펠릿으로도 노출(상단바 칩과 별개).
                    Spacer().frame(height: 20)
                    yarnPill

                    // 익명 — 로그인 CTA를 공지 위에 (PWA signin-block → 공지 순서, index.html:1944-1976).
                    if session.isAnonymous {
                        Spacer().frame(height: 20)
                        signInBlock
                        Spacer().frame(height: 32)
                        Hairline()
                    }

                    // 공지 — 익명·로그인 모두 노출 (내 활동 위 top-level 섹션).
                    Spacer().frame(height: 20)
                    sectionLabel("공지")
                    navRow(title: "공지사항", subtitle: "업데이트와 소식", route: .notice, trailing: {
                        if hasUnreadNotice {
                            Circle().fill(Color.cta).frame(width: 7, height: 7)
                        }
                    })

                    Spacer().frame(height: 40)
                    sectionLabel("내 활동")
                    // 내 댓글·내 피드는 회원만.
                    if !session.isAnonymous {
                        activityLink(title: "내 댓글", subtitle: "내가 남긴 댓글 보기", route: .myComments)
                        activityLink(title: "내 피드", subtitle: "내가 공유한 한 줄과 하이라이트 보기", route: .myFeed)
                    }
                    // 북마크(서가) — Library 탭이 도서 카탈로그로 바뀌어, 북마크 서가는
                    // 여기 설정에서 연다(Android: 설정 > 북마크 → ArchiveScreen). 익명도 노출.
                    activityRow(title: "북마크", subtitle: "내가 보관한 명대사 보기") {
                        path.append(MyRoute.bookshelf)
                    }
                    // 출석체크 — 보상 지급 없이 출석현황 달력만 여는 보기 전용 진입점.
                    activityRow(title: "출석체크", subtitle: "내 출석현황 보기") {
                        showAttendance = true
                    }
                    // v1: '실타래 구매' 행 제거 — 충전(구매) 진입점 차단(App Store 2.1/3.1.1).
                    // 적립(출석·열람 보상)·게이트 로직은 그대로. 잔액은 상단바 칩에 표시.

                    Spacer().frame(height: 40)
                    sectionLabel("일반 설정")
                    // 푸시 알림 — Android(SettingsScreen.kt) 패리티. 로컬 pref 만 저장
                    // (양 플랫폼 모두 푸시 인프라 없음).
                    settingRow(
                        title: "푸시 알림",
                        subtitle: "데일리 다이제스트와 주요 소식"
                    ) {
                        EditorialToggle(isOn: $prefs.pushEnabled)
                    }
                    settingRow(
                        title: "테마 설정",
                        subtitle: prefs.darkTheme ? "다크 · 에스프레소 나이트" : "라이트 · 크림 페이퍼"
                    ) {
                        EditorialToggle(isOn: $prefs.darkTheme)
                    }
                    settingRow(
                        title: "맞춤 추천",
                        subtitle: prefs.tasteEnabled ? tasteProfileText : "북마크와 비슷한 카드를 추천합니다"
                    ) {
                        EditorialToggle(isOn: $prefs.tasteEnabled)
                    }

                    Spacer().frame(height: 40)
                    sectionLabel("약관 및 정보")
                    legalRow(title: "의견 남기기", route: .feedback)
                    legalRow(title: "이용약관", route: .terms)
                    legalRow(title: "개인정보 처리방침", route: .privacy)
                    settingRow(title: "버전 정보", trailingText: appVersion)

                    // 로그아웃 — 회원만. 익명/비로그인은 (PWA처럼) 로그아웃 대신 상단
                    // 로그인/회원가입 진입점만 보여준다. (PWA는 익명일 때 이 버튼을
                    // 'Reset Anonymous'로 바꾸지만, iOS는 혼란을 줄이려 숨긴다.)
                    if !session.isAnonymous {
                        Spacer().frame(height: 40)
                        Button {
                            Task { await session.signOut() }
                        } label: {
                            Text("로그아웃")
                                .font(.custom("Pretendard-Medium", size: 10))
                                .underline()
                                .foregroundStyle(.walnut)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 6)
                        }
                        .buttonStyle(.plain)
                    }

                    // Account deletion (App Store Guideline 5.1.1(v)). Members only.
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
        .popup(isPresented: $showNicknameSheet) {
            ProfileEditor(
                initialNickname: session.nickname,
                initialGender: session.gender,
                initialAge: session.ageGroup,
                initialPrefs: prefs.userPrefs,
                showPreferences: true,
                onSavePreferences: { genres, themes, any in
                    // 로컬 즉시 반영(온보딩과 동일 경로) + 서버(users.pref_*) 저장(migration 033).
                    prefs.savePrefs(genres: genres, themes: themes, any: any)
                    if let uid = session.userId {
                        session.prefGenres = genres
                        session.prefThemes = themes
                        session.prefAny = any
                        session.hasServerPrefs = true
                        Task { try? await Supa.shared.savePreferences(userId: uid, genres: genres, themes: themes, any: any) }
                    }
                }
            ) { name, g, a in
                Task { await session.updateProfile(name, gender: g, ageGroup: a) }
                showNicknameSheet = false
            } onCancel: {
                showNicknameSheet = false
            }
        }
        .popup(isPresented: $showAttendance) {
            AttendanceView()   // 보기 전용 (보상 지급 없음) — 중앙 팝업
        }
        .popup(isPresented: $showSignIn, fitContent: false) {   // 폼 모드(키보드 회피)
            SignInSheet()
        }
        // MY 하위 페이지를 모두 값 기반(MyRoute)으로 push — settingsPath 가 추적해
        // MY 탭 재탭 시 한 번에 닫힌다(다른 탭과 동일). 북마크 서가는 ArchiveView 가
        // 카드 상세를 같은 스택에 push. 익명도 접근 가능(빈 책장).
        .navigationDestination(for: MyRoute.self) { route in
            switch route {
            case .bookshelf:
                ArchiveView(selectedTab: $selectedTab, path: $path, asSubPage: true)
            case .notice:
                NoticeView()
            case .myComments:
                MyCommentsView()
            case .myFeed:
                MyFeedView()
            case .feedback:
                FeedbackView()
            case .terms:
                LegalView(doc: .terms)
            case .privacy:
                LegalView(doc: .privacy)
            }
        }
        .task { await bookmarks.load(userId: session.userId) }
        .task { latestNoticeId = (try? await Supa.shared.fetchLatestNotice())?.noticeId }
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

    // Android SettingsScreen ACCOUNT 블록 — 인라인 폼/구글 버튼 대신 단일 CTA 하나.
    // 탭하면 SignInDialog(=SignInSheet) 가 폼+구글을 담아 뜬다.
    private var signInBlock: some View {
        VStack(alignment: .leading, spacing: 8) {
            Spacer().frame(height: 16)
            sectionLabel("ACCOUNT")
            Text("아이디와 비밀번호로 로그인하면 다른 기기에서도 북마크가 동기화됩니다.")
                .font(.bodySans(12))
                .foregroundStyle(.walnut)
            Spacer().frame(height: 14)
            Button { showSignIn = true } label: {
                Text("로그인 · 회원가입")
            }
            .buttonStyle(EditorialButtonStyle(.outlined))   // Android SharpButtonVariant.Outline
            Spacer().frame(height: 14)
            Text("가입 시 현재 익명 북마크는 자동으로 새 계정에 옮겨집니다.")
                .font(.bodySans(12))
                .foregroundStyle(.walnut)
                .bookLeading(size: 12)
        }
    }

    /// 실타래 잔액 펠릿 — MY 본문 상단(ACCOUNT/공지 위). 브랜드 마크 + 잔액. 좌측 정렬 캡슐.
    private var yarnPill: some View {
        HStack(spacing: 6) {
            Image("daily-script-bar")
                .resizable().scaledToFill()
                .frame(width: 16, height: 16)
                .clipShape(Circle())
            Text("실타래 \(yarn.balance)개")
                .font(.custom("Pretendard-Medium", size: 13))
                .foregroundStyle(.espresso)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Capsule().fill(Color.sand.opacity(0.35)))
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityLabel("실타래 \(yarn.balance)개")
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
                .padding(.vertical, 18)
            }
            .buttonStyle(.plain)
            Hairline()
        }
    }

    /// Like `activityRow`, but pushes a destination view onto the navigation
    /// stack (e.g. 내 댓글 → MyCommentsView) instead of switching tabs.
    private func activityLink(
        title: String,
        subtitle: String,
        route: MyRoute
    ) -> some View {
        VStack(spacing: 0) {
            Button {
                path.append(route)
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
                .padding(.vertical, 18)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Hairline()
        }
    }

    /// Like `activityLink` but with a custom trailing view (unread dot / yarn
    /// balance) before the chevron — for the 공지 and 실타래 충전 rows.
    private func navRow<Trailing: View>(
        title: String,
        subtitle: String,
        route: MyRoute,
        @ViewBuilder trailing: () -> Trailing
    ) -> some View {
        VStack(spacing: 0) {
            Button {
                path.append(route)
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
                    trailing()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 15, weight: .regular))
                        .foregroundStyle(.walnut)
                }
                .padding(.vertical, 18)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Hairline()
        }
    }

    /// A settings row that pushes a destination (mirrors Android's trailing-arrow
    /// rows). Matches `settingRow`'s metrics but is tappable, so the Legal docs
    /// read as navigable rather than the old dead "Terms of Service" label.
    private func legalRow(
        title: String,
        route: MyRoute
    ) -> some View {
        VStack(spacing: 0) {
            Button {
                path.append(route)
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

/// 로그인/회원가입 모달 — Android `SignInDialog` 미러. MY 화면의 단일 CTA 가 띄운다.
/// 인라인이었던 아이디/비번 폼 + '또는 소셜 계정으로' + Google 버튼을 그대로 이 안으로
/// 옮긴 것(인증 로직 변경 없음). 폼+키보드 때문에 중앙 팝업 대신 시트로(탭바 위로 떠
/// 키보드 이슈 없음). 인증 성공(익명 해제) 시 자동으로 닫힌다.
/// (internal — 카드 게이트의 비로그인 안내 팝업에서도 같은 모달을 재사용한다.)
struct SignInSheet: View {
    @EnvironmentObject private var session: AuthSession
    @Environment(\.dismissPopup) private var dismissPopup   // 중앙 팝업으로 표시 — \.dismiss 대신
    @Environment(\.colorScheme) private var colorScheme
    @State private var loginId = ""
    @State private var loginPassword = ""
    @State private var signUpMode = false
    @State private var appleNonce = ""   // Apple 요청 시 생성 → 응답 검증에 사용

    var body: some View {
        VStack(spacing: 0) {
            signInHeader
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    Text("아이디와 비밀번호로 로그인하면 다른 기기에서도 북마크가 동기화됩니다.")
                        .font(.bodySans(12))
                        .foregroundStyle(.walnut)
                    Spacer().frame(height: 6)
                    FieldBox(placeholder: "아이디", text: $loginId)
                    FieldBox(placeholder: "비밀번호", text: $loginPassword, isSecure: true)
                    // 로그인/가입 버튼은 하단 고정 행으로 이동(키보드가 떠도 보이게). 모드 토글만 여기.
                    Button { signUpMode.toggle() } label: {
                        Text(signUpMode ? "이미 계정이 있나요? 로그인" : "계정이 없으신가요? 회원가입")
                            .labelCaps()
                    }
                    .buttonStyle(.plain)

                    // 소셜 로그인 (Supabase OAuth — 기존 배선 그대로, 위치만 모달로 이동)
                    Spacer().frame(height: 14)
                    Text("또는 소셜 계정으로")
                        .font(.bodySans(12))
                        .foregroundStyle(.walnut)
                    Spacer().frame(height: 10)
                    // Apple — 가이드라인 4.8(구글 동등 옵션). 공식 버튼 스타일(HIG)로 구글 위에,
                    // 동등 이상 높이로 노출. nonce 생성 → 응답의 idToken+nonce 를 Supabase Apple
                    // 프로바이더(signInWithIdToken)로 교환. 성공 시 구글과 동일한 세션 경로.
                    SignInWithAppleButton(.signIn) { request in
                        let nonce = AuthSession.randomNonce()
                        appleNonce = nonce
                        request.requestedScopes = [.fullName, .email]
                        request.nonce = AuthSession.sha256(nonce)
                    } onCompletion: { result in
                        guard case let .success(authResults) = result,
                              let cred = authResults.credential as? ASAuthorizationAppleIDCredential,
                              let tokenData = cred.identityToken,
                              let idToken = String(data: tokenData, encoding: .utf8) else { return }
                        // 이름은 최초 인증에서만 옴(이후 nil) → 신규 가입 시 닉네임으로 저장.
                        let name = [cred.fullName?.givenName, cred.fullName?.familyName]
                            .compactMap { $0 }
                            .joined(separator: " ")
                        Task {
                            await session.signInWithApple(
                                idToken: idToken,
                                rawNonce: appleNonce,
                                fullName: name.isEmpty ? nil : name
                            )
                        }
                    }
                    .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)   // 구글(≈44pt)보다 크거나 같게 — HIG 동등 노출 요건
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .disabled(session.authInProgress)
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
                    Spacer().frame(height: 10)
                    // 카카오 — 공식 브랜드 버튼(노란 #FEE500 배경 + 검정 말풍선 심볼/라벨).
                    // 색상은 카카오 브랜드 가이드를 따른다(애플=공식 흑/백, 구글=공식 흰색과 동일한
                    // "제공자 공식 트리트먼트" 패턴). 크기/모서리는 애플·구글과 동일(높이≈44, radius 10).
                    // 핸들러는 기존 OAuth 배선 그대로 — .kakao 는 구글과 같은 signInWithOAuth 경로.
                    Button {
                        Task { await session.signInWithOAuth(.kakao) }
                    } label: {
                        HStack(spacing: 10) {
                            Image("KakaoLogo").resizable().renderingMode(.original).frame(width: 18, height: 18)
                            Text("카카오 로그인").font(.bodySans(15)).foregroundStyle(Color.black.opacity(0.85))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 13)
                        .background(Color(red: 0.996, green: 0.898, blue: 0.0), in: RoundedRectangle(cornerRadius: 10))
                    }
                    .buttonStyle(.plain)
                    .disabled(session.authInProgress)
                    Spacer().frame(height: 14)
                    Text("소셜 로그인은 회원 식별 및 로그인 목적으로만 사용되며, 소셜 계정의 프로필 정보는 사용하지 않습니다.")
                        .font(.bodySans(12))
                        .foregroundStyle(.walnut)
                        .bookLeading(size: 12)
                }
                .padding(20)
            }
            // 고정 하단 버튼 — ScrollView 밖이라 키보드가 떠도 항상 보인다(스크린샷대로 취소|로그인).
            HStack(spacing: 10) {
                Button { dismissPopup() } label: { Text("취소") }
                    .buttonStyle(EditorialButtonStyle(.outlined))
                Button {
                    Task { await session.signIn(id: loginId, password: loginPassword, signUp: signUpMode) }
                } label: {
                    Text(session.authInProgress ? "⋯" : (signUpMode ? "가입" : "로그인"))
                }
                .buttonStyle(EditorialButtonStyle(.filled))
                .disabled(session.authInProgress || loginId.isEmpty || loginPassword.isEmpty)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 14)
        }
        // 중앙 팝업(폼 모드) — 카드 배경/모서리는 PopupDialog 담당. 시트 그래버·detents 제거.
        // Android SignInDialog: 인증 성공(익명 해제)되면 자동으로 닫힌다.
        .onChange(of: session.isAnonymous) { _, anon in
            if !anon { dismissPopup() }
        }
    }

    // 시트 커스텀 헤더 — 출석체크 시트와 동일한 크롬 표준(제목 좌 + 닫기 우, 56pt, 하단
    // Hairline). 기존 NavigationStack 인라인 타이틀이 그래버에 붙던 문제 해소(SheetMetrics).
    private var signInHeader: some View {
        HStack {
            Text(signUpMode ? "가입" : "로그인")
                .font(.headlineSerif(20))
                .foregroundStyle(.espresso)
            Spacer()
        }
        .padding(.horizontal, SheetMetrics.cardPadding)
        .frame(height: SheetMetrics.headerHeight)
        .overlay(alignment: .bottom) { Hairline() }
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
                    .overlay(Circle().stroke(isOn ? Color.espresso : Color.walnut, lineWidth: 0.5))
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
    let initialPrefs: UserPrefs
    let showPreferences: Bool
    let onSavePreferences: ([String], [String], Bool) -> Void
    let onSave: (String, String?, String?) -> Void
    let onCancel: () -> Void

    @State private var nickname: String
    @State private var gender: String
    @State private var age: String
    @State private var genres: Set<String>
    @State private var themes: Set<String>
    @State private var any: Bool

    init(initialNickname: String, initialGender: String, initialAge: String,
         initialPrefs: UserPrefs = UserPrefs(genres: [], themes: [], any: false),
         showPreferences: Bool = false,
         onSavePreferences: @escaping ([String], [String], Bool) -> Void = { _, _, _ in },
         onSave: @escaping (String, String?, String?) -> Void, onCancel: @escaping () -> Void) {
        self.initialNickname = initialNickname
        self.initialGender = initialGender
        self.initialAge = initialAge
        self.initialPrefs = initialPrefs
        self.showPreferences = showPreferences
        self.onSavePreferences = onSavePreferences
        self.onSave = onSave
        self.onCancel = onCancel
        _nickname = State(initialValue: initialNickname)
        _gender = State(initialValue: initialGender)
        _age = State(initialValue: initialAge)
        _genres = State(initialValue: Set(initialPrefs.genres))
        _themes = State(initialValue: Set(initialPrefs.themes))
        _any = State(initialValue: initialPrefs.any)
    }

    private let genderValues = ["", "male", "female", "other"]
    private let ageValues = ["", "10s", "20s", "30s", "40s", "50s", "60s", "70s", "80s", "90s"]

    // 온보딩(OnboardingView)과 값이 일치해야 저장된 취향이 카드에 반영됨 — 스코프상 로컬 복제.
    private struct PrefGenre { let ko: String; let format: String }
    private let genreOptions: [PrefGenre] = [
        .init(ko: "소설", format: "novel"),
        .init(ko: "연극(희곡)", format: "play"),
        .init(ko: "에세이", format: "essay"),
        .init(ko: "오페라(대본)", format: "opera"),
        .init(ko: "산문", format: "prose"),
    ]
    private struct PrefTheme { let ko: String; let color: Color }
    private let themeOptions: [PrefTheme] = [
        .init(ko: "관계·사랑", color: Color(hex: 0xC75D4A)),
        .init(ko: "상실·애도", color: Color(hex: 0x5E6B7A)),
        .init(ko: "자기·정체성", color: Color(hex: 0xB98A3E)),
        .init(ko: "결단·행동", color: Color(hex: 0xA64238)),
        .init(ko: "세계관·환멸", color: Color(hex: 0x4A5240)),
        .init(ko: "욕망·집착", color: Color(hex: 0x8E3B52)),
        .init(ko: "시간·기억", color: Color(hex: 0x6E7B86)),
        .init(ko: "희망·구원", color: Color(hex: 0xC99A2E)),
        .init(ko: "삶·일상", color: Color(hex: 0x7A6A52)),
        .init(ko: "정서 상태", color: Color(hex: 0x88736B)),
    ]

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
        VStack(alignment: .leading, spacing: 0) {
            Text("프로필 편집").font(.headlineSerif(22)).foregroundStyle(.espresso)
                .padding(.bottom, 16)
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
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

                    if showPreferences { preferenceSection }
                }
                .padding(.bottom, 8)
            }
            HStack {
                Button { onCancel() } label: { Text("취소") }
                    .buttonStyle(EditorialButtonStyle(.outlined))
                Button { save() } label: { Text("저장") }
                    .buttonStyle(EditorialButtonStyle(.filled))
            }
            .padding(.top, 16)
        }
        .padding(24)
        // 중앙 팝업 — 카드 배경/모서리는 PopupDialog 담당(detents 불필요). 긴 콘텐츠(프로필 +
        // 선호도)는 작은 화면(SE)에서 화면을 넘을 수 있어 그 경우만 QA 확인.
    }

    // 취향(장르·주제) 칩 — Android ProfileDialog showPreferences 블록 미러.
    private var preferenceSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("좋아하는 장르").labelCaps()
            FlowLayout(spacing: 8, lineSpacing: 8) {
                ForEach(genreOptions, id: \.format) { g in
                    prefChip(label: g.ko, selected: genres.contains(g.format), accent: .cta) {
                        if genres.contains(g.format) { genres.remove(g.format) } else { genres.insert(g.format) }
                    }
                }
            }
            Spacer().frame(height: 6)
            Text("관심 주제").labelCaps()
            FlowLayout(spacing: 8, lineSpacing: 8) {
                ForEach(themeOptions, id: \.ko) { t in
                    prefChip(label: t.ko, selected: !any && themes.contains(t.ko), accent: t.color) {
                        if themes.contains(t.ko) { themes.remove(t.ko) } else { themes.insert(t.ko) }
                        if !themes.isEmpty { any = false }
                    }
                }
                // "상관없음" — 켜면 주제 선택을 비우고 폭넓게 추천 (Android any).
                prefChip(label: "상관없음", selected: any, accent: .cta) {
                    any.toggle()
                    if any { themes.removeAll() }
                }
            }
        }
    }

    private func prefChip(label: String, selected: Bool, accent: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.custom(selected ? "Pretendard-Medium" : "Pretendard-Regular", size: 13))
                .foregroundStyle(selected ? .espresso : .walnut)
                .padding(.horizontal, 13)
                .padding(.vertical, 8)
                .background(RoundedRectangle(cornerRadius: 20).fill(selected ? accent.opacity(0.12) : Color.paper))
                .overlay(RoundedRectangle(cornerRadius: 20).stroke(selected ? accent : Color.latte, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private func save() {
        // 취향은 바뀐 경우에만 저장(로컬). 안 건드렸으면 그대로 둔다 — Android 동일.
        if showPreferences {
            let changed = genres != Set(initialPrefs.genres)
                || themes != Set(initialPrefs.themes)
                || any != initialPrefs.any
            if changed { onSavePreferences(Array(genres), Array(themes), any) }
        }
        onSave(nickname, gender.isEmpty ? nil : gender, age.isEmpty ? nil : age)
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

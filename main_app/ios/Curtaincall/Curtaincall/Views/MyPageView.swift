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
    @Environment(\.requestLogin) private var requestLogin   // 로그인 → 루트의 단일 로그인 팝업(키보드 회피·탭바 고정)
    @Environment(\.requestYarnInfo) private var requestYarnInfo
    @Environment(\.loginPopupActive) private var loginPopupActive   // 실타래 펠릿 탭 → 설명 팝업

    @State private var showNicknameSheet = false
    @State private var showDeleteConfirm = false
    /// 탈퇴 **실패** 안내(알림용). nil 이면 알림 없음.
    @State private var deleteFailure: String?
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
                    // 상단 여백 16→28 — 닉네임이 매스트헤드에 눌려 답답하다는 기기 QA.
                    Spacer().frame(height: 28)

                    // 정체성 블록(로그인) — 닉네임 → 아이디 → 실타래 로 한 덩어리(기기 QA
                    // 재구성). 태그라인 제거, 구분선은 이 블록이 아니라 '공지' 위로 이동.
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

                        // 아이디 — 닉네임 바로 아래(합성 이메일 대신 사람이 정한 login_id).
                        if !session.loginId.isEmpty {
                            Spacer().frame(height: 8)
                            Text("아이디 · \(session.loginId)")
                                .font(.bodySans(13))
                                .foregroundStyle(.walnut)
                        }

                        // 실타래 — 아이디 줄 바로 아래(상단바 칩과 별개 본문 펠릿).
                        Spacer().frame(height: 12)
                        yarnPill
                    }

                    // 익명 — 로그인 CTA를 공지 위에 (PWA signin-block → 공지 순서, index.html:1944-1976).
                    if session.isAnonymous {
                        Spacer().frame(height: 20)
                        yarnPill
                        Spacer().frame(height: 20)
                        signInBlock
                        Spacer().frame(height: 32)
                    }

                    // 로그인 안내 메시지("로그인 됐어요" 등) — 정체성 블록을 끊지 않도록
                    // 블록 '끝'으로 내렸다(기기 QA). 일시적 상태 피드백이라 작게.
                    //
                    // 로그인 팝업이 떠 있는 동안엔 그리지 않는다. `authMessage` 는 공용 채널이라
                    // 팝업(QA-10 에서 추가)과 여기가 **같은 문구를 동시에** 그려, 짧은 비밀번호
                    // 경고가 팝업 안과 그 뒤에 두 번 보였다(기기 QA). 팝업이 떠 있을 땐 그쪽이
                    // 문맥의 주인이므로 본문은 양보한다 — 팝업이 닫히면 다시 이 자리에서 보인다
                    // (프로필 저장·닉네임 변경·탈퇴 결과 등은 원래대로 여기서 표시).
                    if let msg = session.authMessage, !loginPopupActive {
                        Spacer().frame(height: 12)
                        Text(msg).font(.bodySans(12)).foregroundStyle(.cta)
                    }

                    // 구분선 — 정체성 블록과 '공지' 섹션 사이(기기 QA: 닉네임 밑 → 여기로).
                    Spacer().frame(height: 28)
                    Hairline()

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
                        subtitle: "북마크와 비슷한 카드를 추천합니다",
                        note: prefs.tasteEnabled ? tasteProfileText : nil   // Android: note = ON일 때 취향 프로필 라인
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
                            Task {
                                // 게스트 전환에 **성공했을 때만** 로컬 정리. 실패 시엔 회원 상태와
                                // 취향·최근 본 카드·오즈 픽·공지 읽음을 그대로 보존한다(Codex 리뷰 P2).
                                // 탈퇴 경로와 동일한 규칙 — 성공 반환값이 정리의 유일한 조건이다.
                                if await session.signOut() { await finishIdentityChange() }
                            }
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
                    // 104 = 필 블록 보상 — safeAreaInset 은 TabView 페이지에 전파되지 않아
                    // 기존 40+24 로는 스크롤 끝이 글래스 필 뒤에 멈춘다(기기 QA, Feed 동일 값).
                    Spacer().frame(height: 104)
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
            // 신원이 바뀌면(로그아웃·탈퇴) 스크롤을 맨 위로 되돌린다 — 뷰 자체를 새로 만든다.
            //
            // 탈퇴/로그아웃 버튼은 이 페이지 **맨 아래**에 있는데, 성공 후 화면은 게스트용으로
            // 다시 그려지면서도 **스크롤 위치는 바닥에 그대로** 남아, 방금 계정을 지운 사용자가
            // '로그인 · 회원가입' 블록(맨 위)을 못 본다(기기 QA).
            //
            // ⚠️ 처음엔 `ScrollViewReader` + `scrollTo(topID)` 로 했는데 **동작하지 않았다**
            // (기기 재확인). 토큰이 오는 그 순간 회원 레이아웃이 게스트 레이아웃으로 통째로
            // 교체되면서 콘텐츠 높이가 크게 바뀌고, 그 와중에 스크롤 명령이 묻힌다.
            // `.id()` 로 ScrollView 를 **새로 만들면** 위치가 0 에서 시작하는 게 보장된다 —
            // 타이밍에 의존하지 않는다. 콘텐츠의 @State 는 MyPageView 소유라 보존된다.
            .id(prefs.identityResetToken)
        }
        .background(Color.paper)
        .toolbar(.hidden, for: .navigationBar)
        // 폼 모드(fitContent:false) — 이름 편집 시 키보드가 텍스트필드/저장 버튼을 가리지 않게
        // 카드가 키보드 위 가용 높이를 채우고 내부 ScrollView 로 스크롤(로그인 팝업과 동일).
        .popup(isPresented: $showNicknameSheet, fitContent: false) {
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
        // 로그인 팝업은 루트(showLoginModal)에서 단일로 띄운다 — 여기선 requestLogin() 만 호출.
        // MY 하위 페이지를 모두 값 기반(MyRoute)으로 push — settingsPath 가 추적해
        // MY 탭 재탭 시 한 번에 닫힌다(다른 탭과 동일). 북마크 서가는 ArchiveView 가
        // 카드 상세를 같은 스택에 push. 익명도 접근 가능(빈 책장).
        .navigationDestination(for: MyRoute.self) { route in
            Group {
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
            // iOS 26 유령 네이티브 탭바 — 탭바 표시는 '최상단 목적지'의 선호를 따르므로
            // 루트에만 hidden 을 걸면 push 순간 유령 바가 재출현해 커스텀 필을 위로
            // 밀어올린다(기기 QA: 사용 중 필 부양 + 하단 이중 바). 모든 MY 하위
            // 목적지에 일괄 적용.
            .toolbar(.hidden, for: .tabBar)
        }
        .task { await bookmarks.load(userId: session.userId) }
        .task { latestNoticeId = (try? await Supa.shared.fetchLatestNotice())?.noticeId }
        .onChange(of: session.userId) { _, newValue in
            Task { await bookmarks.load(userId: newValue) }
        }
        .alert("회원 탈퇴", isPresented: $showDeleteConfirm) {
            Button("취소", role: .cancel) {}
            Button("탈퇴하기", role: .destructive) {
                // 탈퇴 '성공' 시에도 로그아웃과 동일하게 로컬 사용자 상태를 비운다. 이게
                // 빠져 있어서 삭제된 계정의 취향·최근 본 카드·오즈 픽·공지 읽음 표시가
                // 새로 부트스트랩된 게스트 세션에 그대로 남았다(외부 QA A-84).
                // 실패 시에는 로그인 상태를 그대로 유지해야 하므로 지우지 않는다.
                Task {
                    if await session.deleteAccount() {
                        await finishIdentityChange()
                    } else {
                        // 실패 문구는 `authMessage` 자리(이 화면 **맨 위**)에 뜨는데 탈퇴 버튼은
                        // 페이지 맨 아래라, 그대로 두면 사용자 화면 밖에서 안내가 사라진다.
                        // 파괴적 동작의 실패는 반드시 보여야 해서 같은 문구를 알림으로도 띄운다.
                        deleteFailure = session.authMessage
                    }
                }
            }
        } message: {
            Text("계정과 모든 데이터(북마크·댓글·하트·피드)가 영구 삭제되며 되돌릴 수 없습니다.")
        }
        .alert("탈퇴하지 못했어요",
               isPresented: Binding(get: { deleteFailure != nil },
                                    set: { if !$0 { deleteFailure = nil } })) {
            Button("확인", role: .cancel) {}
        } message: {
            Text(deleteFailure ?? "")
        }
    }

    /// 로그아웃·탈퇴 성공 후 공통 마무리 — **순서가 전부다.**
    ///
    /// 1) 북마크를 먼저 새 신원 기준으로 비우고 다시 읽는다. 이게 없으면 2)의 초기화 신호를
    ///    받은 TODAY/DAILY 가 **아직 메모리에 남은 이전 회원의 북마크**로 카드를 고른다:
    ///    `Recommend.pickToday(bookmarkCards:)` 와 DailyView 의 `taste`(북마크 키워드 집합)가
    ///    모두 BookmarkStore 를 직접 읽기 때문이다. 특히 TODAY 는 고른 뒤 `hasLoaded` 가 true 로
    ///    굳어, 잘못 고른 카드가 앱 재실행 전까지 **영구히** 남는다(Codex 리뷰 P1 잔존분).
    ///    `load(userId: nil)` 은 가드 경로라 네트워크 없이 즉시 비우고, 이어지는 로드가 실패해도
    ///    '마지막 상태 유지'가 곧 **비어 있는 상태**라 이전 회원 데이터로 되돌아가지 않는다.
    /// 2) 그 다음에야 로컬 상태를 비우고 identityResetToken 을 emit 한다.
    ///
    /// 로그아웃과 탈퇴가 같은 함수를 쓰는 이유: 두 경로의 사후 처리가 어긋나면 한쪽에서만
    /// 데이터가 새는 이번 같은 버그가 다시 난다.
    private func finishIdentityChange() async {
        await bookmarks.load(userId: nil)               // 이전 신원 북마크 즉시 비움
        await bookmarks.load(userId: session.userId)    // 새(게스트) 신원으로 재적재
        prefs.clearUserScopedState()                    // 정리 → identityResetToken emit
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
            Button { requestLogin() } label: {   // 루트 단일 로그인 팝업
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
        Button { requestYarnInfo() } label: {
            HStack(spacing: 6) {
                Image("daily-script-bar")
                    .resizable().scaledToFill()
                    .frame(width: 16, height: 16)
                    .clipShape(Circle())
                Text("실타래 \(yarn.balance)")   // '개' 제거(기기 QA)
                    .font(.custom("Pretendard-Medium", size: 13))
                    .foregroundStyle(.espresso)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Capsule().fill(Color.sand.opacity(0.35)))
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityLabel("실타래 \(yarn.balance)개, 설명 보기")
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
        note: String? = nil,
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
                    // Android SettingRow note — 부제 아래 별도 라인(맞춤 추천 ON 시 취향 프로필). 8dp 간격.
                    if let note {
                        Spacer().frame(height: 4)
                        Text(note)
                            .font(.bodySans(11))
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
                    Button {
                        session.authMessage = nil   // 모드를 바꾸면 이전 모드의 오류는 무의미
                        signUpMode.toggle()
                    } label: {
                        // 회원가입(또는 로그인) 단어를 강조 — 안내 문구는 톤다운, 액션 단어는 accent + 밑줄.
                        (
                            Text(signUpMode ? "이미 계정이 있나요? " : "계정이 없으신가요? ")
                                .foregroundStyle(.walnut)
                            + Text(signUpMode ? "로그인" : "회원가입")
                                .foregroundStyle(Color.cta).underline()
                        )
                        .font(.custom("Pretendard-Medium", size: 12))
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
            // 인증 실패 안내 — **이 팝업 안에서** 보여준다.
            // 예전엔 `session.authMessage` 가 오직 MyPageView 본문(84행)에서만 그려졌는데,
            // 이 팝업은 RootView 레벨 오버레이라 그 문구가 **팝업 뒤에 가려** 보이지 않았다.
            // 짧은 비밀번호로 가입을 시도하면 폼이 아무 반응도 안 하는 것처럼 보이고, 팝업을
            // 닫아야 비로소 이유를 알 수 있었다(기기 QA) — 미관이 아니라 기능 결함.
            // 하단 고정 행 바로 위라 키보드가 떠 있어도 버튼과 함께 보인다.
            if let msg = session.authMessage {
                Text(msg)
                    .font(.bodySans(12))
                    .foregroundStyle(.cta)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 4)
                    .transition(.opacity)
                    .accessibilityAddTraits(.isStaticText)
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
        .animation(.easeInOut(duration: 0.2), value: session.authMessage)
        // 팝업을 열 때 이전 문구를 비운다.
        //
        // `authMessage` 는 인증 전용이 아니라 **공용 상태 채널**이다 — 로그인 실패뿐 아니라
        // "계정이 삭제됐어요" · "프로필이 저장됐어요" · "이름이 변경됐어요" · "로그아웃에
        // 실패했어요" 등 17곳이 같은 프로퍼티에 쓴다. QA-10 에서 이 문구를 팝업 **안에서**
        // 그리게 바꾸면서, 앞선 동작이 남긴 메시지가 로그인 오류인 것처럼 보일 수 있게 됐다
        // (리뷰 P2). 특히 탈퇴 직후 → 로그인 팝업 열기 경로가 그대로 재현된다.
        //
        // 근본적으로는 인증 전용 오류 상태를 따로 두는 게 맞지만, 그건 `AuthSession` 의
        // 반환 규약까지 바꾸는 일이라 이 PR 범위 밖이다. 표시 시작 시점에 비우는 것으로
        // 오염 경로를 끊는다(백로그: 인증 전용 상태 분리).
        .onAppear { session.authMessage = nil }
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
                    // 예전엔 `Text(...).labelCaps()` + `.plain` 이라, 바로 위아래의 **섹션 라벨**
                    // (`성별 · 선택` · `나이대 · 선택` · `좋아하는 장르`)과 서체·크기·색이 완전히
                    // 같아 누를 수 있다는 신호가 0 이었다(기기 QA: "클릭 가능한 줄 몰랐다").
                    // 테두리 + 새로고침 심볼로 탭 타깃임을 드러낸다.
                    //
                    // ⚠️ `EditorialButtonStyle(.outlined)` 을 그대로 쓰지 않은 이유: 그 스타일은
                    // `maxWidth: .infinity` + `height 52` 로 **전폭·대형**이라 보조 동작인데도
                    // 저장 버튼과 비중이 같아 보이고, 가뜩이나 큰 프로필 팝업(QA-7)을 52pt 더
                    // 키운다. 같은 시각 언어(테두리 8R · walnut 1pt · labelCaps)를 쓰되 크기만
                    // 보조 수준으로 낮춘 컴팩트 형태.
                    Button { nickname = AuthSession.randomCuteNickname() } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "arrow.triangle.2.circlepath")
                                .font(.system(size: 12, weight: .medium))
                            Text("랜덤 이름 생성").labelCaps(color: .espresso)
                        }
                        .foregroundStyle(.espresso)
                        .padding(.horizontal, 14)
                        // 테두리 박스는 시각 크기 36, **히트 영역만 44**(HIG 최소 — 리뷰 P2).
                        // 페이지 바 칩과 같은 방식(시각 28 / 히트 44) — 보조 버튼이 시각적으로
                        // 커져 저장 버튼과 비중이 같아지는 것을 피하면서 접근성 최소치를 만족.
                        .frame(height: 36)
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.walnut, lineWidth: 1))
                        .frame(height: 44)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("랜덤 이름 생성")

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

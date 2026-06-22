import SwiftUI

struct AccountRequiredPrompt: View {
    var title = "북마크는 회원 전용"
    var message = "마음에 든 명대사를 보관하려면 로그인이 필요해요."
    let onLogin: () -> Void
    /// 회원가입 — PWA 처럼 로그인/회원가입 모두 같은 인증 화면(설정 로그인 블록)으로
    /// 라우팅. 미지정 시 onLogin 과 동일.
    var onRegister: (() -> Void)? = nil
    let onClose: () -> Void

    var body: some View {
        ZStack {
            Color.espresso.opacity(0.18)
                .ignoresSafeArea()
                .onTapGesture(perform: onClose)

            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .center) {
                    Text("Members")
                        .font(.headlineSerif(22))
                        .foregroundStyle(.espresso)
                    Spacer()
                    Button(action: onClose) {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .regular))
                            .foregroundStyle(.walnut)
                            .frame(width: 36, height: 36)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("닫기")
                }

                Spacer().frame(height: 20)
                Text(title)
                    .font(.titleSerif(20))
                    .foregroundStyle(.espresso)
                Spacer().frame(height: 8)
                Text(message)
                    .font(.bodySans(14))
                    .foregroundStyle(.walnut)
                    .bookLeading(size: 14)
                    .fixedSize(horizontal: false, vertical: true)

                Spacer().frame(height: 24)
                Button(action: onLogin) {
                    Text("로그인")
                }
                .buttonStyle(EditorialButtonStyle(.filled))
                Spacer().frame(height: 10)
                Button(action: onRegister ?? onLogin) {
                    Text("회원가입")
                }
                .buttonStyle(EditorialButtonStyle(.outlined))
            }
            .padding(20)
            .frame(maxWidth: 340)
            .background(RoundedRectangle(cornerRadius: 8).fill(Color.paper))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.latte, lineWidth: 0.5))
            .padding(.horizontal, 24)
        }
        .transition(.opacity)
    }
}

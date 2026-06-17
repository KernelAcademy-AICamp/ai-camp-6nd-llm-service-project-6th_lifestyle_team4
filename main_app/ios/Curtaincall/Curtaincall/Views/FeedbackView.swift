import SwiftUI
import UIKit

/// "의견 보내기" — user feedback form. Mirrors the PWA feedback screen
/// (`web_pwa/public/m/index.html` #fb-form + `m-app.js` submitFeedback) and posts
/// via `FeedbackApi` to the same Google Apps Script endpoint as Android/PWA.
/// Star rating is required; gender/age prefill from the signed-in profile (email
/// is never auto-filled, per PWA `prefillFeedback`); all other fields are optional.
///
/// PRIVACY: this screen collects a satisfaction rating, free-text opinions, an
/// OPTIONAL email, and OPTIONAL demographics (gender / age group), and sends them
/// to an external endpoint. Declared in `PrivacyInfo.xcprivacy` and reflected in
/// the App Store privacy label.
struct FeedbackView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var session: AuthSession

    @State private var rating = 0
    @State private var gender = ""   // Korean label, sent verbatim (matches PWA select)
    @State private var age = ""
    @State private var liked = ""
    @State private var improve = ""
    @State private var message = ""
    @State private var email = ""

    @State private var submitting = false
    @State private var submitted = false
    @State private var errorText: String?

    // Option sets + labels mirror the PWA <select> values exactly.
    private let genderOptions = ["", "남성", "여성", "기타"]
    private let ageOptions = ["", "10대", "20대", "30대", "40대", "50대", "60대 이상"]
    private let ratingLabels = ["", "매우 불만족", "불만족", "보통", "만족", "매우 만족"]

    var body: some View {
        VStack(spacing: 0) {
            topBar
            if submitted {
                successView
            } else {
                formScroll
            }
        }
        .background(Color.paper)
        .toolbar(.hidden, for: .navigationBar)
        .onAppear(perform: prefill)
    }

    // MARK: - Chrome

    private var topBar: some View {
        HStack(alignment: .center) {
            Button { dismiss() } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundStyle(.espresso)
                    .frame(width: 40, height: 40)
            }
            .buttonStyle(.plain)
            Spacer()
            Text("의견 보내기")
                .font(.headlineSerif(20))
                .foregroundStyle(.espresso)
            Spacer()
            Color.clear.frame(width: 40, height: 40)
        }
        .padding(.horizontal, 12)
        .frame(height: 56)
        .overlay(alignment: .bottom) { Hairline() }
    }

    // MARK: - Form

    private var formScroll: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                Text("서비스에 대한 의견을 자유롭게 들려주세요. 큰 힘이 됩니다 🙌")
                    .font(.bodySans(13))
                    .foregroundStyle(.walnut)
                    .bookLeading(size: 13)
                    .padding(.top, 4)

                menuField(label: "성별", selection: $gender, options: genderOptions)
                menuField(label: "연령대", selection: $age, options: ageOptions)

                ratingField

                textAreaField(label: "무엇이 좋았나요?", placeholder: "좋았던 점을 알려주세요",
                              text: $liked, maxLen: 1000)
                textAreaField(label: "더 필요한 게 있으셨나요?", placeholder: "아쉬웠거나 더 있었으면 하는 점",
                              text: $improve, maxLen: 1000)
                textAreaField(label: "기타 의견", placeholder: "편하게 남겨주세요!",
                              text: $message, maxLen: 1000)

                emailField

                if let errorText {
                    Text(errorText)
                        .font(.bodySans(13))
                        .foregroundStyle(.cta)
                        .bookLeading(size: 13)
                }

                Button { submit() } label: {
                    Text(submitting ? "보내는 중…" : "보내기")
                }
                .buttonStyle(EditorialButtonStyle(.filled))
                .disabled(submitting)
                .padding(.top, 2)

                Spacer().frame(height: 40)
            }
            .padding(.horizontal, 20)
            .contentShape(Rectangle())
            .simultaneousGesture(TapGesture().onEnded { dismissKeyboard() })
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private var ratingField: some View {
        VStack(alignment: .leading, spacing: 8) {
            fieldLabel("만족도", required: true)
            HStack(spacing: 8) {
                ForEach(1...5, id: \.self) { i in
                    Button {
                        rating = i
                        errorText = nil
                    } label: {
                        Image(systemName: i <= rating ? "star.fill" : "star")
                            .font(.system(size: 28))
                            .foregroundStyle(i <= rating ? Color.cta : Color.sand)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(ratingLabels[i])
                    .accessibilityAddTraits(i == rating ? [.isSelected] : [])
                }
            }
            // Reserve a line so the layout doesn't jump when a label appears.
            Text(rating > 0 ? ratingLabels[rating] : " ")
                .font(.bodySans(13))
                .foregroundStyle(.walnut)
        }
    }

    private var emailField: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Text("이메일").labelCaps()
                Text("(선택 · 답변받기)")
                    .font(.custom("Pretendard-Medium", size: 11))
                    .foregroundStyle(.walnut.opacity(0.7))
            }
            TextField("you@example.com", text: $email)
                .font(.bodySans(14))
                .foregroundStyle(.espresso)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
                .keyboardType(.emailAddress)
                .padding(.horizontal, 14)
                .padding(.vertical, 14)
                .background(RoundedRectangle(cornerRadius: 8).fill(Color.paper))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.latte, lineWidth: 0.5))
                .onChange(of: email) { _, v in
                    if v.count > 120 { email = String(v.prefix(120)) }
                }
        }
    }

    // MARK: - Success

    private var successView: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "heart.fill")
                .font(.system(size: 52))
                .foregroundStyle(Color.cta)
            Text("감사합니다!")
                .font(.headlineSerif(24))
                .foregroundStyle(.espresso)
            Text("소중한 의견이 잘 전달되었어요.")
                .font(.bodySans(15))
                .foregroundStyle(.walnut)
                .multilineTextAlignment(.center)
            Spacer()
            Button { dismiss() } label: { Text("닫기") }
                .buttonStyle(EditorialButtonStyle(.outlined))
            Spacer().frame(height: 24)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 20)
    }

    // MARK: - Reusable field builders

    private func fieldLabel(_ text: String, required: Bool) -> some View {
        HStack(spacing: 4) {
            Text(text).labelCaps()
            Text(required ? "*" : "(선택)")
                .font(.custom("Pretendard-Medium", size: 11))
                .foregroundStyle(required ? Color.cta : Color.walnut.opacity(0.7))
        }
    }

    private func menuField(label: String, selection: Binding<String>, options: [String]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            fieldLabel(label, required: false)
            Menu {
                ForEach(options, id: \.self) { opt in
                    Button(opt.isEmpty ? "선택 안 함" : opt) { selection.wrappedValue = opt }
                }
            } label: {
                HStack {
                    Text(selection.wrappedValue.isEmpty ? "선택 안 함" : selection.wrappedValue)
                        .font(.bodySans(14))
                        .foregroundStyle(selection.wrappedValue.isEmpty ? .walnut : .espresso)
                    Spacer()
                    Image(systemName: "chevron.down")
                        .font(.system(size: 11))
                        .foregroundStyle(.walnut)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(RoundedRectangle(cornerRadius: 8).fill(Color.paper))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.latte, lineWidth: 0.5))
            }
        }
    }

    private func textAreaField(label: String, placeholder: String,
                               text: Binding<String>, maxLen: Int) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            fieldLabel(label, required: false)
            ZStack(alignment: .topLeading) {
                if text.wrappedValue.isEmpty {
                    Text(placeholder)
                        .font(.bodySans(14))
                        .foregroundStyle(.walnut.opacity(0.7))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 14)
                }
                TextEditor(text: text)
                    .font(.bodySans(14))
                    .foregroundStyle(.espresso)
                    .frame(minHeight: 80)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .scrollContentBackground(.hidden)
                    .onChange(of: text.wrappedValue) { _, v in
                        if v.count > maxLen { text.wrappedValue = String(v.prefix(maxLen)) }
                    }
            }
            .background(RoundedRectangle(cornerRadius: 8).fill(Color.paper))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.latte, lineWidth: 0.5))
        }
    }

    // MARK: - Behaviour

    /// 회원이면 성별·연령대 프리필 (PWA `prefillFeedback` 패리티). 이메일은 절대 자동 채우지 않는다.
    private func prefill() {
        switch session.gender {
        case "male": gender = "남성"
        case "female": gender = "여성"
        case "other": gender = "기타"
        default: break
        }
        // session.ageGroup is "" | "10s".."90s" — map to the form's labels, collapsing
        // 60s+ into "60대 이상" (matches PWA's n >= 60 branch).
        if let n = Int(session.ageGroup.dropLast()) {
            let label = n >= 60 ? "60대 이상" : (n >= 10 ? "\(n)대" : "")
            if ageOptions.contains(label) { age = label }
        }
    }

    private func submit() {
        guard rating > 0 else {
            errorText = "만족도를 선택해 주세요."
            return
        }
        errorText = nil
        submitting = true
        let trim = { (s: String) in s.trimmingCharacters(in: .whitespacesAndNewlines) }
        Task {
            do {
                try await FeedbackApi.submit(
                    rating: rating,
                    gender: gender,
                    age: age,
                    liked: trim(liked),
                    improve: trim(improve),
                    message: trim(message),
                    email: trim(email)
                )
                submitting = false
                submitted = true
            } catch {
                submitting = false
                errorText = "전송에 실패했어요. 잠시 후 다시 시도해 주세요."
            }
        }
    }

    private func dismissKeyboard() {
        UIApplication.shared.sendAction(
            #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
}

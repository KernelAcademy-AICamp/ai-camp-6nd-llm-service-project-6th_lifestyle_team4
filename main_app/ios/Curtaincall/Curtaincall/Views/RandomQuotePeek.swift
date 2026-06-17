import SwiftUI

/// Lightweight "random quote" peek, shown on shake (iOS-only delight). Viewing the
/// peek is FREE — no yarn is consumed. The "전문 읽기" button routes to the full
/// CardDetail through the NORMAL yarn gate (the caller pushes CardDetailView, whose
/// `runOpenFlow` runs the gate); this peek must NOT open the full read itself or it
/// would bypass the economy.
struct RandomQuotePeek: View {
    let card: Card
    let onReadFull: () -> Void
    let onClose: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var catShown = false

    var body: some View {
        VStack(spacing: 0) {
            // Surprised cat reaction — flashes in with a calm spring. Under Reduce
            // Motion it's simply shown (no scale/opacity animation).
            Image("cat_confused")
                .resizable()
                .scaledToFit()
                .frame(width: 92, height: 92)
                .opacity(catShown ? 1 : 0)
                .scaleEffect(catShown ? 1 : 0.6)
                .padding(.top, 30)
                .accessibilityHidden(true)

            Text("랜덤 명대사")
                .labelCaps()
                .padding(.top, 10)

            Text("“\(card.quote)”")
                .font(.displaySerif(quoteSize))
                .foregroundStyle(.espresso)
                .multilineTextAlignment(.center)
                .lineSpacing(6)
                .minimumScaleFactor(0.6)
                .padding(.horizontal, 28)
                .padding(.top, 16)

            Text(workLine)
                .font(.bodySans(13))
                .foregroundStyle(.walnut)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
                .padding(.top, 14)

            Spacer(minLength: 20)

            Button { onReadFull() } label: {
                Text("전문 읽기")
            }
            .buttonStyle(EditorialButtonStyle(.filled))
            .padding(.horizontal, 24)

            Button { onClose() } label: {
                Text("닫기").labelCaps()
            }
            .buttonStyle(.plain)
            .padding(.top, 14)
            .padding(.bottom, 24)
        }
        .frame(maxWidth: .infinity)
        .background(Color.paper)
        .onAppear {
            guard !reduceMotion else { catShown = true; return }
            withAnimation(.spring(response: 0.5, dampingFraction: 0.6).delay(0.05)) {
                catShown = true
            }
        }
    }

    /// Smaller serif for longer quotes so they stay on a few lines in the sheet.
    private var quoteSize: CGFloat { card.quote.count > 40 ? 22 : 26 }

    private var workLine: String {
        let title = card.work.title
        if let author = card.work.author?.trimmingCharacters(in: .whitespacesAndNewlines),
           !author.isEmpty {
            return "\(title) · \(author)"
        }
        return title
    }
}

import SwiftUI

/// Cold-start brand intro — a calm, iOS-native wordmark reveal that continues
/// seamlessly from the static (cream) launch screen, then dissolves into the app.
///
/// Deliberately NOT a port of Android's 3s book-spine morph (`SplashIntro.kt`) —
/// iOS is its own north star (AGENTS.md) and the wordmark isn't a named brand
/// character, so this stays in our restrained serif aesthetic. Fixed cream/ink/coral
/// (theme-independent) so it matches the launch screen in both light and dark.
/// ~1.5s total, then `onFinished()`.
struct LaunchIntroView: View {
    let onFinished: () -> Void

    @State private var appear = false
    @State private var leaving = false

    // Fixed brand values (match the launch screen; not theme-adaptive).
    private let cream = Color(hex: 0xFAF8F2)
    private let ink = Color(hex: 0x0E0C0A)
    private let coral = Color(hex: 0xD85A30)

    var body: some View {
        ZStack {
            cream.ignoresSafeArea()
            (
                Text("Daily Script ").foregroundColor(ink)
                + Text(".").foregroundColor(coral)
            )
            .font(.displaySerif(40))
            .tracking(0.5)
            .opacity(appear ? 1 : 0)
            .offset(y: appear ? 0 : 14)
            .blur(radius: appear ? 0 : 5)   // whisper focus-in
        }
        .opacity(leaving ? 0 : 1)
        .task {
            withAnimation(.easeOut(duration: 0.6)) { appear = true }
            try? await Task.sleep(nanoseconds: 1_050_000_000)   // hold
            withAnimation(.easeIn(duration: 0.4)) { leaving = true }
            try? await Task.sleep(nanoseconds: 420_000_000)     // let the fade finish
            onFinished()
        }
    }
}

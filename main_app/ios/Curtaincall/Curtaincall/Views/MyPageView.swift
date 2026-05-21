import SwiftUI

struct MyPageView: View {
    @State private var pushNotificationsOn = true

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                topBar
                userBlock
                Hairline()
                sectionHeader("GENERAL PREFERENCES")
                pushNotificationsRow
                Hairline()
                themeSettingsRow
                Hairline()
                sectionHeader("LEGAL & ABOUT")
                termsRow
                Hairline()
                versionRow
                Hairline()
                signOutButton
            }
            .padding(.bottom, 32)
        }
        .background(Color.paperWhite)
        .toolbar(.hidden, for: .navigationBar)
    }

    private var topBar: some View {
        HStack(alignment: .center) {
            Text("Daily Script")
                .font(.editorialSerif(28, weight: .regular))
                .foregroundStyle(.inkBlack)
            Spacer()
            ZStack {
                Color.inkBlack
                Text("JT")
                    .font(.system(size: 12, weight: .bold))
                    .tracking(1)
                    .foregroundStyle(.paperWhite)
            }
            .frame(width: 36, height: 36)
        }
        .padding(.horizontal, 24)
        .padding(.top, 16)
        .padding(.bottom, 32)
    }

    private var userBlock: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Jordan Tate")
                .font(.editorialSerif(32, weight: .semibold))
                .foregroundStyle(.inkBlack)
            Text("Curator of contemporary screenplays. Believes in the quiet power of stage direction.")
                .font(.system(size: 15))
                .foregroundStyle(.onSurfaceVariant)
                .lineSpacing(2)
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 32)
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .labelCaps()
            .padding(.horizontal, 24)
            .padding(.top, 32)
            .padding(.bottom, 16)
    }

    private var pushNotificationsRow: some View {
        HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Push Notifications")
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(.inkBlack)
                Text("Daily script delivered at 8:00 AM")
                    .font(.system(size: 13))
                    .foregroundStyle(.onSurfaceVariant)
            }
            Spacer()
            Toggle("", isOn: $pushNotificationsOn)
                .labelsHidden()
                .tint(.inkBlack)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 16)
    }

    private var themeSettingsRow: some View {
        Button(action: {}) {
            HStack(alignment: .center, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Theme Settings")
                        .font(.system(size: 15, weight: .regular))
                        .foregroundStyle(.inkBlack)
                    Text("System default (Light)")
                        .font(.system(size: 13))
                        .foregroundStyle(.onSurfaceVariant)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .light))
                    .foregroundStyle(.onSurfaceVariant)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 16)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var termsRow: some View {
        Button(action: {}) {
            HStack(alignment: .center, spacing: 16) {
                Text("Terms of Service")
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(.inkBlack)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .light))
                    .foregroundStyle(.onSurfaceVariant)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 16)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var versionRow: some View {
        HStack(alignment: .center, spacing: 16) {
            Text("Version Info")
                .font(.system(size: 15, weight: .regular))
                .foregroundStyle(.inkBlack)
            Spacer()
            Text("v2.4.0 (Stable)")
                .font(.system(size: 13))
                .foregroundStyle(.onSurfaceVariant)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 16)
    }

    private var signOutButton: some View {
        Button(action: {}) {
            Text("SIGN OUT").editorialButton(style: .outlined)
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 24)
        .padding(.top, 32)
    }
}

#Preview {
    NavigationStack { MyPageView() }
}

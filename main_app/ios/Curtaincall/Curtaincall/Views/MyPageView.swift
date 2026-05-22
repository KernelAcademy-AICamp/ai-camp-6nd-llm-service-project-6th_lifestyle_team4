import SwiftUI

struct MyPageView: View {
    @State private var pushEnabled = true

    var body: some View {
        VStack(spacing: 0) {
            settingsTopBar
            Hairline()
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Spacer().frame(height: 40)
                    Text("박지윤")
                        .font(.displaySerif(32))
                        .foregroundStyle(.espresso)
                    Spacer().frame(height: 10)
                    Text("매일 한 장의 명대사로 하루를 시작합니다.")
                        .font(.bodySans(16))
                        .foregroundStyle(.walnut)
                        .bookLeading(size: 16)
                    Spacer().frame(height: 32)
                    Hairline()

                    Spacer().frame(height: 40)
                    sectionLabel("GENERAL PREFERENCES")
                    settingRow(
                        title: "Push Notifications",
                        subtitle: "Daily digest and breaking insights",
                        trailing: { editorialToggle }
                    )
                    settingRow(
                        title: "Theme Settings",
                        subtitle: "System default (Light)"
                    )

                    Spacer().frame(height: 40)
                    sectionLabel("LEGAL & ABOUT")
                    settingRow(title: "Terms of Service")
                    settingRow(
                        title: "Version Info",
                        trailingText: "v2.4.0"
                    )

                    Spacer().frame(height: 40)
                    Button(action: {}) {
                        Text("Sign Out").editorialButton(style: .outlined)
                    }
                    .buttonStyle(.plain)
                    Spacer().frame(height: 40)
                }
                .padding(.horizontal, 20)
            }
        }
        .background(Color.paper)
        .toolbar(.hidden, for: .navigationBar)
    }

    private var settingsTopBar: some View {
        HStack(alignment: .center) {
            Text("Daily Script")
                .font(.headlineSerif(22))
                .foregroundStyle(.espresso)
            Spacer()
            ZStack {
                Rectangle().stroke(Color.walnut, lineWidth: 0.5)
                Text("박").labelCaps(color: .espresso)
            }
            .frame(width: 36, height: 36)
        }
        .padding(.horizontal, 20)
        .frame(height: 64)
        .background(Color.paper)
    }

    private func sectionLabel(_ text: String) -> some View {
        Text(text)
            .labelCaps()
            .padding(.bottom, 12)
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

    private var editorialToggle: some View {
        Button {
            pushEnabled.toggle()
        } label: {
            ZStack(alignment: pushEnabled ? .trailing : .leading) {
                RoundedRectangle(cornerRadius: 12)
                    .fill(pushEnabled ? Color.espresso : Color.latte)
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

#Preview {
    NavigationStack { MyPageView() }
}

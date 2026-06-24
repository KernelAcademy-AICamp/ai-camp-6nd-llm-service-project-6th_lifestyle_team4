import SwiftUI

/// UGC 신고·차단 오버플로 메뉴(⋯) — 피드 글/하이라이트/댓글 등 남이 작성한 콘텐츠
/// 우상단에 붙인다. App Store 1.2(사용자 생성 콘텐츠) 필수:
///   · 신고 → 사유 선택(스팸/욕설/부적절/기타) → content_reports insert → 토스트
///   · 차단 → 확인 → user_blocks insert → 그 사용자 콘텐츠가 즉시 가려짐
/// 자기 콘텐츠에는 띄우지 않는다(호출부에서 author != me 일 때만 사용).
struct ModerationMenu: View {
    let target: ReportTarget
    /// 차단 대상(콘텐츠 작성자)의 user_id.
    let authorUserId: Int
    /// 결과 안내 토스트를 띄울 호출부 핸들러.
    var onToast: (String) -> Void = { _ in }

    @EnvironmentObject private var moderation: ModerationStore
    @State private var showReportReasons = false
    @State private var showBlockConfirm = false

    var body: some View {
        Menu {
            Button {
                showReportReasons = true
            } label: {
                Label("신고", systemImage: "flag")
            }
            Button(role: .destructive) {
                showBlockConfirm = true
            } label: {
                Label("이 사용자 차단", systemImage: "hand.raised")
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.walnut)
                .frame(width: 32, height: 32)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .confirmationDialog("신고 사유를 선택해주세요", isPresented: $showReportReasons, titleVisibility: .visible) {
            ForEach(ReportReason.allCases) { reason in
                Button(reason.label) { submitReport(reason) }
            }
            Button("취소", role: .cancel) {}
        }
        .confirmationDialog("이 사용자를 차단할까요?", isPresented: $showBlockConfirm, titleVisibility: .visible) {
            Button("차단", role: .destructive) { submitBlock() }
            Button("취소", role: .cancel) {}
        } message: {
            Text("차단하면 이 사용자의 글과 댓글이 보이지 않습니다.")
        }
    }

    private func submitReport(_ reason: ReportReason) {
        Task {
            do {
                try await moderation.report(target, reason: reason)
                onToast("신고가 접수되었어요")
            } catch {
                onToast("신고 처리에 실패했어요")
            }
        }
    }

    private func submitBlock() {
        Task {
            do {
                try await moderation.block(userId: authorUserId)
                onToast("차단했어요. 이 사용자의 콘텐츠가 가려집니다.")
            } catch {
                onToast("차단 처리에 실패했어요")
            }
        }
    }
}

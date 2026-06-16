//
//  CurtaincallApp.swift
//  Curtaincall
//
//  Created by Yub Hahm on 5/21/26.
//

import SwiftUI
import IssueReporting

@main
struct CurtaincallApp: App {
    @State private var pendingCardId: Int?
    @StateObject private var session = AuthSession()
    @StateObject private var bookmarks = BookmarkStore()
    @StateObject private var prefs = PrefsStore()
    @StateObject private var yarn = YarnStore()
    @StateObject private var attendance = AttendanceStore()

    init() {
        FontRegistration.register()
        // supabase-swift's `emitInitialSession` calls `reportIssue()` (a benign
        // dev advisory) from an unstructured Task. Under the debugger,
        // swift-issue-reporting's default reporter TRAPS on it — pausing the auth
        // bootstrap so signup/login appear to no-op. A scoped `withIssueReporters`
        // can't cover the SDK's detached Task, so disable issue reporters
        // app-wide at the entry point (the library's documented override).
        IssueReporters.current = []
    }

    var body: some Scene {
        WindowGroup {
            RootView(pendingCardId: $pendingCardId)
                .environmentObject(session)
                .environmentObject(bookmarks)
                .environmentObject(prefs)
                .environmentObject(yarn)
                .environmentObject(attendance)
                .preferredColorScheme(prefs.darkTheme ? .dark : .light)
                .task {
                    await session.start()
                    await bookmarks.load(userId: session.userId)
                    yarn.sync(serverBalance: session.yarnBalance)   // 부트스트랩 잔액 시드
                }
                .onOpenURL { url in
                    if let id = Self.parseCardId(from: url) {
                        pendingCardId = id
                    }
                }
        }
    }

    /// Parses curtaincall://card/{id} URLs. Returns nil on any malformed input.
    private static func parseCardId(from url: URL) -> Int? {
        guard url.scheme == "curtaincall", url.host == "card" else { return nil }
        let segments = url.pathComponents.filter { $0 != "/" }
        guard let last = segments.last, let id = Int(last) else { return nil }
        return id
    }
}

//
//  CurtaincallApp.swift
//  Curtaincall
//
//  Created by Yub Hahm on 5/21/26.
//

import SwiftUI

@main
struct CurtaincallApp: App {
    @State private var pendingCardId: Int?
    @StateObject private var session = AuthSession()
    @StateObject private var bookmarks = BookmarkStore()
    @StateObject private var prefs = PrefsStore()

    init() {
        FontRegistration.register()
    }

    var body: some Scene {
        WindowGroup {
            RootView(pendingCardId: $pendingCardId)
                .environmentObject(session)
                .environmentObject(bookmarks)
                .environmentObject(prefs)
                .preferredColorScheme(prefs.darkTheme ? .dark : .light)
                .task {
                    await session.start()
                    await bookmarks.load(userId: session.userId)
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

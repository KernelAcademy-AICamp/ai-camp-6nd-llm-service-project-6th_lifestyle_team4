//
//  CurtaincallApp.swift
//  Curtaincall
//
//  Created by Yub Hahm on 5/21/26.
//

import SwiftUI

@main
struct CurtaincallApp: App {
    init() {
        FontRegistration.register()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}

import SwiftUI
import WidgetKit

@main
struct CurtaincallWidgetBundle: WidgetBundle {
    init() {
        WidgetFonts.registerIfNeeded()
    }

    var body: some Widget {
        CurtaincallWidget()
    }
}

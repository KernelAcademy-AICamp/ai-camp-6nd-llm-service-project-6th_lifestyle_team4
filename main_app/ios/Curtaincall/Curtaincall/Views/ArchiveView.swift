import SwiftUI

struct ArchiveView: View {
    var body: some View {
        Text("Archive")
            .labelCaps()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.paperWhite)
    }
}

#Preview {
    ArchiveView()
}

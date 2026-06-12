import SwiftUI

/// Save sheet for a highlighted passage — the selected text shown as a serif
/// quote plus an optional 메모 (note, ≤500). Mirrors Android's
/// `HighlightComposeDialog`. On design tokens.
struct HighlightComposeSheet: View {
    let selectedText: String
    let saving: Bool
    let onCancel: () -> Void
    let onSave: (_ note: String) -> Void

    @State private var note = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("하이라이트 저장")
                .font(.headlineSerif(22))
                .foregroundStyle(.espresso)
            ScrollView {
                Text("“\(selectedText)”")
                    .font(.titleSerif(18))
                    .foregroundStyle(.espresso)
                    .bookLeading(size: 18)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxHeight: 180)
            noteEditor
            HStack {
                Button { onCancel() } label: { Text("취소") }
                    .buttonStyle(EditorialButtonStyle(.outlined))
                Button { onSave(note) } label: { Text(saving ? "⋯" : "저장") }
                    .buttonStyle(EditorialButtonStyle(.filled))
                    .disabled(saving)
            }
            Spacer()
        }
        .padding(24)
        .background(Color.paper.ignoresSafeArea())
        .presentationDetents([.medium, .large])
    }

    private var noteEditor: some View {
        ZStack(alignment: .topLeading) {
            if note.isEmpty {
                Text("메모 (선택)")
                    .font(.bodySans(14))
                    .foregroundStyle(.walnut)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 14)
            }
            TextEditor(text: $note)
                .font(.bodySans(14))
                .foregroundStyle(.espresso)
                .frame(minHeight: 80)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .scrollContentBackground(.hidden)
                .onChange(of: note) { _, v in
                    if v.count > 500 { note = String(v.prefix(500)) }
                }
        }
        .background(RoundedRectangle(cornerRadius: 8).fill(Color.paper))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.latte, lineWidth: 0.5))
    }
}

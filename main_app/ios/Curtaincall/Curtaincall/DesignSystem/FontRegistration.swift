import CoreText
import Foundation

enum FontRegistration {
    static func register() {
        let fontFiles = [
            "NanumMyeongjo-Regular.ttf",
            "Pretendard-Regular.otf",
            "Pretendard-Medium.otf",
        ]
        for file in fontFiles {
            let name = (file as NSString).deletingPathExtension
            let ext = (file as NSString).pathExtension
            guard let url = Bundle.main.url(forResource: name, withExtension: ext) else { continue }
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
    }
}

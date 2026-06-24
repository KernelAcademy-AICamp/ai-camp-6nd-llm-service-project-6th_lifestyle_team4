import UIKit

/// 좌측 엣지 스와이프(뒤로가기) 복구.
///
/// 앱의 모든 상세 화면(카드 상세·하이라이트 상세·서가 책 등)은 커스텀 헤더를 쓰려고
/// `.toolbar(.hidden, for: .navigationBar)` 로 내비게이션 바를 숨긴다. 그러면 UIKit 의
/// `interactivePopGestureRecognizer`(엣지 스와이프 pop)가 기본 백버튼과 함께
/// 비활성화돼, 좌측 엣지에서 밀어 뒤로 가는 표준 제스처가 동작하지 않는다.
///
/// `UINavigationController` 가 그 제스처의 delegate 를 자처하고, 스택에 pop 할 화면이
/// 있을 때(viewControllers > 1)만 제스처를 허용하도록 되살린다. 앱 전역의 모든
/// `NavigationStack`(내부적으로 UINavigationController)에 적용된다.
///
/// `viewControllers.count > 1` 가드로 루트에서는 제스처가 시작되지 않아, 루트 화면을
/// 스와이프해 빈 스택이 되는 사고를 막는다. 비공개 API 를 쓰지 않아 심사에 안전.
extension UINavigationController: UIGestureRecognizerDelegate {
    open override func viewDidLoad() {
        super.viewDidLoad()
        interactivePopGestureRecognizer?.delegate = self
    }

    public func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard gestureRecognizer == interactivePopGestureRecognizer else { return true }
        return viewControllers.count > 1
    }
}

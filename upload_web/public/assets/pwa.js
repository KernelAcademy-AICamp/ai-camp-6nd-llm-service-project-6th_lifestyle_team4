// PWA 설치 지원 — 서비스 워커 등록 + 설치 프롬프트 헬퍼
// 모든 페이지의 <body> 끝에 type="module"로 로드.

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => console.warn('[pwa] sw register failed:', err));
  });
}

// 설치 프롬프트 — 브라우저가 trigger 했을 때 캐싱했다가 사용자가 #install-app 버튼을 누르면 표시
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  document.querySelectorAll('[data-install-app]').forEach((btn) => {
    btn.classList.remove('hidden');
  });
});

window.addEventListener('appinstalled', () => {
  document.querySelectorAll('[data-install-app]').forEach((btn) => btn.classList.add('hidden'));
  deferredPrompt = null;
});

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-install-app]');
  if (!btn) return;
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  btn.classList.add('hidden');
});

// iOS 안내 — Safari는 beforeinstallprompt 이벤트가 없어 수동 설치 가이드 필요
(function showIosHintIfNeeded() {
  const ua = window.navigator.userAgent || '';
  const isIos = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isInStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  if (!isIos || isInStandalone) return;
  if (sessionStorage.getItem('pwa.iosHintShown')) return;

  const banner = document.createElement('div');
  banner.id = 'ios-install-hint';
  banner.style.cssText = `
    position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;
    background:#1a1a1a;color:#fff;padding:14px 16px;border-radius:12px;
    box-shadow:0 8px 24px rgba(0,0,0,0.25);font-size:14px;line-height:1.5;
    display:flex;gap:10px;align-items:start;
  `;
  banner.innerHTML = `
    <div style="flex:1">
      <strong>📱 홈 화면에 앱으로 설치</strong><br/>
      Safari 하단 <strong>공유 버튼</strong> → <strong>"홈 화면에 추가"</strong>를 누르세요.
    </div>
    <button id="ios-hint-close" style="background:transparent;border:0;color:#fff;font-size:18px;cursor:pointer;">✕</button>
  `;
  document.body.appendChild(banner);
  document.getElementById('ios-hint-close').addEventListener('click', () => {
    banner.remove();
    sessionStorage.setItem('pwa.iosHintShown', '1');
  });
})();

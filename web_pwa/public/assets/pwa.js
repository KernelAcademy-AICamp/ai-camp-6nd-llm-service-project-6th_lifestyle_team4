// PWA 설치 지원 — 서비스 워커 등록 + 설치 프롬프트 헬퍼
// 모든 페이지의 <body> 끝에 type="module"로 로드.

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        // 새 버전이 대기 중이면 즉시 활성화 요청
        if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              // 새 SW가 설치됨 — 활성화 요청
              sw.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
        // 30초마다 새 SW 있는지 점검
        setInterval(() => reg.update().catch(() => {}), 30000);
      })
      .catch((err) => console.warn('[pwa] sw register failed:', err));

    // 새 SW가 컨트롤러로 활성화되면 페이지를 한 번 리로드 (단, 무한 루프 방지).
    // 단, 첫 설치(로드 시 컨트롤러 없음)의 controllerchange는 reload하지 않는다 —
    // 페이지는 이미 정상 동작하며, 첫 방문 reload는 모듈 로드 폭포를 ×2로 키운다.
    // 이전 컨트롤러가 있던 상태에서 새 SW가 인계받은 '업데이트' 때만 1회 reload.
    let reloaded = false;
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded || !hadController) return;
      reloaded = true;
      location.reload();
    });

    // SW에서 'SW_UPDATED' 메시지 받으면 사용자에게 안내 (선택적)
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type === 'SW_UPDATED') {
        console.log('[pwa] SW updated to', e.data.version);
      }
    });
  });

  // 페이지가 다시 포커스 받으면 SW 업데이트 체크 + 강제로 페이지 새 fetch
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (reg) reg.update().catch(() => {});
    });
  });
}

// 환경 감지
const ua = window.navigator.userAgent || '';
const isIos = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
const isInStandalone = window.matchMedia('(display-mode: standalone)').matches
  || window.navigator.standalone === true;

// 설치 프롬프트 — beforeinstallprompt 캐싱
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // data-install-app (hidden 시작) 버튼들을 노출
  document.querySelectorAll('[data-install-app]:not([data-install-always])').forEach((btn) => {
    btn.classList.remove('hidden');
  });
});

window.addEventListener('appinstalled', () => {
  document.querySelectorAll('[data-install-app]').forEach((btn) => btn.classList.add('hidden'));
  deferredPrompt = null;
});

// 이미 standalone(설치된 상태로 실행) 모드라면 always 버튼도 숨김
if (isInStandalone) {
  document.querySelectorAll('[data-install-app]').forEach((btn) => btn.classList.add('hidden'));
}

// iOS 안내 배너 함수 — 클릭 시 표시
function showIosInstallHint() {
  const existing = document.getElementById('ios-install-hint');
  if (existing) {
    existing.remove();
    return;
  }
  const banner = document.createElement('div');
  banner.id = 'ios-install-hint';
  banner.style.cssText = `
    position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;
    background:#1a1a1a;color:#fff;padding:16px 18px;border-radius:14px;
    box-shadow:0 8px 24px rgba(0,0,0,0.3);font-size:14px;line-height:1.55;
    display:flex;gap:10px;align-items:start;
  `;
  banner.innerHTML = `
    <div style="flex:1">
      <strong style="font-size:15px;">📱 홈 화면에 앱으로 설치</strong><br/>
      <span style="opacity:0.9">
        Safari 하단의 <strong>공유 버튼</strong>
        <span style="display:inline-block;border:1px solid #fff;border-radius:4px;padding:0 5px;margin:0 2px;">⬆</span>
        을 누른 뒤<br/>
        <strong>"홈 화면에 추가"</strong>를 선택하세요.
      </span>
    </div>
    <button id="ios-hint-close" style="background:transparent;border:0;color:#fff;font-size:22px;cursor:pointer;padding:0 4px;line-height:1;">✕</button>
  `;
  document.body.appendChild(banner);
  document.getElementById('ios-hint-close').addEventListener('click', () => {
    banner.remove();
  });
}

// 클릭 핸들러
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-install-app]');
  if (!btn) return;
  e.preventDefault();

  // Android/Chrome: 캐시된 프롬프트 사용
  if (deferredPrompt) {
    try {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } catch (err) {
      console.warn('[pwa] install prompt failed:', err);
    } finally {
      deferredPrompt = null;
      if (!btn.hasAttribute('data-install-always')) {
        btn.classList.add('hidden');
      }
    }
    return;
  }

  // iOS Safari: 수동 가이드 배너
  if (isIos) {
    showIosInstallHint();
    return;
  }

  // 그 외 — 데스크톱 Chrome에서 이미 설치됐거나, Firefox 등 미지원
  if (isInStandalone) {
    alert('이미 앱으로 설치된 상태에서 실행 중입니다.');
  } else {
    alert('이 브라우저에서는 자동 설치가 지원되지 않습니다.\n\nChrome/Edge: 주소창 우측 "설치" 아이콘\niPhone Safari: 공유 → "홈 화면에 추가"\nAndroid Chrome: ⋮ 메뉴 → "앱 설치"');
  }
});

// iOS에서 페이지가 비로그인 페이지(index)일 때만 첫 방문 시 자동 배너 노출
if (isIos && !isInStandalone && (location.pathname === '/' || location.pathname.endsWith('/index.html'))) {
  try {
    if (!sessionStorage.getItem('pwa.iosHintShown')) {
    // 자동 표시는 부담스러우므로 비활성화 — 사용자가 버튼을 눌렀을 때만 안내
    // sessionStorage.setItem('pwa.iosHintShown', '1');
    }
  } catch {
    /* storage unavailable */
  }
}

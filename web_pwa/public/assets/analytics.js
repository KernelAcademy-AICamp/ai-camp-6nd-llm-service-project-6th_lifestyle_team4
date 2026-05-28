// Daily Script — 분석 부트스트랩 (Amplitude + Microsoft Clarity)
// 공개 클라이언트 키는 /api/config(Vercel 환경변수)에서 주입한다.
// 키가 없으면 모든 호출이 조용히 no-op 처리되어 앱 동작에 영향을 주지 않는다.

let amplitude = null;        // 로드된 Amplitude Browser SDK (미설정·실패 시 null)
let clarityReady = false;
let booted = false;
let bootPromise = null;

const MAX_BUFFER = 100;
const buffer = [];           // boot 완료 전 들어온 track 호출 버퍼
let pendingUserId = null;    // boot 완료 전 들어온 identify 대상

export function initAnalytics() {
  if (!bootPromise) bootPromise = boot();
  return bootPromise;
}

async function boot() {
  let cfg = {};
  try {
    const r = await fetch('/api/config');
    if (r.ok) cfg = await r.json();
  } catch {
    /* 설정 로드 실패 — 키 없이 진행(전부 no-op) */
  }

  await Promise.all([
    bootAmplitude(cfg.amplitudeApiKey),
    bootClarity(cfg.clarityProjectId),
  ]);

  booted = true;
  if (pendingUserId != null) applyUserId(pendingUserId);
  for (const ev of buffer.splice(0)) emit(ev.name, ev.props);
}

async function bootAmplitude(apiKey) {
  if (!apiKey) return;
  try {
    amplitude = await import('https://esm.sh/@amplitude/analytics-browser@2');
    amplitude.init(apiKey, {
      autocapture: {
        pageViews: true,
        sessions: true,
        attribution: true,
        elementInteractions: false,  // 클릭 자동수집 끔 — 핵심 이벤트만 명시 전송
      },
    });
  } catch (e) {
    amplitude = null;
    console.warn('[analytics] Amplitude init 실패:', e);
  }
}

function bootClarity(projectId) {
  if (!projectId) return;
  try {
    // 공식 Clarity 부트스트랩 스니펫 (programmatic)
    (function (c, l, a, r, i) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      const t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
      const y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', projectId);
    clarityReady = true;
  } catch (e) {
    console.warn('[analytics] Clarity init 실패:', e);
  }
}

// 사용자 행동 이벤트 — Amplitude로 전송하고 Clarity 세션에 커스텀 이벤트로 표시
export function track(name, props = {}) {
  if (!booted) {
    if (buffer.length < MAX_BUFFER) buffer.push({ name, props });
    return;
  }
  emit(name, props);
}

function emit(name, props) {
  try { if (amplitude) amplitude.track(name, props); } catch { /* noop */ }
  try { if (clarityReady && window.clarity) window.clarity('event', name); } catch { /* noop */ }
}

// 사용자 식별 — 익명 user_id를 두 도구에 연결
export function identify(userId) {
  if (userId == null) return;
  if (!booted) { pendingUserId = userId; return; }
  applyUserId(userId);
}

function applyUserId(userId) {
  const id = String(userId);
  try { if (amplitude) amplitude.setUserId(id); } catch { /* noop */ }
  try { if (clarityReady && window.clarity) window.clarity('identify', id); } catch { /* noop */ }
}

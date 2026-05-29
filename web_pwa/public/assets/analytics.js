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
let pendingUserProps = null; // boot 완료 전 들어온 setUserProps 대상

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
  if (pendingUserProps != null) { applyUserProps(pendingUserProps); pendingUserProps = null; }
  for (const ev of buffer.splice(0)) emit(ev.name, ev.props);
}

async function bootAmplitude(apiKey) {
  if (!apiKey) return;
  try {
    amplitude = await import('https://esm.sh/@amplitude/analytics-browser@2');
    amplitude.init(apiKey, {
      // DB 내부 user_id(예: '42')는 짧음 — 기본 최소길이(5) 검증에 걸려
      // "Invalid id length for user_id" 에러로 식별·전송이 실패하므로 1로 완화.
      minIdLength: 1,
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
  try {
    if (amplitude) { amplitude.setUserId(id); console.log('[analytics] user id 설정 →', id); }
    else console.warn('[analytics] setUserId 무시 — Amplitude 미초기화(키 없음/로드 실패)');
  } catch (e) { console.warn('[analytics] setUserId 실패:', e); }
  try { if (clarityReady && window.clarity) window.clarity('identify', id); } catch { /* noop */ }
}

// 사용자 속성을 Amplitude User Property로 전송.
// 로그인 직후 / 프로필 변경 시 호출. 값이 비면 해당 속성을 unset.
// props: { accountType?: 'member'|'anonymous', gender?: string, ageGroup?: string, userPk?: string }
//   - accountType: 회원/익명 구분용 (모든 사용자에게 전송 → 회원만 필터 가능)
//   - gender/age_group: 값은 영문 코드(male/female/other, 10s..90s) — 회원만
//   - user_pk: DB 내부 user_id (식별자를 login_id로 써도 역추적 가능하게 보존)
export function setUserProps(props = {}) {
  if (!booted) { pendingUserProps = props; return; }
  applyUserProps(props);
}

function applyUserProps(props) {
  if (!amplitude) {
    console.warn('[analytics] setUserProps 무시 — Amplitude 미초기화(키 없음/로드 실패)', props);
    return;
  }
  try {
    const id = new amplitude.Identify();
    if (props.accountType) id.set('account_type', props.accountType);
    if (props.userPk) id.set('user_pk', props.userPk);
    if (props.gender) id.set('gender', props.gender); else id.unset('gender');
    if (props.ageGroup) id.set('age_group', props.ageGroup); else id.unset('age_group');
    amplitude.identify(id);
    console.log('[analytics] user props 전송 →', {
      account_type: props.accountType || null,
      user_pk: props.userPk || null,
      gender: props.gender || null,
      age_group: props.ageGroup || null,
    });
  } catch (e) {
    console.warn('[analytics] setUserProps 실패:', e);
  }
}

// 로그아웃 시 사용자/디바이스 식별 초기화
export function resetUser() {
  try { if (amplitude) amplitude.reset(); } catch { /* noop */ }
}

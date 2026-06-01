// Lazy-initialized browser Supabase client.
// Loads anon key from /api/config so we don't need a build step to inline env vars.
// SDK는 self-host한 단일 번들(/assets/vendor/supabase-js.js)을 동적 import + 타임아웃으로 로드.
//  - self-host: esm.sh(크로스도메인 ~10요청)를 동일 출처 1파일로 대체 → 첫 방문 폭포·행 제거,
//    서비스워커가 precache. (번들 재생성법은 그 파일 상단 배너 참고.)
//  - 동적 import: m-app.js 모듈 그래프를 SDK에 묶지 않아, 파일 로드 실패/지연도
//    getSupabase의 reject로 표면화돼 부팅 에러 UI/워치독이 복구할 수 있다.
const SDK_URL = '/assets/vendor/supabase-js.js';
const SDK_TIMEOUT_MS = 8000;

let clientPromise = null;
let sdkPromise = null;

function loadCreateClient() {
  if (!sdkPromise) {
    sdkPromise = Promise.race([
      import(SDK_URL),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Supabase SDK 로드 타임아웃')), SDK_TIMEOUT_MS)
      ),
    ])
      .then((mod) => mod.createClient)
      .catch((err) => {
        sdkPromise = null;  // 다음 호출에서 재시도 가능
        throw err;
      });
  }
  return sdkPromise;
}

function fetchConfigWithTimeout() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  return fetch('/api/config', {
    signal: controller.signal,
    cache: 'no-store',
  }).finally(() => clearTimeout(timer));
}

export function getSupabase() {
  if (!clientPromise) {
    // SDK 동적 로드와 config fetch를 병렬로 — 둘 다 독립이라 직렬 대기 불필요.
    clientPromise = Promise.all([
      loadCreateClient(),
      fetchConfigWithTimeout().then((r) => {
        if (!r.ok) throw new Error('Failed to load /api/config');
        return r.json();
      }),
    ])
      .then(([createClient, { supabaseUrl, supabaseAnonKey }]) => {
        if (!supabaseUrl || !supabaseAnonKey) {
          throw new Error('Supabase env not configured on server');
        }
        return createClient(supabaseUrl, supabaseAnonKey, {
          auth: { persistSession: true, autoRefreshToken: true },
        });
      })
      .catch((err) => {
        clientPromise = null;
        throw err;
      });
  }
  return clientPromise;
}

export async function getAccessToken() {
  try {
    const sb = await getSupabase();
    const { data } = await sb.auth.getSession();
    return data?.session?.access_token ?? null;
  } catch (err) {
    console.warn('[supabase] session unavailable:', err);
    return null;
  }
}

export async function requireSessionOrRedirect(redirectTo = '/') {
  const token = await getAccessToken();
  if (!token) {
    location.href = redirectTo;
    return null;
  }
  return token;
}

// ---------------------------------------------------------------------------
// 선호도 온보딩 — 사용법 코치마크 투어 직전에 1회 진행.
//   STEP 1) 읽고 싶은 장르 (복수 선택)
//   STEP 2) 관심 가는 주제 (복수 선택 + "상관없음")
// 완료/건너뛰기 시 선택값으로 resolve. 저장(localStorage)·게이팅은 호출 측(m-app.js)이 담당.
//
//   const result = await startPreferenceFlow();
//   // result = { genres:[...], themes:[...], any:false, skipped:false } | null(화면없음)
//
// 추천 연동(P1)에서 ds.pref 를 pickRandomCard 가중에 사용할 예정.
// ---------------------------------------------------------------------------

const GENRES = [
  { ko: '소설',       en: 'Novel', format: 'novel', full: false },
  { ko: '연극·희곡',  en: 'Play',  format: 'play',  full: false },
  { ko: '에세이',     en: 'Essay', format: 'essay', full: false },
  { ko: '오페라·대본', en: 'Opera', format: 'opera', full: false },
  { ko: '산문',       en: 'Prose', format: 'prose', full: true },
];

const THEMES = [
  { ko: '관계·사랑',   kw: '사랑 · 연애 · 가족 · 우정', c: '#C75D4A' },
  { ko: '상실·애도',   kw: '죽음 · 이별 · 그리움 · 애도', c: '#5E6B7A' },
  { ko: '자기·정체성', kw: '자아 · 성장 · 자존 · 양심', c: '#B98A3E' },
  { ko: '결단·행동',   kw: '결심 · 선택 · 복수 · 저항', c: '#A64238' },
  { ko: '세계관·환멸', kw: '권력 · 사회 · 운명 · 진실', c: '#4A5240' },
  { ko: '욕망·집착',   kw: '욕망 · 유혹 · 소유 · 야망', c: '#8E3B52' },
  { ko: '시간·기억',   kw: '시간 · 기억 · 추억 · 회상', c: '#6E7B86' },
  { ko: '희망·구원',   kw: '희망 · 구원 · 믿음 · 치유', c: '#C99A2E' },
  { ko: '삶·일상',     kw: '삶 · 노동 · 생계 · 생존', c: '#7A6A52' },
  { ko: '정서 상태',   kw: '불안 · 분노 · 공허 · 권태', c: '#88736B' },
];

const $ = (s) => document.querySelector(s);

let resolver = null;
let st = null;
let bound = false;

function root() { return document.getElementById('pref-screen'); }

export function startPreferenceFlow() {
  const el = root();
  if (!el) return Promise.resolve(null);
  st = { step: 1, genres: new Set(), themes: new Set(), any: false };
  renderGenres();
  renderThemes();
  bindControls();
  show(1);
  el.classList.add('open');
  el.setAttribute('aria-hidden', 'false');
  return new Promise((res) => { resolver = res; });
}

function finish(result) {
  const el = root();
  if (el) { el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); }
  const r = resolver; resolver = null;
  if (r) r(result);
}

function renderGenres() {
  const wrap = $('#pf-genres');
  if (!wrap) return;
  wrap.innerHTML = GENRES.map((g, i) => `
    <button class="pf-genre${g.full ? ' full' : ''}" data-i="${i}" type="button">
      <span class="tk">✓</span>
      <div class="ko">${g.ko}</div>
      <div class="en">${g.en}</div>
    </button>`).join('');
  wrap.querySelectorAll('.pf-genre').forEach((node) => {
    node.addEventListener('click', () => {
      const fmt = GENRES[+node.dataset.i].format;
      if (st.genres.has(fmt)) { st.genres.delete(fmt); node.classList.remove('sel'); }
      else { st.genres.add(fmt); node.classList.add('sel'); }
      updateFooter();
    });
  });
}

function renderThemes() {
  const wrap = $('#pf-themes');
  if (!wrap) return;
  wrap.innerHTML = THEMES.map((t, i) => `
    <button class="pf-theme" data-i="${i}" type="button">
      <span class="sw" style="background:${t.c};"></span>
      <span class="tx"><span class="ko">${t.ko}</span><span class="kw">${t.kw}</span></span>
      <span class="tk">✓</span>
    </button>`).join('');
  wrap.querySelectorAll('.pf-theme').forEach((node) => {
    node.addEventListener('click', () => {
      if (st.any) { st.any = false; $('#pf-any').classList.remove('sel'); wrap.classList.remove('muted'); }
      const ko = THEMES[+node.dataset.i].ko;
      if (st.themes.has(ko)) { st.themes.delete(ko); node.classList.remove('sel'); }
      else { st.themes.add(ko); node.classList.add('sel'); }
      updateFooter();
    });
  });
}

function bindControls() {
  if (bound) return;       // 핸들러는 1회만 — 모듈/DOM 재사용 시 중복 방지
  bound = true;
  $('#pf-any')?.addEventListener('click', () => {
    st.any = !st.any;
    $('#pf-any').classList.toggle('sel', st.any);
    $('#pf-themes').classList.toggle('muted', st.any);
    if (st.any) {
      st.themes.clear();
      $('#pf-themes').querySelectorAll('.sel').forEach((e) => e.classList.remove('sel'));
    }
    updateFooter();
  });
  $('#pf-next')?.addEventListener('click', () => {
    if (st.step === 1) show(2);
    else finish({ genres: [...st.genres], themes: [...st.themes], any: st.any, skipped: false });
  });
  $('#pf-back')?.addEventListener('click', () => { if (st.step === 2) show(1); });
  $('#pf-skip')?.addEventListener('click', () => {
    // 건너뛰기 = 전체 주제 폭넓게 추천 (이후 다시 묻지 않음)
    finish({ genres: [...st.genres], themes: [], any: true, skipped: true });
  });
}

function show(step) {
  st.step = step;
  document.querySelectorAll('#pref-screen .pf-step').forEach((s) => s.classList.toggle('on', +s.dataset.step === step));
  const seg1 = $('#pf-seg1'), seg2 = $('#pf-seg2');
  if (seg1) seg1.style.width = step >= 1 ? '100%' : '0';
  if (seg2) seg2.style.width = step >= 2 ? '100%' : '0';
  const sc = $('#pref-screen .pf-scroll'); if (sc) sc.scrollTop = 0;
  updateFooter();
}

function updateFooter() {
  const next = $('#pf-next'), back = $('#pf-back'), info = $('#pf-info');
  if (!next) return;
  back.style.display = st.step === 1 ? 'none' : 'block';
  if (st.step === 1) {
    const n = st.genres.size;
    next.disabled = n === 0;
    next.textContent = '다음';
    info.textContent = n ? `${n}개 장르 선택됨` : '장르를 1개 이상 골라주세요';
  } else {
    const n = st.themes.size;
    next.disabled = !(n > 0 || st.any);
    next.textContent = '내 추천 받기';
    info.textContent = st.any ? '모든 주제에서 추천받아요'
      : (n ? `${n}개 주제 선택됨` : '주제를 고르거나 ‘상관없음’을 눌러주세요');
  }
}

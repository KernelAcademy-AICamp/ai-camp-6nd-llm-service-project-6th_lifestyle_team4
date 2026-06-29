// ---------------------------------------------------------------------------
// 사용법 코치마크 투어 — 홈 → 전문(상세) → 피드 세 화면을 넘나드는 인터랙티브 온보딩.
// 실제 버튼 위에 스포트라이트를 띄우고, 그 버튼을 직접 눌러야 다음 단계로 넘어간다.
//
//  [홈]  1.HOME → 2.새로고침 → 3.북마크 → 4.LIBRARY → 5.Read Full Script
//        └ 5단계에서 실제 전문 화면이 열리고 ↓
//  [전문] 1.SCENE → 2.명대사의 장면 → 3.작품의 의의 → 4.꾹 눌러 하이라이트 → 5.+ HL 버튼
//        └ 5단계에서 피드로 이동 ↓
//  [피드] 1.하이라이트가 피드에 추가된 모습
//  [마침] '오늘의 명대사 읽으러 가기' → 홈으로
//
// m-app.js(실서비스) 와 onboarding-preview.html(로컬 미리보기)이 같은 모듈을 쓴다.
// 호출 측이 구현하는 콜백(모두 Promise 가능):
//   opts.onOpenDetail  — 홈 5단계: 전문 화면을 열고 준비되면 resolve
//   opts.onOpenFeed    — 전문 5단계: 전문을 닫고 피드 하이라이트 탭(+데모 카드)으로
//   opts.onEnd(idx)    — 투어 종료(마침/건너뛰기): 정리 + 홈 이동
// ---------------------------------------------------------------------------

const STEPS = [
  // ── 홈 화면 ──  (홈 탭을 다시 누르면 새 명대사로 바뀌어 별도 새로고침 버튼은 없앴어요)
  { sel: '.bottom-nav [data-nav="home"]', spot: '.bottom-nav [data-nav="home"] .nav-home-circle', round: true, scr: '홈', n: 1, tot: 4, eyebrow: '사용법', title: 'TODAY', desc: '오늘의 명대사를 볼 수 있어요.\n가운데 실타래(TODAY)를 누를 때마다 다른 명대사로 바뀌어요.' },
  { sel: '#today-bookmark',                  scr: '홈',   n: 2, tot: 4, title: '북마크해 두기',    desc: '마음에 들었다면 이 책갈피를 탭하세요. MY 페이지의 북마크에서 다시 꺼내볼 수 있어요.' },
  { sel: '.bottom-nav [data-nav="archive"]', scr: '홈',   n: 3, tot: 4, title: '도서 카탈로그(LIBRARY)', desc: '이제 LIBRARY에는 모든 작품이 책으로 진열돼요. 표지를 펼쳐 작품별 명대사를 둘러보세요.' },
  { sel: '#today-read',                      scr: '홈',   n: 4, tot: 4, title: '전문 읽으러 가기', desc: '한 줄만으론 아쉽죠. 이 버튼을 누르면 그 장면 전체가 펼쳐져요.', action: 'onOpenDetail' },
  // ── 전문(상세) 화면 ──
  { sel: '#detail-description-block',         scr: '전문', n: 1, tot: 5, title: '장면 설명(SCENE)', desc: '이 명대사가 언제·어떤 상황에서 나온 말인지 먼저 짚어줘요.' },
  { sel: '#detail-script',                    scr: '전문', n: 2, tot: 5, title: '명대사가 나온 장면', desc: '그 장면의 대본을 그대로 옮겼어요. 명대사를 맥락 속에서 읽어보세요.' },
  { sel: '#detail-significance-block',        scr: '전문', n: 3, tot: 5, title: '작품의 의의',     desc: '이 작품이 왜 오래 사랑받는 고전인지, 그 의미까지 담았어요.' },
  { sel: '#detail-script',                    scr: '전문', n: 4, tot: 5, title: '구절 하이라이트', desc: '마음에 닿는 문장을 꾹 눌러 드래그해 보세요. 선택하면 바로 다음으로 넘어가요.', advanceOnSelect: true },
  { sel: '#hl-add-btn',                       scr: '전문', n: 5, tot: 5, title: '하이라이트 저장', desc: '“+” 버튼을 누르면 나만의 하이라이트 게시와 공유를 할 수 있어요.', reveal: true, action: 'onOpenFeed' },
  // ── 피드 화면 ──
  { sel: '#cm-demo-hl',                       scr: '피드', n: 1, tot: 1, title: '피드에 담겼어요', desc: '방금 저장한 하이라이트예요. FEED에서 내 것과 다른 독자들의 명장면을 함께 볼 수 있어요.' },
  // ── 마침 ──
  { final: true, title: '오늘의 명대사', cta: '읽으러 가기', desc: '준비 끝!\n이제 오늘의 고전 명작을 만나러 가볼까요?' },
];

let els = null;
let idx = 0;
let opts = {};
let captureHandler = null;
let reposHandler = null;
let busy = false;            // 화면 전환 중 중복 클릭 방지
let selCleanup = null;       // 드래그(선택) 자동 진행 리스너 해제용

function buildEls() {
  els = {
    root:    document.querySelector('#coachmark'),
    hole:    document.querySelector('#cm-hole'),
    badge:   document.querySelector('#cm-badge'),
    tip:     document.querySelector('#cm-tip'),
    eyebrow: document.querySelector('#cm-eyebrow'),
    title:   document.querySelector('#cm-title'),
    desc:    document.querySelector('#cm-desc'),
    prog:    document.querySelector('#cm-progress'),
    skip:    document.querySelector('#cm-skip'),
    cta:     document.querySelector('#cm-cta'),
  };
}

export function startCoachmarkTour(o = {}) {
  if (!document.querySelector('#coachmark')) return false;
  buildEls();
  opts = o;
  idx = Math.min(Math.max(0, o.startAt | 0), STEPS.length - 1);
  busy = false;
  els.root.classList.add('open');

  els.skip.onclick = () => endTour();
  els.cta.onclick = () => endTour();  // 마침: '읽으러 가기' → onEnd 에서 홈 이동
  captureHandler = (e) => onDocClick(e);
  document.addEventListener('click', captureHandler, true);  // capture: 진짜 버튼 동작보다 먼저 가로챔
  reposHandler = () => positionCurrent();
  window.addEventListener('resize', reposHandler);
  window.addEventListener('scroll', reposHandler, true);

  renderStep();
  return true;
}

// 드래그(텍스트 선택)만 하면 클릭 없이 다음 단계로 — '구절 하이라이트' 단계용
function clearSelectAdvance() { if (selCleanup) { selCleanup(); selCleanup = null; } }
function setupSelectAdvance(step) {
  clearSelectAdvance();
  if (!step || !step.advanceOnSelect) return;
  const myIdx = idx;
  const sc = document.querySelector(step.sel);
  const check = () => {
    if (idx !== myIdx) return;  // 이미 다른 단계로 넘어갔으면 무시
    let txt = '';
    try { if (typeof window.__getScriptHlText === 'function') txt = (window.__getScriptHlText() || '').trim(); } catch {}
    if (!txt) {  // 데스크톱 네이티브 선택
      const sel = window.getSelection && window.getSelection();
      if (sel && !sel.isCollapsed && sel.rangeCount) {
        const t = String(sel.toString() || '').trim();
        if (t && sc && sc.contains(sel.getRangeAt(0).commonAncestorContainer)) txt = t;
      }
    }
    if (txt) { clearSelectAdvance(); advance(); }
  };
  const onUp = () => setTimeout(check, 40);  // 선택 확정 후 검사
  const onSel = () => check();
  document.addEventListener('selectionchange', onSel);
  if (sc) { sc.addEventListener('mouseup', onUp); sc.addEventListener('touchend', onUp); }
  selCleanup = () => {
    document.removeEventListener('selectionchange', onSel);
    if (sc) { sc.removeEventListener('mouseup', onUp); sc.removeEventListener('touchend', onUp); }
  };
}

function endTour() {
  if (!els) return;
  clearSelectAdvance();
  document.documentElement.classList.remove('cm-show-hl');
  els.root.classList.remove('open', 'final');
  if (captureHandler) document.removeEventListener('click', captureHandler, true);
  if (reposHandler) {
    window.removeEventListener('resize', reposHandler);
    window.removeEventListener('scroll', reposHandler, true);
  }
  if (opts.onEnd) opts.onEnd(idx);
}

function currentTargetEl() {
  const s = STEPS[idx];
  if (!s || s.final) return null;
  return document.querySelector(s.sel);
}

function onDocClick(e) {
  if (busy) { e.preventDefault(); e.stopPropagation(); return; }
  if (els.tip.contains(e.target)) return;  // 툴팁(건너뛰기·CTA)은 그대로 처리
  const target = currentTargetEl();
  if (target && (e.target === target || target.contains(e.target))) {
    e.preventDefault(); e.stopPropagation();  // 실제 동작은 막고 투어가 제어
    const s = STEPS[idx];
    if (s.action && opts[s.action]) {
      busy = true;
      Promise.resolve(opts[s.action]()).catch(() => {}).then(() => { busy = false; advance(); });
    } else {
      advance();
    }
  } else {
    e.preventDefault(); e.stopPropagation();  // 그 외 영역 클릭은 투어 유지를 위해 무시
  }
}

function advance() {
  if (idx < STEPS.length - 1) { idx += 1; renderStep(); }
  else endTour();
}

// 숨겨진 +HL 버튼을 해당 단계에서만 강제 노출. 실서비스의 selectionchange/mouseup 핸들러가
// 인라인 display:none 으로 다시 숨기므로, CSS `html.cm-show-hl #hl-add-btn { display:block!important }`
// 로 인라인을 이긴다. (단순 inline 변경은 곧바로 덮어써져 버튼이 사라짐)
function applyReveal(step) {
  document.documentElement.classList.toggle('cm-show-hl', !!(step && step.reveal));
}

function renderStep() {
  const s = STEPS[idx];
  const isFinal = !!s.final;

  els.eyebrow.textContent = isFinal ? '사용법' : (s.eyebrow || ('사용법 · ' + s.scr));
  els.title.textContent = s.title;
  els.desc.textContent = s.desc || '';
  els.prog.textContent = isFinal ? '' : (s.scr + ' ' + s.n + ' / ' + s.tot);
  els.cta.style.display = isFinal ? 'block' : 'none';
  if (isFinal) els.cta.textContent = s.cta;  // 카드 제목에 이미 '오늘의 명대사'가 있어 버튼은 '읽으러 가기'만
  els.root.classList.toggle('final', isFinal);
  els.root.setAttribute('data-idx', String(idx));
  els.root.setAttribute('data-sel', isFinal ? 'final' : s.sel);

  applyReveal(isFinal ? null : s);  // 숨겨진 버튼(+ HL)은 해당 단계에서만 보이게
  setupSelectAdvance(isFinal ? null : s);  // '구절 하이라이트' 단계는 드래그(선택)만으로 진행

  if (!isFinal) {
    const target = document.querySelector(s.sel);
    if (target && getComputedStyle(target).position !== 'fixed') {
      const r = target.getBoundingClientRect();
      if (r.top < 72 || r.bottom > window.innerHeight - 96) target.scrollIntoView({ block: 'center' });
    }
  }

  els.tip.classList.remove('cm-in'); void els.tip.offsetWidth; els.tip.classList.add('cm-in');
  positionCurrent();
}

function positionCurrent() {
  if (!els || !els.root.classList.contains('open')) return;
  const s = STEPS[idx];

  if (s.final) {  // 가운데 CTA 카드, 스포트라이트 없음 (전체 딤은 .final 배경)
    els.hole.style.display = 'none';
    els.badge.style.display = 'none';
    els.tip.style.top = '50%';
    els.tip.style.transform = 'translate(-50%, -50%)';
    return;
  }

  const target = document.querySelector(s.sel);
  if (!target || target.getClientRects().length === 0) { advance(); return; }  // 없거나 숨겨진 단계는 건너뜀

  els.tip.style.transform = '';  // final 에서 넘어온 inline transform 초기화
  // 강조 영역(spot)은 클릭 대상(sel)과 다를 수 있음 — 예: TODAY 버튼은 sel, 원형 실타래는 spot
  const spotEl = (s.spot && document.querySelector(s.spot)) || target;
  const r = spotEl.getBoundingClientRect();
  const pad = 8;

  els.hole.style.display = 'block';
  if (s.round) {  // 원형 실타래에 딱 맞는 원형 구멍
    const size = Math.max(r.width, r.height) + pad * 2;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    els.hole.style.left   = (cx - size / 2) + 'px';
    els.hole.style.top    = (cy - size / 2) + 'px';
    els.hole.style.width  = size + 'px';
    els.hole.style.height = size + 'px';
    els.hole.style.borderRadius = '50%';
  } else {
    els.hole.style.left   = (r.left - pad) + 'px';
    els.hole.style.top    = (r.top  - pad) + 'px';
    els.hole.style.width  = (r.width  + pad * 2) + 'px';
    els.hole.style.height = (r.height + pad * 2) + 'px';
    els.hole.style.borderRadius = '';  // CSS 기본(12px) 사각 모서리
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  els.badge.style.display = 'flex';
  els.badge.textContent = String(s.n);
  els.badge.style.left = clamp(r.left - pad - 6, 6, vw - 36) + 'px';
  els.badge.style.top  = clamp(r.top  - pad - 6, 6, vh - 36) + 'px';

  const below = (r.top + r.height / 2) < vh * 0.5;  // 대상이 위쪽이면 툴팁은 아래에
  /* 하단 nav(약 64px) + safe-area + 호흡 만큼 reserve — tip 이 nav 영역에 가려/잘리지 않게 */
  const BOTTOM_RESERVE = 110;
  /* 모바일 visualViewport (주소창 토글 시 더 정확) */
  const vvh = (window.visualViewport && window.visualViewport.height) || vh;
  requestAnimationFrame(() => {
    const th = els.tip.offsetHeight;
    /* tip 이 화면보다 크면 max-height 로 잘라 스크롤 가능하게 */
    const maxTh = vvh - 32 - BOTTOM_RESERVE;
    if (th > maxTh) {
      els.tip.style.maxHeight = maxTh + 'px';
      els.tip.style.overflowY = 'auto';
    } else {
      els.tip.style.maxHeight = '';
      els.tip.style.overflowY = '';
    }
    const th2 = els.tip.offsetHeight;
    const top = below
      ? Math.min(r.bottom + 18, vvh - th2 - BOTTOM_RESERVE)
      : Math.max(16, r.top - th2 - 18);
    els.tip.style.top = Math.max(16, top) + 'px';
  });
}

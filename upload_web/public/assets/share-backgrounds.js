// 공유 카드지(Premium/Royal) 관리 — 어드민 전용.
// 관리자는 [등급 + 책 + 이미지]만 입력하면 된다. 고유 id(slug)·이름·가격·work_title 은 자동.
// 테마는 work_id 로 책에 연결 → 앱에서 그 책 카드를 공유할 때 해당 테마가 맨 앞에 뜬다.
// 이미지는 share-backgrounds 버킷, 메타는 share_backgrounds 테이블. 쓰기 권한은 RLS(is_admin())가 강제.
import { getSupabase, requireSessionOrRedirect } from './supabase-client.js';

const $ = (s) => document.querySelector(s);

const BUCKET = 'share-backgrounds';
const TABLE = 'share_backgrounds';
const DEFAULT_PRICE = { premium: 999, royal: 2999 };

let editingSlug = null;     // 수정 중인 카드지 slug (null = 새로 추가)
let currentImageUrl = '';   // 수정 시 기존 이미지 URL (새 파일 안 고르면 유지)
let pendingFile = null;     // 선택했지만 아직 업로드 안 한 이미지 파일
let isAdmin = false;
let works = [];                       // [{work_id, title, author}] (제목순)
const worksById = new Map();          // String(work_id) -> {title, author}
let existingSlugs = new Set();        // 등록된 slug — 자동 slug 충돌 회피용

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.opacity = '0'; }, 1800);
}

const FORM_IDS = ['f-tier', 'f-book', 'f-book-filter', 'f-active', 'pick-image', 'save-btn'];

// ---------- 탭 (등록 / 조회) ----------
function tabBtnClass(active) {
  return `px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors ${active
    ? 'font-bold text-primary border-primary'
    : 'font-semibold text-on-surface-variant border-transparent hover:text-on-background'}`;
}
function setTab(which) {
  const isReg = which === 'register';
  const reg = document.getElementById('tab-register');
  const brw = document.getElementById('tab-browse');
  if (reg) reg.style.display = isReg ? 'flex' : 'none';
  if (brw) brw.style.display = isReg ? 'none' : 'flex';
  const rb = document.getElementById('tab-btn-register');
  const bb = document.getElementById('tab-btn-browse');
  if (rb) rb.className = tabBtnClass(isReg);
  if (bb) bb.className = tabBtnClass(!isReg);
  if (!isReg) loadAndRender();   // 조회 진입 시 최신 목록으로 갱신
}

(async () => {
  const token = await requireSessionOrRedirect('/');
  if (!token) return;
  const sb = await getSupabase();
  try {
    const { data } = await sb.auth.getUser();
    const u = data?.user;
    isAdmin = (u?.app_metadata?.role === 'admin');
    const emailEl = $('#user-email');
    if (emailEl && u?.email) emailEl.textContent = u.email.replace('@admin.local', '');
  } catch { /* noop */ }

  if (!isAdmin) {
    $('#not-admin-banner')?.classList.remove('hidden');
    FORM_IDS.forEach((id) => { const e = document.getElementById(id); if (e) e.disabled = true; });
  }

  $('#logout-btn')?.addEventListener('click', async () => {
    try { await sb.auth.signOut(); } catch { /* noop */ }
    location.href = '/';
  });
  $('#save-btn')?.addEventListener('click', onSave);
  $('#cancel-edit')?.addEventListener('click', resetForm);
  $('#pick-image')?.addEventListener('click', (e) => { e.stopPropagation(); openImagePicker(); });
  $('#img-file')?.addEventListener('change', onPickImage);
  setupDropZone();
  $('#f-book-filter')?.addEventListener('input', (e) => populateBookSelect(e.target.value));

  // 탭 — 등록 / 조회
  $('#tab-btn-register')?.addEventListener('click', () => setTab('register'));
  $('#tab-btn-browse')?.addEventListener('click', () => setTab('browse'));
  $('#browse-refresh')?.addEventListener('click', () => loadAndRender());

  await loadWorks();
  await loadAndRender();
})();

// ---------- 책 목록 ----------
async function loadWorks() {
  try {
    const sb = await getSupabase();
    const { data, error } = await sb.from('works').select('work_id, title, author').order('title');
    if (error) throw error;
    works = data || [];
    worksById.clear();
    works.forEach((w) => worksById.set(String(w.work_id), { title: w.title, author: w.author }));
    populateBookSelect('');
  } catch (e) {
    console.warn('[share-bg] loadWorks failed', e);
    const sel = $('#f-book');
    if (sel) sel.innerHTML = '<option value="">책 목록을 불러오지 못했어요</option>';
  }
}

// 필터로 좁힌 책 목록을 select(listbox)에 렌더. 선택 중인 책은 필터에서 빠져도 유지.
function populateBookSelect(filter) {
  const sel = $('#f-book');
  if (!sel) return;
  const keep = sel.value;
  const f = (filter || '').trim().toLowerCase();
  let list = f
    ? works.filter((w) => (w.title || '').toLowerCase().includes(f) || (w.author || '').toLowerCase().includes(f))
    : works;
  if (keep && !list.some((w) => String(w.work_id) === keep) && worksById.has(keep)) {
    const b = worksById.get(keep);
    list = [{ work_id: Number(keep), title: b.title, author: b.author }, ...list];
  }
  sel.innerHTML = list.map((w) =>
    `<option value="${w.work_id}">${escapeHtml(w.title)}${w.author ? ' — ' + escapeHtml(w.author) : ''}</option>`
  ).join('') || '<option value="" disabled>일치하는 책이 없어요</option>';
  if (keep) sel.value = keep;
}

// ---------- 이미지 선택/드래그 (미리보기만, 업로드는 저장 시) ----------
function openImagePicker() {
  if (!isAdmin) return;
  $('#img-file')?.click();
}
function acceptImageFile(file) {
  if (!file) return;
  if (!isAdmin) return;
  if (!/^image\//.test(file.type)) { toast('이미지 파일만 올릴 수 있어요'); return; }
  if (file.size > 5 * 1024 * 1024) { toast('이미지는 5MB 이하만 가능해요'); return; }
  pendingFile = file;
  const preview = $('#img-preview');
  const ph = $('#img-placeholder');
  if (preview) {
    preview.src = URL.createObjectURL(file);
    preview.classList.remove('hidden');
  }
  ph?.classList.add('hidden');
  const st = $('#img-status');
  if (st) st.textContent = file.name;
}
function onPickImage(ev) {
  const input = ev.target;
  const file = input.files && input.files[0];
  input.value = '';   // 같은 파일 다시 선택 가능하게 초기화
  acceptImageFile(file);
}
// 드롭존 — 클릭=파일 선택, 드래그&드롭=첫 이미지 파일 채택. 드래그 중 테두리 강조.
function setupDropZone() {
  const dz = document.getElementById('drop-zone');
  if (!dz) return;
  dz.addEventListener('click', () => openImagePicker());
  const hi = () => { if (isAdmin) dz.classList.add('border-primary', 'bg-primary/5'); };
  const lo = () => dz.classList.remove('border-primary', 'bg-primary/5');
  ['dragenter', 'dragover'].forEach((t) =>
    dz.addEventListener(t, (e) => { e.preventDefault(); e.stopPropagation(); hi(); }));
  ['dragleave', 'dragend'].forEach((t) =>
    dz.addEventListener(t, (e) => { e.preventDefault(); e.stopPropagation(); lo(); }));
  dz.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation(); lo();
    if (!isAdmin) return;
    acceptImageFile(e.dataTransfer?.files?.[0]);
  });
}

async function uploadImage(slug, file) {
  const sb = await getSupabase();
  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const safeSlug = slug.replace(/[^a-z0-9_-]/gi, '') || 'bg';
  const path = `${safeSlug}-${Date.now()}.${ext}`;   // 매 업로드마다 새 경로 → 긴 캐시여도 stale 없음
  const { error } = await sb.storage.from(BUCKET).upload(path, file, {
    cacheControl: '31536000', upsert: false, contentType: file.type || undefined,
  });
  if (error) throw error;
  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// 공개 URL → 버킷 내부 경로 (삭제용). 못 구하면 null.
function pathFromPublicUrl(url) {
  const marker = `/object/public/${BUCKET}/`;
  const i = String(url || '').indexOf(marker);
  return i >= 0 ? url.slice(i + marker.length) : null;
}

// 자동 slug — 등급+책 기준. 수정 시 기존 slug 유지. 같은 책에 같은 등급 테마가 또 있으면 _2, _3…
function makeSlug(tier, workId) {
  if (editingSlug) return editingSlug;
  const base = `${tier}_w${workId}`;
  if (!existingSlugs.has(base)) return base;
  let n = 2;
  while (existingSlugs.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

async function loadAndRender() {
  const loading = $('#list-loading');
  try {
    const sb = await getSupabase();
    // admin 은 share_bg_admin_select 정책 덕에 비활성 행까지 전부 조회된다(숨김 카드지 재표시 가능).
    const { data, error } = await sb
      .from(TABLE)
      .select('slug, name, tier, price, image_url, ink, work_id, work_title, sort_order, is_active, updated_at')
      .order('tier', { ascending: true })
      .order('sort_order', { ascending: true });
    if (error) throw error;
    existingSlugs = new Set((data || []).map((r) => r.slug));
    renderList(data || []);
  } catch (err) {
    console.warn('[share-bg] load failed', err);
    toast('불러오기 실패: ' + (err.message || ''));
  } finally {
    if (loading) loading.classList.add('hidden');
  }
}

function renderList(rows) {
  const list = $('#bg-list');
  const empty = $('#list-empty');
  const countEl = $('#browse-count');
  if (countEl) countEl.textContent = rows.length ? `(${rows.length})` : '';
  if (!list) return;
  list.innerHTML = '';
  if (!rows.length) { empty?.classList.remove('hidden'); return; }
  empty?.classList.add('hidden');

  for (const b of rows) {
    const tierBadge = b.tier === 'royal'
      ? 'bg-tertiary/15 text-tertiary' : 'bg-primary/15 text-primary';
    const card = document.createElement('div');
    card.className = 'bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden flex flex-col';
    card.innerHTML = `
      <div class="relative aspect-[9/16] bg-surface-container-low">
        <img src="${escapeHtml(b.image_url)}" alt="${escapeHtml(b.name)}" loading="lazy" class="w-full h-full object-cover" />
        ${b.is_active ? '' : '<div class="absolute inset-0 bg-black/45 flex items-center justify-center text-white text-xs font-bold">비활성</div>'}
        <span class="absolute top-1.5 left-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${tierBadge}">${escapeHtml((b.tier || '').toUpperCase())}</span>
      </div>
      <div class="p-2.5 flex flex-col gap-1">
        <p class="text-sm font-bold text-on-background truncate" title="${escapeHtml(b.name)}">${escapeHtml(b.name || '(책 미지정)')}</p>
        <p class="text-xs font-mono text-on-surface-variant truncate">${escapeHtml(b.slug)} · ${b.price || 0}🧶</p>
        ${isAdmin ? `<div class="flex gap-1.5 pt-1">
          <button class="edit-btn flex-1 px-2 py-1 rounded-lg text-xs border border-outline-variant text-on-surface-variant hover:bg-surface-container-low">수정</button>
          <button class="active-btn px-2 py-1 rounded-lg text-xs border border-outline-variant text-on-surface-variant hover:bg-surface-container-low" title="활성/비활성 토글">${b.is_active ? '숨김' : '표시'}</button>
          <button class="del-btn px-2 py-1 rounded-lg text-xs border border-error/40 text-error hover:bg-error-container">삭제</button>
        </div>` : ''}
      </div>
    `;
    if (isAdmin) {
      card.querySelector('.edit-btn')?.addEventListener('click', () => startEdit(b));
      card.querySelector('.active-btn')?.addEventListener('click', () => toggleActive(b));
      card.querySelector('.del-btn')?.addEventListener('click', () => onDelete(b));
    }
    list.appendChild(card);
  }
}

function readForm() {
  const workId = $('#f-book').value ? parseInt($('#f-book').value, 10) : null;
  const book = workId != null ? worksById.get(String(workId)) : null;
  return {
    tier: $('#f-tier').value || 'premium',
    workId,
    workTitle: book?.title || '',
    isActive: $('#f-active').checked,
  };
}

function showMsg(text, ok) {
  const el = $('#form-msg');
  if (!el) return;
  el.textContent = text;
  el.className = 'text-sm ' + (ok ? 'text-secondary' : 'text-error');
  el.classList.remove('hidden');
}

async function onSave() {
  if (!isAdmin) return;
  const f = readForm();
  if (f.workId == null) { showMsg('책을 선택해주세요.', false); return; }
  if (!pendingFile && !currentImageUrl) { showMsg('배경 이미지를 선택해주세요.', false); return; }

  const slug = makeSlug(f.tier, f.workId);
  const btn = $('#save-btn');
  btn.disabled = true;
  showMsg('저장 중…', true);
  const oldImageUrl = currentImageUrl;   // 교체 전 URL (성공 시 정리)
  let uploadedUrl = null;                // 이번 호출에서 새로 올린 객체 (실패 시 정리)
  try {
    let imageUrl = currentImageUrl;
    if (pendingFile) { imageUrl = await uploadImage(slug, pendingFile); uploadedUrl = imageUrl; }

    const sb = await getSupabase();
    // ink·sort_order 는 보내지 않음 → DB 기본값(ink #3B2A1A, sort_order 0) 적용. (관리자는 등급/책/이미지만)
    const payload = {
      slug, tier: f.tier, price: DEFAULT_PRICE[f.tier] || 0,
      name: f.workTitle, work_id: f.workId, work_title: f.workTitle,
      image_url: imageUrl, is_active: f.isActive,
      updated_at: new Date().toISOString(),
    };
    const { error } = await sb.from(TABLE).upsert(payload, { onConflict: 'slug' });
    if (error) throw error;
    // 이미지 교체 성공 → 이전 객체 best-effort 제거(고아 방지).
    if (uploadedUrl && oldImageUrl && oldImageUrl !== uploadedUrl) {
      const oldPath = pathFromPublicUrl(oldImageUrl);
      if (oldPath) { try { await sb.storage.from(BUCKET).remove([oldPath]); } catch { /* noop */ } }
    }
    toast(editingSlug ? '카드지를 수정했습니다' : '카드지를 등록했습니다');
    resetForm();
    await loadAndRender();
  } catch (err) {
    // upsert 실패 시 방금 올린 객체 best-effort 제거(고아 방지).
    if (uploadedUrl) {
      const p = pathFromPublicUrl(uploadedUrl);
      if (p) { try { const sb = await getSupabase(); await sb.storage.from(BUCKET).remove([p]); } catch { /* noop */ } }
    }
    console.warn('[share-bg] save failed', err);
    const m = String(err?.message || err);
    showMsg(/row-level security|permission|policy/i.test(m)
      ? '권한이 없습니다 — admin 계정으로 로그인해야 합니다.'
      : (/bucket|not found|404/i.test(m)
        ? '업로드 실패 — Storage 버킷(share-backgrounds)이 아직 없을 수 있어요'
        : ('저장 실패: ' + m)), false);
  } finally {
    btn.disabled = false;
  }
}

function startEdit(b) {
  setTab('register');   // 조회 탭에서 '수정' 눌러도 폼(등록 탭)이 보이도록 전환
  editingSlug = b.slug;
  currentImageUrl = b.image_url || '';
  pendingFile = null;
  $('#f-tier').value = b.tier || 'premium';
  // 책 선택 — work_id 우선, 없으면 work_title/name 으로 역매칭.
  $('#f-book-filter').value = '';
  populateBookSelect('');
  if (b.work_id != null) {
    $('#f-book').value = String(b.work_id);
  } else {
    const m = works.find((w) => (w.title || '') === (b.work_title || b.name));
    if (m) $('#f-book').value = String(m.work_id);
  }
  $('#f-active').checked = !!b.is_active;
  const preview = $('#img-preview');
  if (preview && b.image_url) { preview.src = b.image_url; preview.classList.remove('hidden'); }
  $('#img-placeholder')?.classList.add('hidden');
  $('#img-status').textContent = '기존 이미지 (바꾸려면 새로 선택)';
  $('#form-title').textContent = `카드지 수정 (${b.slug})`;
  $('#save-btn').textContent = '수정 저장';
  $('#cancel-edit').classList.remove('hidden');
  $('#form-msg')?.classList.add('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetForm() {
  editingSlug = null;
  currentImageUrl = '';
  pendingFile = null;
  $('#f-tier').value = 'premium';
  $('#f-book-filter').value = '';
  populateBookSelect('');
  $('#f-book').value = '';
  $('#f-active').checked = true;
  const preview = $('#img-preview');
  if (preview) { preview.src = ''; preview.classList.add('hidden'); }
  $('#img-placeholder')?.classList.remove('hidden');
  $('#img-status').textContent = '';
  $('#form-title').textContent = '새 카드지 추가';
  $('#save-btn').textContent = '카드지 등록';
  $('#cancel-edit').classList.add('hidden');
  $('#form-msg')?.classList.add('hidden');
}

// 활성/비활성 토글 — 소프트 숨김(과거 공유 링크의 bg_id 가 깨지지 않게 행은 유지).
async function toggleActive(b) {
  if (!isAdmin) return;
  try {
    const sb = await getSupabase();
    const { error } = await sb.from(TABLE)
      .update({ is_active: !b.is_active, updated_at: new Date().toISOString() })
      .eq('slug', b.slug);
    if (error) throw error;
    toast(b.is_active ? '숨김 처리했습니다' : '다시 표시합니다');
    await loadAndRender();
  } catch (err) {
    console.warn('[share-bg] toggle failed', err);
    toast('변경 실패: ' + (err.message || ''));
  }
}

// 완전 삭제 — 행 + Storage 객체 제거. (가급적 '숨김'을 쓰세요: 과거 공유 링크가 이 카드지를
//   참조하면 받는 쪽 미리보기가 기본 카드지로 폴백됩니다.)
async function onDelete(b) {
  if (!isAdmin) return;
  if (!confirm(`'${b.name}'(${b.slug}) 카드지를 완전히 삭제할까요?\n과거 공유 링크가 이 배경을 참조하면 기본 카드지로 보입니다.\n(숨기기만 하려면 '숨김' 버튼을 쓰세요.)`)) return;
  try {
    const sb = await getSupabase();
    const { error } = await sb.from(TABLE).delete().eq('slug', b.slug);
    if (error) throw error;
    // Storage 객체도 best-effort 제거(실패해도 무시).
    const path = pathFromPublicUrl(b.image_url);
    if (path) { try { await sb.storage.from(BUCKET).remove([path]); } catch { /* noop */ } }
    toast('삭제했습니다');
    if (editingSlug === b.slug) resetForm();
    await loadAndRender();
  } catch (err) {
    console.warn('[share-bg] delete failed', err);
    toast('삭제 실패: ' + (err.message || ''));
  }
}

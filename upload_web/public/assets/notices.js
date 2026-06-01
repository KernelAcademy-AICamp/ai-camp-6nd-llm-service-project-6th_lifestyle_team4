// 공지사항 관리 — 어드민 전용. getSupabase 클라이언트로 직접 CRUD.
// 쓰기 권한은 RLS(public.is_admin())가 강제한다. 비관리자 계정은 폼을 비활성화한다.
import { getSupabase, requireSessionOrRedirect } from './supabase-client.js';

const $ = (s) => document.querySelector(s);

const TAG_LABEL = { update: 'UPDATE', notice: 'NOTICE', event: 'EVENT' };
const TAG_BADGE = {
  update: 'bg-tertiary/15 text-tertiary',
  notice: 'bg-secondary/15 text-secondary',
  event:  'bg-primary/15 text-primary',
};

const NOTICE_IMAGES_BUCKET = 'notice-images';

let editingId = null;
let isAdmin = false;

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// 공지 본문 마크다운 소부분집합 → 안전 HTML (web_pwa renderNoticeBodyHtml 과 동일 규칙).
//   **굵게** · ## 소제목 · - 항목/• 항목 · ![설명](https://…) · 빈 줄=문단 간격
function renderNoticeBodyHtml(raw) {
  const inline = (s) => escapeHtml(s).replace(/\*\*([^*\n][^*]*?)\*\*/g, '<strong>$1</strong>');
  const lines = String(raw ?? '').split('\n');
  const out = [];
  let inList = false;
  const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };
  for (const line of lines) {
    const t = line.trim();
    let m;
    if ((m = t.match(/^!\[([^\]]*)\]\((https:\/\/[^\s)]+)\)$/))) {
      closeList();
      out.push(`<img class="nb-img" src="${escapeHtml(m[2])}" alt="${escapeHtml(m[1])}" loading="lazy">`);
    } else if ((m = t.match(/^#{1,3}\s+(.+)$/))) {
      closeList();
      out.push(`<p class="nb-h">${inline(m[1])}</p>`);
    } else if ((m = t.match(/^[-•]\s+(.+)$/))) {
      if (!inList) { out.push('<ul class="nb-ul">'); inList = true; }
      out.push(`<li>${inline(m[1])}</li>`);
    } else if (t === '') {
      closeList();
      out.push('<div class="nb-gap"></div>');
    } else {
      closeList();
      out.push(`<p class="nb-p">${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join('');
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

function fmtDate(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch { return ''; }
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
    ['f-tag', 'f-title', 'f-body', 'f-pinned', 'f-published', 'save-btn',
     'md-bold', 'md-head', 'md-list', 'md-image'].forEach((id) => {
      const e = document.getElementById(id);
      if (e) e.disabled = true;
    });
  }

  $('#logout-btn')?.addEventListener('click', async () => {
    try { await sb.auth.signOut(); } catch { /* noop */ }
    location.href = '/';
  });
  $('#save-btn')?.addEventListener('click', onSave);
  $('#cancel-edit')?.addEventListener('click', resetForm);

  // ---- 본문 서식 툴바 / 미리보기 / 이미지 업로드 ----
  $('#f-body')?.addEventListener('input', updatePreview);
  $('#md-bold')?.addEventListener('click', () => wrapSelection('**', '**', '굵게'));
  $('#md-head')?.addEventListener('click', () => prefixLine('## '));
  $('#md-list')?.addEventListener('click', () => prefixLine('- '));
  $('#md-image')?.addEventListener('click', () => $('#md-file')?.click());
  $('#md-file')?.addEventListener('change', onPickImage);
  updatePreview();

  await loadAndRender();
})();

// ---------- 본문 편집 도우미 ----------
function updatePreview() {
  const el = $('#body-preview');
  if (!el) return;
  const html = renderNoticeBodyHtml($('#f-body')?.value || '');
  el.innerHTML = html || '<span class="text-on-surface-variant/50">미리보기가 여기에 표시됩니다.</span>';
}

function wrapSelection(before, after, placeholder) {
  const ta = $('#f-body');
  if (!ta || ta.disabled) return;
  const s = ta.selectionStart, e = ta.selectionEnd;
  const val = ta.value;
  const sel = val.slice(s, e) || placeholder || '텍스트';
  ta.value = val.slice(0, s) + before + sel + after + val.slice(e);
  ta.focus();
  ta.selectionStart = s + before.length;
  ta.selectionEnd = s + before.length + sel.length;
  updatePreview();
}

function prefixLine(prefix) {
  const ta = $('#f-body');
  if (!ta || ta.disabled) return;
  const s = ta.selectionStart;
  const val = ta.value;
  const lineStart = val.lastIndexOf('\n', s - 1) + 1;
  ta.value = val.slice(0, lineStart) + prefix + val.slice(lineStart);
  ta.focus();
  ta.selectionStart = ta.selectionEnd = s + prefix.length;
  updatePreview();
}

function insertAtCursor(text) {
  const ta = $('#f-body');
  if (!ta) return;
  const s = ta.selectionStart, e = ta.selectionEnd;
  const val = ta.value;
  ta.value = val.slice(0, s) + text + val.slice(e);
  ta.focus();
  ta.selectionStart = ta.selectionEnd = s + text.length;
  updatePreview();
}

async function onPickImage(ev) {
  const input = ev.target;
  const file = input.files && input.files[0];
  input.value = '';            // 같은 파일 다시 선택 가능하게 초기화
  if (!file) return;
  if (!isAdmin) return;
  if (!/^image\//.test(file.type)) { toast('이미지 파일만 올릴 수 있어요'); return; }
  if (file.size > 5 * 1024 * 1024) { toast('이미지는 5MB 이하만 가능해요'); return; }

  const statusEl = $('#md-status');
  const btn = $('#md-image');
  if (btn) btn.disabled = true;
  if (statusEl) statusEl.textContent = '이미지 업로드 중…';
  try {
    const url = await uploadNoticeImage(file);
    insertAtCursor(`\n![](${url})\n`);
    if (statusEl) statusEl.textContent = '이미지가 본문에 추가됐어요';
    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2500);
  } catch (err) {
    console.warn('[notices] image upload failed', err);
    const m = String(err?.message || err);
    if (statusEl) statusEl.textContent = '';
    toast(/bucket|not found|404/i.test(m)
      ? '업로드 실패 — Storage 버킷(notice-images)이 아직 없을 수 있어요'
      : ('이미지 업로드 실패: ' + m));
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function uploadNoticeImage(file) {
  const sb = await getSupabase();
  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from(NOTICE_IMAGES_BUCKET).upload(path, file, {
    cacheControl: '3600', upsert: false, contentType: file.type || undefined,
  });
  if (error) throw error;
  const { data } = sb.storage.from(NOTICE_IMAGES_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function loadAndRender() {
  const loading = $('#list-loading');
  try {
    const sb = await getSupabase();
    const { data, error } = await sb
      .from('notices')
      .select('notice_id, tag, title, body, pinned, published, created_at')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    renderList(data || []);
  } catch (err) {
    console.warn('[notices] load failed', err);
    toast('불러오기 실패: ' + (err.message || ''));
  } finally {
    if (loading) loading.classList.add('hidden');
  }
}

function renderList(rows) {
  const list = $('#notice-list');
  const empty = $('#list-empty');
  if (!list) return;
  list.innerHTML = '';
  if (!rows.length) { empty?.classList.remove('hidden'); return; }
  empty?.classList.add('hidden');

  for (const n of rows) {
    const tag = String(n.tag || 'notice').toLowerCase();
    const card = document.createElement('div');
    card.className = 'bg-surface-container-lowest border border-outline-variant rounded-xl p-5 flex flex-col gap-2';
    card.innerHTML = `
      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-[10px] font-bold tracking-wider px-2 py-1 rounded ${TAG_BADGE[tag] || TAG_BADGE.notice}">${escapeHtml(TAG_LABEL[tag] || tag.toUpperCase())}</span>
        ${n.pinned ? '<span class="text-[10px] font-bold px-2 py-1 rounded bg-primary/10 text-primary">📌 고정</span>' : ''}
        ${n.published ? '' : '<span class="text-[10px] font-bold px-2 py-1 rounded bg-outline-variant text-on-surface-variant">비공개</span>'}
        <span class="ml-auto text-xs text-on-surface-variant">${escapeHtml(fmtDate(n.created_at))}</span>
      </div>
      <h4 class="font-bold text-on-background">${escapeHtml(n.title || '')}</h4>
      <div class="nb-body text-sm text-on-surface-variant leading-relaxed">${renderNoticeBodyHtml(n.body || '')}</div>
      ${isAdmin ? `<div class="flex gap-2 justify-end pt-1">
        <button class="edit-btn px-3 py-1.5 rounded-lg text-sm border border-outline-variant text-on-surface-variant hover:bg-surface-container-low" data-id="${n.notice_id}">수정</button>
        <button class="del-btn px-3 py-1.5 rounded-lg text-sm border border-error/40 text-error hover:bg-error-container" data-id="${n.notice_id}">삭제</button>
      </div>` : ''}
    `;
    if (isAdmin) {
      card.querySelector('.edit-btn')?.addEventListener('click', () => startEdit(n));
      card.querySelector('.del-btn')?.addEventListener('click', () => onDelete(n.notice_id));
    }
    list.appendChild(card);
  }
}

function readForm() {
  return {
    tag: $('#f-tag').value || 'notice',
    title: ($('#f-title').value || '').trim(),
    body: ($('#f-body').value || '').trim(),
    pinned: $('#f-pinned').checked,
    published: $('#f-published').checked,
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
  if (!f.title) { showMsg('제목을 입력해주세요.', false); return; }
  if (!f.body)  { showMsg('본문을 입력해주세요.', false); return; }
  const btn = $('#save-btn');
  btn.disabled = true;
  try {
    const sb = await getSupabase();
    const payload = { tag: f.tag, title: f.title, body: f.body, pinned: f.pinned, published: f.published };
    if (editingId != null) {
      const { error } = await sb.from('notices').update(payload).eq('notice_id', editingId);
      if (error) throw error;
      toast('공지를 수정했습니다');
    } else {
      const { error } = await sb.from('notices').insert(payload);
      if (error) throw error;
      toast('공지를 등록했습니다');
    }
    resetForm();
    await loadAndRender();
  } catch (err) {
    console.warn('[notices] save failed', err);
    const m = String(err?.message || err);
    showMsg(/row-level security|permission|policy/i.test(m)
      ? '권한이 없습니다 — admin 계정으로 로그인해야 합니다.'
      : ('저장 실패: ' + m), false);
  } finally {
    btn.disabled = false;
  }
}

function startEdit(n) {
  editingId = n.notice_id;
  $('#f-tag').value = n.tag || 'notice';
  $('#f-title').value = n.title || '';
  $('#f-body').value = n.body || '';
  $('#f-pinned').checked = !!n.pinned;
  $('#f-published').checked = !!n.published;
  $('#form-title').textContent = `공지 수정 (#${n.notice_id})`;
  $('#save-btn').textContent = '수정 저장';
  $('#cancel-edit').classList.remove('hidden');
  $('#form-msg')?.classList.add('hidden');
  updatePreview();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetForm() {
  editingId = null;
  $('#f-tag').value = 'notice';
  $('#f-title').value = '';
  $('#f-body').value = '';
  $('#f-pinned').checked = false;
  $('#f-published').checked = true;
  $('#form-title').textContent = '새 공지 작성';
  $('#save-btn').textContent = '공지 등록';
  $('#cancel-edit').classList.add('hidden');
  $('#form-msg')?.classList.add('hidden');
  updatePreview();
}

async function onDelete(id) {
  if (!isAdmin) return;
  if (!confirm('이 공지를 삭제할까요?')) return;
  try {
    const sb = await getSupabase();
    const { error } = await sb.from('notices').delete().eq('notice_id', id);
    if (error) throw error;
    toast('삭제했습니다');
    if (editingId === id) resetForm();
    await loadAndRender();
  } catch (err) {
    console.warn('[notices] delete failed', err);
    toast('삭제 실패: ' + (err.message || ''));
  }
}

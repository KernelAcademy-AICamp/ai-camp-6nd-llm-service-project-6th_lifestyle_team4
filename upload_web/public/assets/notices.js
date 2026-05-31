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

let editingId = null;
let isAdmin = false;

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
    ['f-tag', 'f-title', 'f-body', 'f-pinned', 'f-published', 'save-btn'].forEach((id) => {
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

  await loadAndRender();
})();

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
      <p class="text-sm text-on-surface-variant whitespace-pre-line leading-relaxed">${escapeHtml(n.body || '')}</p>
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

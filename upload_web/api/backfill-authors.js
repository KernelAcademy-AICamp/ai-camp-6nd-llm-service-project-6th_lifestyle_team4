import { requireAdmin, AuthError } from '../lib/auth.js';
import { supabaseAdmin } from '../lib/supabase-admin.js';
import { runKoreanizeAuthor } from '../lib/anthropic.js';

// 기존 works.author 가 라틴 문자를 포함하는(즉 영문/혼용) 행을 골라
// LLM(runKoreanizeAuthor)으로 통용 한국어 표기로 변환해 일괄 업데이트.
// - 관리자만 호출 가능.
// - 한 번에 limit개(기본 5, 최대 15)만 처리하고 남은 개수를 돌려준다.
//   → 클라이언트가 remaining 이 0이 될 때까지 반복 호출하면 전체 백필 완료.

function clampInt(value, min, max, dflt) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return dflt;
  return Math.max(min, Math.min(max, n));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    await requireAdmin(req);

    const limit = clampInt(req.query?.limit, 1, 15, 5);

    // PostgREST 의 regex 필터(match·~)가 클라이언트 버전에 따라 파싱 오류를 내는
    // 경우가 있어, author NOT NULL 행을 전부 받아 JS 에서 라틴 문자 포함 여부로
    // 거른다. works 테이블은 보통 수십~수백 행이라 충분히 빠르다.
    const { data: allAuthors, error: selErr } = await supabaseAdmin
      .from('works')
      .select('work_id, title, author')
      .not('author', 'is', null)
      .order('work_id', { ascending: true });
    if (selErr) throw selErr;

    const englishCandidates = (allAuthors || []).filter(
      (w) => typeof w.author === 'string' && /[A-Za-z]/.test(w.author)
    );
    const batch = englishCandidates.slice(0, limit);

    const results = [];
    for (const w of batch) {
      const before = w.author;
      try {
        const ko = await runKoreanizeAuthor(before);
        const next = (ko || '').trim();
        if (!next || next === before) {
          results.push({ work_id: w.work_id, title: w.title, before, after: next || before, changed: false });
          continue;
        }
        const { error: updErr } = await supabaseAdmin
          .from('works')
          .update({ author: next })
          .eq('work_id', w.work_id);
        if (updErr) throw updErr;
        results.push({ work_id: w.work_id, title: w.title, before, after: next, changed: true });
      } catch (e) {
        results.push({ work_id: w.work_id, title: w.title, before, error: e?.message || String(e) });
      }
    }

    // 아직 영문이 남아 있는 행 수 (배치 처리 직후 재조회)
    const { data: afterAll, error: cntErr } = await supabaseAdmin
      .from('works')
      .select('work_id, author')
      .not('author', 'is', null);
    if (cntErr) throw cntErr;
    const remaining = (afterAll || []).filter(
      (w) => typeof w.author === 'string' && /[A-Za-z]/.test(w.author)
    ).length;

    return res.status(200).json({
      processed: results.length,
      changed: results.filter((r) => r.changed).length,
      remaining: remaining ?? 0,
      results,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.status || 401).json({ error: err.message });
    }
    console.error('[backfill-authors] error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}

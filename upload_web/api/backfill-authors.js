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

    // author 가 라틴 문자를 포함하는 행만 대상.
    // PostgREST 의 정규식 매치 연산자는 'match' (Postgres `~` 와 동일, case-sensitive).
    const { data: works, error: selErr } = await supabaseAdmin
      .from('works')
      .select('work_id, title, author')
      .not('author', 'is', null)
      .filter('author', 'match', '[A-Za-z]')
      .order('work_id', { ascending: true })
      .limit(limit);
    if (selErr) throw selErr;

    const results = [];
    for (const w of works || []) {
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

    // 아직 영문이 남아 있는 행 수
    const { count: remaining, error: cntErr } = await supabaseAdmin
      .from('works')
      .select('work_id', { count: 'exact', head: true })
      .not('author', 'is', null)
      .filter('author', 'match', '[A-Za-z]');
    if (cntErr) throw cntErr;

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

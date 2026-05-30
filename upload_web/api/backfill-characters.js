import { requireAdmin, AuthError } from '../lib/auth.js';
import { supabaseAdmin } from '../lib/supabase-admin.js';
import { runExtractCharacters } from '../lib/anthropic.js';

// 기존 작품(works)의 등장인물 목록(characters)이 비어 있는(NULL) 것들을 골라
// full_script_text 에서 인물 이름을 LLM으로 추출해 채운다.
// - 관리자만 호출 가능.
// - 한 번에 limit개(기본 3, 최대 10)만 처리하고 남은 개수를 돌려준다.
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

    const limit = clampInt(req.query?.limit, 1, 10, 3);

    // characters 가 아직 없는(NULL) 작품만 대상
    const { data: works, error: selErr } = await supabaseAdmin
      .from('works')
      .select('work_id, title, full_script_text')
      .is('characters', null)
      .limit(limit);
    if (selErr) throw selErr;

    const results = [];
    for (const w of works || []) {
      try {
        if (!w.full_script_text || !String(w.full_script_text).trim()) {
          results.push({ work_id: w.work_id, title: w.title, error: 'full_script_text is empty' });
          continue;
        }
        const characters = await runExtractCharacters(w.full_script_text);
        const { error: updErr } = await supabaseAdmin
          .from('works')
          .update({ characters })
          .eq('work_id', w.work_id);
        if (updErr) throw updErr;
        results.push({ work_id: w.work_id, title: w.title, count: characters.length, characters });
      } catch (e) {
        results.push({ work_id: w.work_id, title: w.title, error: e?.message || String(e) });
      }
    }

    // 아직 안 채워진 작품 수
    const { count: remaining, error: cntErr } = await supabaseAdmin
      .from('works')
      .select('work_id', { count: 'exact', head: true })
      .is('characters', null);
    if (cntErr) throw cntErr;

    return res.status(200).json({
      processed: results.length,
      remaining: remaining ?? 0,
      results,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.status || 401).json({ error: err.message });
    }
    console.error('[backfill-characters] error:', err);
    if (err?.status === 529 || err?.status === 429) {
      return res.status(503).json({
        error: 'Anthropic API가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.',
      });
    }
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}

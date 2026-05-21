import { requireAdmin, AuthError } from '../lib/auth.js';
import { supabaseAdmin } from '../lib/supabase-admin.js';

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

const ALLOWED_FORMATS = new Set(['movie', 'drama', 'play', 'musical', 'opera']);

function normalizeWork(work, fullScriptText) {
  if (!work || typeof work !== 'object') throw new Error('work is required');
  if (!work.title) throw new Error('work.title is required');
  if (!ALLOWED_FORMATS.has(work.format)) {
    throw new Error('work.format must be one of movie | drama | play | musical | opera');
  }
  if (!fullScriptText) throw new Error('full_script_text is required');
  return {
    title: String(work.title),
    format: work.format,
    author: work.author ?? null,
    release_year: work.release_year ?? null,
    full_script_text: String(fullScriptText),
  };
}

function clampInt(value, min, max) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

// 카드의 quote / script_excerpt 는 "현재 보고 있는 텍스트"(원문 또는 번역본)로 저장.
// excerpt_description 은 번역하지 않으므로 항상 원본 저장.
function pickDisplayedFields(card) {
  const t = card.translated;
  const useTranslation = card.showingTranslation && t;
  return {
    quote: String(useTranslation ? t.quote_translated : card.quote),
    script_excerpt: String(useTranslation ? t.script_excerpt_translated : card.script_excerpt),
    excerpt_description: card.excerpt_description ?? null,
  };
}

function normalizeCard(card, workId) {
  if (!card || typeof card !== 'object') throw new Error('card must be an object');
  if (!card.quote || !card.script_excerpt) {
    throw new Error('card.quote and card.script_excerpt are required');
  }
  const display = pickDisplayedFields(card);
  return {
    work_id: workId,
    quote: display.quote,
    script_excerpt: display.script_excerpt,
    excerpt_description: display.excerpt_description,
    // keywords 컬럼은 jsonb. Supabase JS가 배열을 그대로 JSON으로 직렬화함.
    keywords: Array.isArray(card.keywords) ? card.keywords.map(String) : [],
    temperature: clampInt(card.temperature, 1, 5),
    intensity: clampInt(card.intensity, 1, 5),
    // 의의(significance) — DB의 cards.significance 컬럼에 저장 (텍스트, NULL 허용)
    significance: card.significance ? String(card.significance) : null,
  };
}

// 장르 이름 배열을 받아 genres 테이블에 upsert(없으면 insert)하고 genre_id 목록 반환.
async function resolveGenreIds(genreNames) {
  if (!genreNames || genreNames.length === 0) return [];

  const uniqueNames = [...new Set(genreNames.map((g) => String(g).trim()).filter(Boolean))];
  if (uniqueNames.length === 0) return [];

  // 1) 기존 genres 조회
  const { data: existing, error: selErr } = await supabaseAdmin
    .from('genres')
    .select('genre_id, name')
    .in('name', uniqueNames);
  if (selErr) throw selErr;

  const existingByName = new Map(existing.map((g) => [g.name, g.genre_id]));
  const missing = uniqueNames.filter((n) => !existingByName.has(n));

  // 2) 누락된 genre insert
  if (missing.length > 0) {
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from('genres')
      .insert(missing.map((name) => ({ name })))
      .select('genre_id, name');
    if (insErr) throw insErr;
    inserted.forEach((g) => existingByName.set(g.name, g.genre_id));
  }

  return uniqueNames.map((n) => existingByName.get(n)).filter(Boolean);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let createdWorkId = null;
  let createdGenreLinks = false;

  try {
    await requireAdmin(req);

    const body = await readJsonBody(req);
    const workInput = normalizeWork(body.work, body.full_script_text);

    if (!Array.isArray(body.cards) || body.cards.length === 0) {
      return res.status(400).json({ error: 'cards array is required and non-empty' });
    }

    // 1) works insert
    const { data: workRow, error: workErr } = await supabaseAdmin
      .from('works')
      .insert(workInput)
      .select('work_id')
      .single();
    if (workErr) throw workErr;
    createdWorkId = workRow.work_id;

    // 2) genres + work_genres (LLM이 work.genres를 줬을 때만)
    const genreIds = await resolveGenreIds(body.work.genres);
    if (genreIds.length > 0) {
      const links = genreIds.map((genre_id) => ({ work_id: createdWorkId, genre_id }));
      const { error: linkErr } = await supabaseAdmin.from('work_genres').insert(links);
      if (linkErr) throw linkErr;
      createdGenreLinks = true;
    }

    // 3) cards bulk insert
    const cardRows = body.cards.map((c) => normalizeCard(c, createdWorkId));
    const { data: inserted, error: cardErr } = await supabaseAdmin
      .from('cards')
      .insert(cardRows)
      .select('card_id');
    if (cardErr) throw cardErr;

    return res.status(200).json({
      work_id: createdWorkId,
      inserted_count: inserted.length,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.status || 401).json({ error: err.message });
    }
    console.error('[save] error:', err);

    // Best-effort rollback (Supabase REST에는 트랜잭션이 없음)
    if (createdWorkId) {
      try {
        if (createdGenreLinks) {
          await supabaseAdmin.from('work_genres').delete().eq('work_id', createdWorkId);
        }
        await supabaseAdmin.from('works').delete().eq('work_id', createdWorkId);
      } catch (cleanupErr) {
        console.error('[save] rollback failed:', cleanupErr);
      }
    }

    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}

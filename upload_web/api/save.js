import { requireUser, AuthError } from '../lib/auth.js';
import { supabaseAdmin } from '../lib/supabase-admin.js';

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

const ALLOWED_FORMATS = new Set(['movie', 'drama', 'play', 'musical']);

function normalizeWork(work) {
  if (!work || typeof work !== 'object') throw new Error('work is required');
  if (!work.title) throw new Error('work.title is required');
  if (!ALLOWED_FORMATS.has(work.format)) throw new Error('work.format must be movie|drama|play|musical');
  return {
    title: String(work.title),
    format: work.format,
    author: work.author ?? null,
    release_year: work.release_year ?? null,
    genres: Array.isArray(work.genres) ? work.genres.map(String) : [],
  };
}

function clampInt(value, min, max) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function normalizeCard(card, workId) {
  if (!card || typeof card !== 'object') throw new Error('card must be an object');
  if (!card.quote || !card.script_excerpt) {
    throw new Error('card.quote and card.script_excerpt are required');
  }
  return {
    work_id: workId,
    quote: String(card.quote),
    script_excerpt: String(card.script_excerpt),
    excerpt_description: card.excerpt_description ?? null,
    keywords: Array.isArray(card.keywords) ? card.keywords.map(String) : [],
    temperature: clampInt(card.temperature, 1, 5),
    intensity: clampInt(card.intensity, 1, 5),
    quote_translated: card.quote_translated ?? null,
    script_excerpt_translated: card.script_excerpt_translated ?? null,
    excerpt_description_translated: card.excerpt_description_translated ?? null,
    source_language: card.source_language ?? null,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    await requireUser(req);

    const body = await readJsonBody(req);
    const workInput = normalizeWork(body.work);
    if (!Array.isArray(body.cards) || body.cards.length === 0) {
      return res.status(400).json({ error: 'cards array is required and non-empty' });
    }

    // Insert work
    const { data: workRow, error: workErr } = await supabaseAdmin
      .from('works')
      .insert(workInput)
      .select()
      .single();
    if (workErr) throw workErr;

    // Insert cards
    const cardRows = body.cards.map((c) => normalizeCard(c, workRow.id));
    const { data: inserted, error: cardErr } = await supabaseAdmin
      .from('cards')
      .insert(cardRows)
      .select('id');
    if (cardErr) {
      // Roll back work if cards failed (best-effort; no real tx in REST API)
      await supabaseAdmin.from('works').delete().eq('id', workRow.id);
      throw cardErr;
    }

    return res.status(200).json({
      work_id: workRow.id,
      inserted_count: inserted.length,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(401).json({ error: err.message });
    }
    console.error('[save] error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}

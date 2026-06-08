// GET /api/gutenberg-list?category=<friendly name>  → 카테고리 작품 목록 (알파벳순)
// GET /api/gutenberg-list?q=<제목 일부>             → 작품명 자동완성 (10건)
//
// 응답: { works: [{ bookId, title, author, year, ... }], topic? }
//
// 데이터 소스 (외부 의존 0):
//   - Supabase public.gutenberg_books 테이블 (RDF dump 로 인덱싱한 ~78k 책)
//   - RPC search_gutenberg_by_topic(p_topic, p_lang, p_limit) — 카테고리
//   - RPC search_gutenberg_by_title(p_query, p_lang, p_limit) — 작품명 자동완성
//
// gutendex.com 의존 완전 제거 — 외부 장애와 무관하게 즉시 응답.

import { requireAdmin, AuthError } from '../lib/auth.js';
import { getSupabaseAdmin } from '../lib/supabase-admin.js';
import { HttpError, sendError } from '../lib/http.js';

export const config = {
  maxDuration: 10,
};

// 우리 UI 카테고리명 → gutendex topic 키워드 (Gutenberg bookshelf 또는 subject 부분 매칭)
const CATEGORY_TOPIC = {
  'adventure': 'adventure',
  'american literature': 'american fiction',
  'british literature': 'english fiction',
  'french literature': 'french fiction',
  'german literature': 'german fiction',
  'russian literature': 'russian fiction',
  'classics of literature': 'fiction',
  'biographies': 'biography',
  'novels': 'fiction',
  'short stories': 'short stories',
  'poetry': 'poetry',
  'plays/films/dramas': 'drama',
  'romance': 'love stories',
  'science-fiction & fantasy': 'science fiction',
  'crime, thrillers & mystery': 'detective',
  'mythology, legends & folklore': 'mythology',
  'humour': 'humor',
  'children & young adult reading': "children's literature",
  'literature - other': 'literature',
  'engineering & technology': 'engineering',
  'mathematics': 'mathematics',
  'science - physics': 'physics',
  'science - chemistry/biochemistry': 'chemistry',
  'science - biology': 'biology',
  'science - earth/agricultural/farming': 'agriculture',
  'research methods/statistics/information sys': 'statistics',
  'environmental issues': 'environment',
  'history - american': 'united states history',
  'history - british': 'great britain history',
  'history - european': 'europe history',
  'history - ancient': 'ancient history',
  'history - medieval/middle ages': 'middle ages',
  'history - early modern (c. 1450-1750)': 'early modern history',
  'history - modern (1750+)': 'modern history',
  'history - religious': 'church history',
  'history - royalty': 'royalty',
  'history - warfare': 'military history',
  'history - schools & universities': 'education history',
  'history - other': 'history',
  'archaeology & anthropology': 'archaeology',
  'business/management': 'business',
  'economics': 'economics',
  'law & criminology': 'law',
  'gender & sexuality studies': 'gender',
  'psychiatry/psychology': 'psychology',
  'sociology': 'sociology',
  'politics': 'politics',
  'parenthood & family relations': 'family',
  'old age & the elderly': 'old age',
  'art': 'art',
  'architecture': 'architecture',
  'music': 'music',
  'fashion': 'fashion',
  'journalism/media/writing': 'journalism',
  'language & communication': 'language',
  'essays, letters & speeches': 'essays',
  'religion/spirituality': 'religion',
  'philosophy & ethics': 'philosophy',
  'cooking & drinking': 'cooking',
  'sports/hobbies': 'sports',
  'how to ...': 'self-help',
  'travel writing': 'travel',
  'nature/gardening/animals': 'nature',
  'sexuality & erotica': 'erotica',
  'health & medicine': 'medicine',
  'drugs/alcohol/pharmacology': 'pharmacy',
  'nutrition': 'nutrition',
  'encyclopedias/dictionaries/reference': 'reference',
  'teaching & education': 'education',
  'reports & conference proceedings': 'conferences',
  'journals': 'periodicals',
};

function keywordForCategory(name) {
  const key = String(name || '').trim().toLowerCase();
  if (CATEGORY_TOPIC[key]) return CATEGORY_TOPIC[key];
  return String(name || '').replace(/&/g, ' ').replace(/[\/,]/g, ' ').replace(/\s+/g, ' ').trim();
}

// gutenberg_books 행 → 클라이언트 응답 형식 (dashboard.js 가 기대하는 모양)
function rowToWork(row) {
  return {
    bookId: row.book_id,
    title: row.title,
    author: row.authors?.[0] || '',
    authors: row.authors || [],
    year: row.author_death || row.author_birth || null,
    downloadCount: row.download_count ?? null,
    plainTextUrl: row.text_url || null,
    // 자동완성 선택 시 카테고리 dropdown 자동 설정용
    suggestedCategory: pickSuggestedCategory(row.bookshelves, row.subjects),
  };
}

// 책의 bookshelves/subjects 에서 우리 UI 카테고리로 역매핑.
// 4단계 매칭 — specific 우선, broad 는 fallback. 매칭 없으면 null.
const TOO_GENERIC_TOPICS = new Set(['fiction', 'literature']);
function pickSuggestedCategory(bookshelves, subjects) {
  const shelves = (bookshelves || []).map((s) => String(s).toLowerCase());
  const subs = (subjects || []).map((s) => String(s).toLowerCase());
  const all = Object.entries(CATEGORY_TOPIC)
    .filter(([, topic]) => topic)
    .sort((a, b) => b[1].length - a[1].length);
  const specific = all.filter(([, topic]) => !TOO_GENERIC_TOPICS.has(String(topic).toLowerCase()));

  const findIn = (entries, haystack) => {
    for (const [catName, topic] of entries) {
      const needle = topic.toLowerCase();
      if (haystack.some((s) => s.includes(needle))) return catName;
    }
    return null;
  };

  // 1) specific 키워드 × bookshelves (공식 라벨, 가장 정확)
  let hit = findIn(specific, shelves);
  if (hit) return hit;
  // 2) specific 키워드 × subjects (LCSH)
  hit = findIn(specific, subs);
  if (hit) return hit;
  // 3) broad 키워드 (fiction/literature) × bookshelves — fallback
  hit = findIn(all, shelves);
  if (hit) return hit;
  // 4) broad × subjects — 마지막 fallback (Don Quixote 같은 일반 소설용)
  hit = findIn(all, subs);
  if (hit) return hit;
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    await requireAdmin(req);
    const cat = String(req.query?.category || '').trim();
    const q = String(req.query?.q || '').trim();

    // ───── 모드 1: 작품명 자동완성 ─────
    if (q) {
      if (q.length < 2) {
        return res.status(200).json({ q, works: [], source: 'gutenberg_books' });
      }
      const sb = getSupabaseAdmin();
      const { data, error } = await sb.rpc('search_gutenberg_by_title', {
        p_query: q,
        p_lang: 'en',
        p_limit: 12,
      });
      if (error) {
        console.error('[gutenberg-list] title rpc error:', error);
        throw new HttpError(`Gutenberg 검색 실패: ${error.message}`, 500);
      }
      const rows = Array.isArray(data) ? data : [];
      const seen = new Set();
      const works = [];
      for (const row of rows) {
        const title = String(row.title || '').trim();
        if (!title) continue;
        const firstAuthor = row.authors?.[0] || '';
        const normTitle = title.toLowerCase()
          .replace(/^(the |a |an )/i, '')
          .replace(/[^\p{L}\p{N}\s]/gu, ' ')
          .replace(/\s+/g, ' ').trim();
        const key = `${normTitle}|${firstAuthor.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        works.push(rowToWork(row));
      }
      // 자동완성 결과 — 짧은 브라우저 캐싱 (다시 타이핑 시 즉시 응답)
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.status(200).json({ q, works, source: 'gutenberg_books' });
    }

    // ───── 모드 2: 카테고리 작품 목록 (알파벳순) ─────
    if (!cat) throw new HttpError('category or q is required', 400);
    const topic = keywordForCategory(cat);
    if (!topic) throw new HttpError(`unknown category: ${cat}`, 400);

    const sb = getSupabaseAdmin();
    const { data, error } = await sb.rpc('search_gutenberg_by_topic', {
      p_topic: topic,
      p_lang: 'en',
      p_limit: 200,
    });
    if (error) {
      console.error('[gutenberg-list] topic rpc error:', error);
      throw new HttpError(`Gutenberg 검색 실패: ${error.message}`, 500);
    }
    const rows = Array.isArray(data) ? data : [];

    // 중복 제거: 정규화된 title + 첫 작가
    const seen = new Set();
    const works = [];
    for (const row of rows) {
      const title = String(row.title || '').trim();
      if (!title) continue;
      const firstAuthor = row.authors?.[0] || '';
      const normTitle = title.toLowerCase()
        .replace(/^(the |a |an )/i, '')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ').trim();
      const key = `${normTitle}|${firstAuthor.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      works.push(rowToWork(row));
    }
    // 알파벳순 정렬 (사용자 요청 — 관사 무시한 정규화 title 기준 로컬 비교)
    works.sort((a, b) => {
      const an = String(a.title || '').toLowerCase().replace(/^(the |a |an )/i, '');
      const bn = String(b.title || '').toLowerCase().replace(/^(the |a |an )/i, '');
      return an.localeCompare(bn, 'en');
    });

    // 카테고리 결과는 거의 안 변함 → CDN/브라우저 24h 캐싱
    res.setHeader(
      'Cache-Control',
      'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800'
    );
    return res.status(200).json({
      category: cat,
      topic,
      works,
      source: 'gutenberg_books',
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.status || 401).json({ error: err.message });
    }
    if (err instanceof HttpError) {
      return sendError(res, err);
    }
    console.error('[gutenberg-list] error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}

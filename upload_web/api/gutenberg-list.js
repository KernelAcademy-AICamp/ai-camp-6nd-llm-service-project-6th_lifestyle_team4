// GET /api/gutenberg-list?category=<friendly name>
// Gutenberg 카테고리 피커가 호출. 응답: { works: [{ bookId, title, author, year, ... }], topic }
//
// 데이터 소스 (외부 의존 0):
//   - Supabase public.gutenberg_books 테이블 (RDF dump 로 인덱싱한 ~78k 책)
//   - RPC search_gutenberg_by_topic(p_topic, p_lang, p_limit)
//     → bookshelves + subjects ILIKE 매칭 + download_count 내림차순
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
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    await requireAdmin(req);
    const cat = String(req.query?.category || '').trim();
    if (!cat) throw new HttpError('category is required', 400);
    const topic = keywordForCategory(cat);
    if (!topic) throw new HttpError(`unknown category: ${cat}`, 400);

    const sb = getSupabaseAdmin();
    const { data, error } = await sb.rpc('search_gutenberg_by_topic', {
      p_topic: topic,
      p_lang: 'en',
      p_limit: 60,
    });
    if (error) {
      console.error('[gutenberg-list] rpc error:', error);
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

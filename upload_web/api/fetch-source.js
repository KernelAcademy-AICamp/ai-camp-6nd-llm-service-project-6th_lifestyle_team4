// 외부 PD 소스에서 작품 본문(또는 후보 목록) 을 가져온다.
//
// POST /api/fetch-source  { kind, op?, title|query }
//   kind = 'wikisource_kr'  (현재 유일)
//   op   = 'search' | 'fetch'   (기본 'search'; 페이지명을 정확히 안다면 'fetch')
//
// 'search' → [{ title, description, url }, ...] (opensearch 결과)
// 'fetch'  → { title, text, length, url, categories }
//
// 추후 'gutenberg' 등 추가 시 같은 패턴으로 분기.

import { requireAdmin, AuthError } from '../lib/auth.js';
import { HttpError, readJsonBody, sendError } from '../lib/http.js';
import { searchWikisourceKr, fetchWikisourceKrPage } from '../lib/sources/wikisource-kr.js';
import { searchGutenberg, fetchGutenbergText } from '../lib/sources/gutenberg.js';
import { getSupabaseAdmin } from '../lib/supabase-admin.js';

const MAX_BODY = 8 * 1024;

export default async function handler(req, res) {
  try {
    await requireAdmin(req);

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'method_not_allowed' });
    }

    const body = await readJsonBody(req, { maxBytes: MAX_BODY });
    const kind = String(body.kind || '');
    const op = String(body.op || 'search');

    if (kind === 'wikisource_kr') {
      if (op === 'search') {
        const query = String(body.query || body.title || '').trim();
        if (!query) throw new HttpError('query (or title) required', 400);
        const results = await searchWikisourceKr(query, body.limit || 8);
        return res.status(200).json({ kind, op, query, results });
      }
      if (op === 'fetch') {
        const title = String(body.title || '').trim();
        if (!title) throw new HttpError('title required', 400);
        const r = await fetchWikisourceKrPage(title);
        return res.status(200).json({
          kind, op,
          title: r.title,
          text: r.text,
          length: r.length,
          url: r.pageUrl,
          categories: r.categories,
        });
      }
      throw new HttpError(`unknown op: ${op} (expected search | fetch)`, 400);
    }

    if (kind === 'gutenberg') {
      if (op === 'search') {
        const query = String(body.query || body.title || '').trim();
        if (!query) throw new HttpError('query (or title) required', 400);
        const { results, effectiveQuery, translatedFrom } = await searchGutenberg(query, body.limit || 8);
        return res.status(200).json({
          kind, op,
          query,                  // 원본 (사용자 입력)
          effectiveQuery,         // 실제 Gutendex 에 보낸 검색어 (한영 변환 후)
          translatedFrom,         // 한영 변환 발생한 경우 원본, 아니면 null
          results,
        });
      }
      if (op === 'fetch') {
        const bookId = body.bookId != null
          ? Number.parseInt(String(body.bookId).replace(/^#/, ''), 10)
          : null;
        const plainTextUrl = body.plainTextUrl ? String(body.plainTextUrl) : null;
        if (!Number.isInteger(bookId) && !plainTextUrl) {
          throw new HttpError('bookId or plainTextUrl required', 400);
        }

        // ─── lazy caching: Supabase gutenberg_book_text 우선 조회 ───
        // 캐시 hit → 즉시 반환 (외부 호출 0)
        // 캐시 miss → gutenberg.org 1회 다운로드 → 캐시 저장 → 반환
        const sb = getSupabaseAdmin();
        if (Number.isInteger(bookId)) {
          try {
            const { data: cached } = await sb
              .from('gutenberg_book_text')
              .select('book_id, raw_text, text_length, source_url')
              .eq('book_id', bookId)
              .maybeSingle();
            if (cached && cached.raw_text) {
              // LRU 갱신 — last_used_at 업데이트 (실패해도 응답 진행)
              sb.from('gutenberg_book_text')
                .update({ last_used_at: new Date().toISOString() })
                .eq('book_id', bookId)
                .then(() => {}, () => {});
              // 메타데이터는 gutenberg_books 에서 함께 채워 응답
              const { data: meta } = await sb
                .from('gutenberg_books')
                .select('title, authors, languages')
                .eq('book_id', bookId)
                .maybeSingle();
              return res.status(200).json({
                kind, op,
                bookId,
                title: meta?.title || null,
                authors: meta?.authors || [],
                languages: meta?.languages || [],
                text: cached.raw_text,
                length: cached.text_length,
                truncated: false,
                url: `https://www.gutenberg.org/ebooks/${bookId}`,
                sourceUrl: cached.source_url || null,
                source: 'supabase_cache',
              });
            }
          } catch (e) {
            console.warn('[fetch-source] gutenberg_book_text read failed:', e?.message || e);
          }
        }

        // 캐시 miss — 외부에서 1회 받아오고 Supabase 에 저장.
        // plainTextUrl 가 없으면 gutenberg_books.text_url 로 채움 (gutendex 호출 우회).
        // 그것도 없으면 표준 URL 패턴 자동 생성.
        let effectiveUrl = plainTextUrl;
        if (!effectiveUrl && Number.isInteger(bookId)) {
          try {
            const { data: bookMeta } = await sb
              .from('gutenberg_books')
              .select('text_url')
              .eq('book_id', bookId)
              .maybeSingle();
            if (bookMeta?.text_url) effectiveUrl = bookMeta.text_url;
          } catch (e) {
            console.warn('[fetch-source] gutenberg_books text_url lookup failed:', e?.message || e);
          }
          // 표준 URL 폴백 — RDF 메타 없는 책도 처리
          if (!effectiveUrl) {
            effectiveUrl = `https://www.gutenberg.org/cache/epub/${bookId}/pg${bookId}.txt`;
          }
        }

        const r = await fetchGutenbergText({ bookId, plainTextUrl: effectiveUrl });

        // 캐시 저장 (실패해도 응답 진행)
        if (Number.isInteger(bookId) && r.text) {
          sb.from('gutenberg_book_text').upsert(
            {
              book_id: bookId,
              raw_text: r.text,
              text_length: r.length,
              source_url: r.sourceUrl || null,
              fetched_at: new Date().toISOString(),
              last_used_at: new Date().toISOString(),
            },
            { onConflict: 'book_id' }
          ).then(() => {}, (e) => console.warn('[fetch-source] cache write failed:', e?.message || e));
        }

        return res.status(200).json({
          kind, op,
          bookId: r.bookId,
          title: r.title,
          authors: r.authors,
          languages: r.languages,
          text: r.text,
          length: r.length,
          truncated: r.truncated,
          url: r.pageUrl,
          sourceUrl: r.sourceUrl,
          source: 'fresh_fetch',
        });
      }
      throw new HttpError(`unknown op: ${op} (expected search | fetch)`, 400);
    }

    throw new HttpError(`unknown kind: ${kind} (supported: wikisource_kr | gutenberg)`, 400);
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.status || 401).json({ error: err.message });
    }
    if (err instanceof HttpError) {
      return sendError(res, err);
    }
    console.error('[fetch-source] error:', err);
    // 외부 소스(Gutendex/Wikisource)가 일시 장애일 때 502 로 표시해 클라이언트 가 친절한 메시지 보이게.
    const status = err?.status === 502 ? 502 : 500;
    return res.status(status).json({ error: err.message || 'internal_error' });
  }
}

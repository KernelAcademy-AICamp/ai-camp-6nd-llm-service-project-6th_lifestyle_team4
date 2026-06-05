#!/usr/bin/env node
// Gutendex 카테고리 응답을 정적 JSON 으로 미리 받아 public/gutendex-cache/<id>.json 으로 저장.
// 한 번 실행하면 그 시점의 catalog 가 영구 캐시됨 → gutendex 외부 장애에도 카테고리 피커 정상 작동.
//
// 사용: node upload_web/scripts/prefetch-gutendex.mjs
//
// 동작:
//   - listGutenbergByCategory 와 동일한 흐름 (CATEGORY_TOPIC 매핑 → topic + languages=en)
//   - 각 카테고리당 60s timeout × 3회 재시도 (백오프 5s/10s)
//   - 받은 카테고리만 JSON 저장. 실패한 건 skip + 로그.
//   - 이미 캐시된 파일이 있고 작품 수가 1개 이상이면 skip (덮어쓰기 안 함).

import { writeFile, mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(ROOT, 'public', 'gutendex-cache');
const GUTENDEX_BASE = 'https://gutendex.com/books/';
const UA = 'CurtaincallPrefetchGB/0.1';

// dashboard.js 의 GB_CATEGORY_TREE 와 동일 — 사용자가 보는 카테고리명
const CATEGORIES = [
  // Literature
  'Adventure', 'American Literature', 'British Literature',
  'French Literature', 'German Literature', 'Russian Literature',
  'Classics of Literature', 'Biographies', 'Novels',
  'Short Stories', 'Poetry', 'Plays/Films/Dramas',
  'Romance', 'Science-Fiction & Fantasy',
  'Crime, Thrillers & Mystery', 'Mythology, Legends & Folklore',
  'Humour', 'Children & Young Adult Reading', 'Literature - Other',
  // Science & Technology
  'Engineering & Technology', 'Mathematics', 'Science - Physics',
  'Science - Chemistry/Biochemistry', 'Science - Biology',
  'Science - Earth/Agricultural/Farming',
  'Research Methods/Statistics/Information Sys', 'Environmental Issues',
  // History
  'History - American', 'History - British', 'History - European',
  'History - Ancient', 'History - Medieval/Middle Ages',
  'History - Early Modern (c. 1450-1750)', 'History - Modern (1750+)',
  'History - Religious', 'History - Royalty', 'History - Warfare',
  'History - Schools & Universities', 'History - Other',
  'Archaeology & Anthropology',
  // Social Sciences & Society
  'Business/Management', 'Economics', 'Law & Criminology',
  'Gender & Sexuality Studies', 'Psychiatry/Psychology', 'Sociology',
  'Politics', 'Parenthood & Family Relations', 'Old Age & the Elderly',
  // Arts & Culture
  'Art', 'Architecture', 'Music', 'Fashion',
  'Journalism/Media/Writing', 'Language & Communication',
  'Essays, Letters & Speeches',
  // Religion & Philosophy
  'Religion/Spirituality', 'Philosophy & Ethics',
  // Lifestyle & Hobbies
  'Cooking & Drinking', 'Sports/Hobbies', 'How to ...',
  'Travel Writing', 'Nature/Gardening/Animals', 'Sexuality & Erotica',
  // Health & Medicine
  'Health & Medicine', 'Drugs/Alcohol/Pharmacology', 'Nutrition',
  // Education & Reference
  'Encyclopedias/Dictionaries/Reference', 'Teaching & Education',
  'Reports & Conference Proceedings', 'Journals',
];

const CATEGORY_TOPIC = {
  'adventure': 'adventure', 'american literature': 'american fiction',
  'british literature': 'english fiction', 'french literature': 'french fiction',
  'german literature': 'german fiction', 'russian literature': 'russian fiction',
  'classics of literature': 'fiction', 'biographies': 'biography',
  'novels': 'fiction', 'short stories': 'short stories', 'poetry': 'poetry',
  'plays/films/dramas': 'drama', 'romance': 'love stories',
  'science-fiction & fantasy': 'science fiction',
  'crime, thrillers & mystery': 'detective',
  'mythology, legends & folklore': 'mythology', 'humour': 'humor',
  'children & young adult reading': "children's literature",
  'literature - other': 'literature',
  'engineering & technology': 'engineering', 'mathematics': 'mathematics',
  'science - physics': 'physics', 'science - chemistry/biochemistry': 'chemistry',
  'science - biology': 'biology', 'science - earth/agricultural/farming': 'agriculture',
  'research methods/statistics/information sys': 'statistics',
  'environmental issues': 'environment',
  'history - american': 'united states history', 'history - british': 'great britain history',
  'history - european': 'europe history', 'history - ancient': 'ancient history',
  'history - medieval/middle ages': 'middle ages',
  'history - early modern (c. 1450-1750)': 'early modern history',
  'history - modern (1750+)': 'modern history', 'history - religious': 'church history',
  'history - royalty': 'royalty', 'history - warfare': 'military history',
  'history - schools & universities': 'education history',
  'history - other': 'history', 'archaeology & anthropology': 'archaeology',
  'business/management': 'business', 'economics': 'economics',
  'law & criminology': 'law', 'gender & sexuality studies': 'gender',
  'psychiatry/psychology': 'psychology', 'sociology': 'sociology',
  'politics': 'politics', 'parenthood & family relations': 'family',
  'old age & the elderly': 'old age',
  'art': 'art', 'architecture': 'architecture', 'music': 'music',
  'fashion': 'fashion', 'journalism/media/writing': 'journalism',
  'language & communication': 'language', 'essays, letters & speeches': 'essays',
  'religion/spirituality': 'religion', 'philosophy & ethics': 'philosophy',
  'cooking & drinking': 'cooking', 'sports/hobbies': 'sports',
  'how to ...': 'self-help', 'travel writing': 'travel',
  'nature/gardening/animals': 'nature', 'sexuality & erotica': 'erotica',
  'health & medicine': 'medicine', 'drugs/alcohol/pharmacology': 'pharmacy',
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

function categoryToFilename(cat) {
  // 안전한 파일명 — 공백 → -, 슬래시/콤마/특문 제거
  return String(cat).toLowerCase()
    .replace(/[\/,]/g, '-')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') + '.json';
}

function pickPlainTextUrl(formats) {
  const keys = Object.keys(formats || {});
  const utf8 = keys.find((k) => /^text\/plain;\s*charset=utf-?8$/i.test(k));
  if (utf8) return formats[utf8];
  const ascii = keys.find((k) => /^text\/plain;\s*charset=us-ascii$/i.test(k));
  if (ascii) return formats[ascii];
  const plain = keys.find((k) => /^text\/plain(?:$|;)/i.test(k));
  if (plain) return formats[plain];
  return null;
}

async function fetchWithRetry(url, { timeoutMs = 60_000, maxAttempts = 3, backoffMs = 5_000 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) {
        if (res.status >= 500 && attempt < maxAttempts) {
          lastErr = new Error(`HTTP ${res.status}`);
          process.stdout.write(`    ↻ attempt ${attempt} HTTP ${res.status}, retrying in ${backoffMs * attempt / 1000}s\n`);
          await new Promise((r) => setTimeout(r, backoffMs * attempt));
          continue;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      return res;
    } catch (err) {
      clearTimeout(t);
      lastErr = err;
      const msg = err?.message || String(err);
      process.stdout.write(`    ⚠ attempt ${attempt} failed: ${msg}\n`);
      if (attempt === maxAttempts) break;
      await new Promise((r) => setTimeout(r, backoffMs * attempt));
    }
  }
  throw lastErr || new Error('fetchWithRetry failed');
}

async function fetchCategory(cat, limit = 60) {
  const topic = keywordForCategory(cat);
  const url = `${GUTENDEX_BASE}?topic=${encodeURIComponent(topic)}&languages=en`;
  const res = await fetchWithRetry(url);
  const j = await res.json();
  const items = Array.isArray(j?.results) ? j.results : [];
  const seen = new Set();
  const works = [];
  for (const b of items) {
    if (works.length >= limit) break;
    const title = String(b.title || '').trim();
    if (!title) continue;
    const authors = Array.isArray(b.authors) ? b.authors.map((a) => a?.name).filter(Boolean) : [];
    const firstAuthor = authors[0] || '';
    const normTitle = title.toLowerCase()
      .replace(/^(the |a |an )/i, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ').trim();
    const key = `${normTitle}|${firstAuthor.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const year = (b.authors?.[0]?.death_year || b.authors?.[0]?.birth_year) || null;
    works.push({
      bookId: b.id,
      title,
      author: firstAuthor,
      authors,
      year,
      downloadCount: b.download_count ?? null,
      plainTextUrl: pickPlainTextUrl(b.formats || {}),
    });
  }
  works.sort((a, b) => (b.downloadCount || 0) - (a.downloadCount || 0));
  return { topic, works };
}

async function fileExistsWithWorks(path) {
  try {
    await stat(path);
    const buf = await readFile(path, 'utf8');
    const j = JSON.parse(buf);
    return Array.isArray(j?.works) && j.works.length > 0;
  } catch { return false; }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`\nPrefetch → ${OUT_DIR}\n`);
  let ok = 0, skipped = 0, failed = 0;
  const failedCats = [];
  for (const cat of CATEGORIES) {
    const fname = categoryToFilename(cat);
    const out = resolve(OUT_DIR, fname);
    if (await fileExistsWithWorks(out)) {
      console.log(`✓ ${cat.padEnd(50)} (cached)`);
      skipped++;
      continue;
    }
    console.log(`… ${cat}`);
    try {
      const { topic, works } = await fetchCategory(cat);
      await writeFile(out, JSON.stringify({ category: cat, topic, works, fetched_at: '__build__' }, null, 2));
      console.log(`✓ ${cat.padEnd(50)} ${works.length} works → ${fname}`);
      ok++;
    } catch (e) {
      console.log(`✗ ${cat.padEnd(50)} ${e?.message || e}`);
      failed++;
      failedCats.push(cat);
    }
  }
  console.log(`\nDone — ok=${ok} cached=${skipped} failed=${failed}/${CATEGORIES.length}`);
  if (failedCats.length) {
    console.log(`Failed:`);
    failedCats.forEach((c) => console.log(`  - ${c}`));
    console.log(`\n다시 실행하면 실패한 카테고리만 재시도합니다 (캐시된 건 skip).`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

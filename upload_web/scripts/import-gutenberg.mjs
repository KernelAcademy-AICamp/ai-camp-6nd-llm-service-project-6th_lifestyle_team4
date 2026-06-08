#!/usr/bin/env node
// Project Gutenberg RDF catalog → Supabase gutenberg_books 테이블
//
// 흐름:
//  1) 사용자가 RDF dump 미리 다운로드해서 풀어둠 (개별 RDF 파일들)
//  2) 이 스크립트가 모든 *.rdf 읽어 파싱 → Supabase 에 batch upsert
//
// 사용법:
//   1. https://www.gutenberg.org/cache/epub/feeds/rdf-files.tar.bz2 다운로드
//   2. 압축 풀기 → cache/epub/<id>/pg<id>.rdf 구조 (수만 개)
//   3. 환경변수:
//        SUPABASE_URL=https://...supabase.co
//        SUPABASE_SERVICE_ROLE_KEY=eyJ...
//        RDF_ROOT=./cache/epub
//   4. cd upload_web && npm install fast-xml-parser
//   5. node upload_web/scripts/import-gutenberg.mjs

import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { XMLParser } from 'fast-xml-parser';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RDF_ROOT = process.env.RDF_ROOT || './cache/epub';
const BATCH_SIZE = 500;
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : 0; // 0 = no limit (테스트용)

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('환경변수 필요: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => [
    'pgterms:agent', 'dcterms:creator', 'dcterms:subject',
    'dcterms:language', 'dcterms:bookshelf', 'pgterms:file',
    'dcam:memberOf', 'rdf:value',
  ].includes(name),
});

function toArray(x) {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

function pickValue(node) {
  if (node == null) return null;
  if (typeof node === 'string') return node;
  if (typeof node === 'object') {
    if (typeof node['#text'] === 'string') return node['#text'];
    if (typeof node['rdf:value'] === 'string') return node['rdf:value'];
    if (Array.isArray(node['rdf:value']) && node['rdf:value'][0]) {
      const v = node['rdf:value'][0];
      return typeof v === 'string' ? v : (v?.['#text'] || null);
    }
  }
  return null;
}

function parseRdfDoc(xml) {
  let doc;
  try { doc = parser.parse(xml); }
  catch { return null; }
  const root = doc?.['rdf:RDF'];
  if (!root) return null;
  const ebook = root['pgterms:ebook'];
  if (!ebook) return null;

  // book id from rdf:about="ebooks/1234"
  const about = ebook['@_rdf:about'] || '';
  const bookId = parseInt(String(about).replace(/^ebooks\//, ''), 10);
  if (!Number.isInteger(bookId) || bookId <= 0) return null;

  // title (may have line breaks; collapse)
  const titleRaw = pickValue(ebook['dcterms:title']) || '';
  const title = String(titleRaw).replace(/\s+/g, ' ').trim();
  if (!title) return null;

  // subtitle — Gutenberg 는 보통 title 에 합쳐서 줌. dcterms:alternative 가 있으면 부제로.
  const subtitleRaw = pickValue(ebook['dcterms:alternative']) || null;
  const subtitle = subtitleRaw ? String(subtitleRaw).replace(/\s+/g, ' ').trim() : null;

  // authors — dcterms:creator 안에 pgterms:agent 들. 첫 작가의 birth/death 만 보관.
  const creators = toArray(ebook['dcterms:creator']);
  const authors = [];
  let authorBirth = null, authorDeath = null;
  for (const c of creators) {
    const agents = toArray(c['pgterms:agent']);
    for (const a of agents) {
      const name = pickValue(a['pgterms:name']);
      if (name) authors.push(String(name).trim());
      if (authorBirth == null) {
        const by = pickValue(a['pgterms:birthdate']);
        if (by && /^-?\d+$/.test(by)) authorBirth = parseInt(by, 10);
      }
      if (authorDeath == null) {
        const dy = pickValue(a['pgterms:deathdate']);
        if (dy && /^-?\d+$/.test(dy)) authorDeath = parseInt(dy, 10);
      }
    }
  }

  // languages — dcterms:language 안에 rdf:Description 안에 rdf:value
  const langNodes = toArray(ebook['dcterms:language']);
  const languages = [];
  for (const l of langNodes) {
    const desc = l['rdf:Description'];
    const v = pickValue(desc) || pickValue(l);
    if (v) languages.push(String(v).toLowerCase().trim());
  }

  // subjects (LCSH/LCC) — dcterms:subject 안에 rdf:Description 안에 rdf:value
  const subjNodes = toArray(ebook['dcterms:subject']);
  const subjects = [];
  for (const s of subjNodes) {
    const desc = s['rdf:Description'];
    const v = pickValue(desc) || pickValue(s);
    if (v) subjects.push(String(v).trim());
  }

  // bookshelves — pgterms:bookshelf 안에 rdf:Description 안에 rdf:value
  const shelfNodes = toArray(ebook['pgterms:bookshelf']);
  const bookshelves = [];
  for (const s of shelfNodes) {
    const desc = s['rdf:Description'];
    const v = pickValue(desc) || pickValue(s);
    if (v) bookshelves.push(String(v).trim());
  }

  // text/plain UTF-8 URL — root level 의 pgterms:file 들. dcterms:format 안에 mime.
  // root('rdf:RDF') 의 자식으로 pgterms:file 이 다수 있음.
  let textUrl = null;
  const files = toArray(root['pgterms:file']);
  for (const f of files) {
    const fileAbout = f['@_rdf:about'];
    if (!fileAbout) continue;
    // format 안에 dcam:memberOf rdf:resource 또는 rdf:value
    const formatArr = toArray(f['dcterms:format']);
    for (const fmt of formatArr) {
      const desc = fmt['rdf:Description'];
      const v = pickValue(desc) || pickValue(fmt);
      if (v && /^text\/plain;?\s*(charset=utf-?8)?\s*$/i.test(String(v))) {
        textUrl = String(fileAbout);
        break;
      }
    }
    if (textUrl) break;
  }
  // 폴백 — text/plain charset=utf-8 못 찾으면 그냥 text/plain
  if (!textUrl) {
    for (const f of files) {
      const fileAbout = f['@_rdf:about'];
      if (!fileAbout) continue;
      const formatArr = toArray(f['dcterms:format']);
      for (const fmt of formatArr) {
        const desc = fmt['rdf:Description'];
        const v = pickValue(desc) || pickValue(fmt);
        if (v && /text\/plain/i.test(String(v))) {
          textUrl = String(fileAbout);
          break;
        }
      }
      if (textUrl) break;
    }
  }

  // download count — pgterms:downloads (있으면 정수)
  const dlRaw = pickValue(ebook['pgterms:downloads']);
  const downloadCount = (dlRaw && /^\d+$/.test(dlRaw)) ? parseInt(dlRaw, 10) : 0;

  return {
    book_id: bookId,
    title,
    subtitle,
    authors,
    author_birth: authorBirth,
    author_death: authorDeath,
    languages,
    subjects,
    bookshelves,
    text_url: textUrl,
    download_count: downloadCount,
  };
}

async function* walkRdfFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      try { yield* walkRdfFiles(path); }
      catch (e) { console.warn(`skip dir ${path}: ${e.message}`); }
    } else if (entry.isFile() && entry.name.endsWith('.rdf')) {
      yield path;
    }
  }
}

async function flushBatch(batch) {
  if (batch.length === 0) return;
  const { error } = await sb.from('gutenberg_books').upsert(
    batch.map((b) => ({ ...b, updated_at: new Date().toISOString() })),
    { onConflict: 'book_id' }
  );
  if (error) throw error;
}

async function main() {
  const rootAbs = resolve(RDF_ROOT);
  try { await stat(rootAbs); }
  catch {
    console.error(`RDF_ROOT not found: ${rootAbs}`);
    console.error('https://www.gutenberg.org/cache/epub/feeds/rdf-files.tar.bz2 다운받고 풀어주세요.');
    process.exit(1);
  }
  console.log(`Reading RDF from ${rootAbs}`);
  if (LIMIT) console.log(`LIMIT=${LIMIT} (테스트 모드 — 처음 ${LIMIT}개만)`);

  const batch = [];
  let parsed = 0, inserted = 0, failed = 0;
  const startTs = Date.now();

  for await (const file of walkRdfFiles(rootAbs)) {
    if (LIMIT && parsed >= LIMIT) break;
    try {
      const xml = await readFile(file, 'utf8');
      const row = parseRdfDoc(xml);
      if (!row) { failed++; continue; }
      batch.push(row);
      parsed++;
      if (batch.length >= BATCH_SIZE) {
        await flushBatch(batch);
        inserted += batch.length;
        batch.length = 0;
        const elapsed = ((Date.now() - startTs) / 1000).toFixed(0);
        process.stdout.write(`\r  parsed=${parsed} inserted=${inserted} failed=${failed} elapsed=${elapsed}s`);
      }
    } catch (e) {
      failed++;
      if (failed < 5) console.error(`\nparse fail ${file}: ${e.message}`);
    }
  }
  if (batch.length > 0) {
    await flushBatch(batch);
    inserted += batch.length;
  }

  const totalSec = ((Date.now() - startTs) / 1000).toFixed(1);
  console.log(`\n\nDone — parsed=${parsed} inserted=${inserted} failed=${failed} in ${totalSec}s`);
}

main().catch((e) => { console.error(e); process.exit(1); });

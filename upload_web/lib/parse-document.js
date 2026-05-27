// 업로드된 대본 파일에서 평문 텍스트를 추출한다.
// 지원 형식: PDF, TXT, DOCX, HWPX, HWP(한컴 한/글)
//
// PDF  : pdf-parse (텍스트 PDF만, 스캔본은 OCR 선행 필요)
// TXT  : BOM/인코딩 감지 (UTF-8 / UTF-16 / CP949(EUC-KR))
// DOCX : mammoth(extractRawText)
// HWPX : ZIP(OWPML) 안의 Contents/section*.xml 에서 <hp:t> 텍스트 추출
// HWP  : OLE 복합문서(cfb) → BodyText/Section* (raw deflate, pako) → 레코드 파싱
//
// pdf-parse의 index.js는 import 시 디버그용 테스트 PDF를 읽으려 하므로
// 서버리스에서는 내부 모듈을 직접 import 한다.
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';
import JSZip from 'jszip';
import CFB from 'cfb';
import pako from 'pako';
import iconv from 'iconv-lite';

// 확장자(소문자) 추출
function extOf(filename) {
  const m = String(filename || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

// 파일명/MIME으로 형식 판별. 확장자를 우선하고 MIME으로 보조 판별.
export function detectKind(filename, mimetype = '') {
  const ext = extOf(filename);
  const mt = String(mimetype || '').toLowerCase();
  if (ext === 'pdf' || mt.includes('pdf')) return 'pdf';
  if (ext === 'docx' || mt.includes('wordprocessingml')) return 'docx';
  if (ext === 'hwpx') return 'hwpx';
  if (ext === 'hwp' || mt.includes('hwp')) return 'hwp';
  if (ext === 'txt' || ext === 'text' || mt.startsWith('text/')) return 'txt';
  return null;
}

export const SUPPORTED_EXTENSIONS = ['pdf', 'txt', 'docx', 'hwp', 'hwpx'];

// buffer(파일 내용)에서 텍스트를 추출한다. 실패/미지원 시 throw.
export async function extractText(buffer, filename, mimetype) {
  const kind = detectKind(filename, mimetype);
  switch (kind) {
    case 'pdf': {
      const parsed = await pdfParse(buffer);
      return parsed.text || '';
    }
    case 'txt':
      return decodeTextFile(buffer);
    case 'docx': {
      const { value } = await mammoth.extractRawText({ buffer });
      return value || '';
    }
    case 'hwpx':
      return await extractHwpx(buffer);
    case 'hwp':
      return extractHwp(buffer);
    default:
      throw new Error(
        '지원하지 않는 파일 형식입니다. PDF, TXT, DOCX, HWP, HWPX 파일만 업로드할 수 있습니다.'
      );
  }
}

// ---------------------------------------------------------------------------
// TXT — 인코딩 감지
// ---------------------------------------------------------------------------
function decodeTextFile(buf) {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.toString('utf8', 3); // UTF-8 BOM
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.toString('utf16le', 2); // UTF-16 LE BOM
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf); // UTF-16 BE BOM → swap
    swapped.swap16();
    return swapped.toString('utf16le', 2);
  }
  // BOM 없음: UTF-8 시도, 깨지면(치환문자 U+FFFD) CP949(EUC-KR)로 폴백.
  const utf8 = buf.toString('utf8');
  if (!utf8.includes('�')) return utf8;
  return iconv.decode(buf, 'cp949');
}

// ---------------------------------------------------------------------------
// HWPX — ZIP/OWPML
// ---------------------------------------------------------------------------
const XML_ENTITIES = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'" };

function decodeXmlEntities(s) {
  return s
    .replace(/&lt;|&gt;|&amp;|&quot;|&apos;/g, (m) => XML_ENTITIES[m])
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

async function extractHwpx(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const sectionNames = Object.keys(zip.files)
    .filter((n) => /(^|\/)section\d+\.xml$/i.test(n) && /contents/i.test(n))
    .sort();
  // section 파일을 못 찾으면 Contents 하위의 모든 .xml 을 시도
  const names = sectionNames.length
    ? sectionNames
    : Object.keys(zip.files).filter((n) => /contents\/.*\.xml$/i.test(n)).sort();

  const chunks = [];
  for (const name of names) {
    const xml = await zip.files[name].async('string');
    chunks.push(hwpxXmlToText(xml));
  }
  return chunks.join('\n');
}

// OWPML 문단(<hp:p>)별로 텍스트 런(<hp:t>)을 모아 줄바꿈으로 잇는다.
function hwpxXmlToText(xml) {
  const paragraphs = xml.split(/<\/hp:p>/i);
  const lines = [];
  const runRe = /<hp:t\b[^>]*>([\s\S]*?)<\/hp:t>/gi;
  for (const para of paragraphs) {
    let buf = '';
    let m;
    while ((m = runRe.exec(para)) !== null) buf += decodeXmlEntities(m[1]);
    if (buf.trim()) lines.push(buf);
  }
  if (lines.length) return lines.join('\n');
  // <hp:t> 를 못 찾은 경우(네임스페이스 차이 등): 태그를 모두 제거하고 폴백.
  const stripped = decodeXmlEntities(xml.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  return stripped;
}

// ---------------------------------------------------------------------------
// HWP 5.0 — OLE 복합문서
// ---------------------------------------------------------------------------
const HWPTAG_PARA_TEXT = 0x43; // HWPTAG_BEGIN(0x10) + 51

// PARA_TEXT 안의 제어문자 폭(WChar 단위). inline/extended 컨트롤은 8 WChar(16바이트).
const HWP_INLINE_CONTROLS = new Set([4, 5, 6, 7, 8, 9, 19, 20]);
const HWP_EXTENDED_CONTROLS = new Set([1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23]);

function extractHwp(buffer) {
  let cfb;
  try {
    cfb = CFB.read(buffer, { type: 'buffer' });
  } catch {
    throw new Error('유효한 HWP 파일이 아닙니다. (한/글 5.0 형식만 지원합니다)');
  }

  let headerEntry = null;
  const sections = [];
  cfb.FileIndex.forEach((fi, i) => {
    const path = cfb.FullPaths[i] || '';
    if (/FileHeader$/i.test(path)) headerEntry = fi;
    const sm = path.match(/BodyText\/Section(\d+)$/i);
    if (sm) sections.push({ idx: Number(sm[1]), fi });
  });

  if (!headerEntry || !sections.length) {
    throw new Error('HWP 본문을 찾을 수 없습니다. (한/글 5.0 형식만 지원합니다)');
  }

  // FileHeader: offset 36 의 속성 플래그 bit0 = 압축 여부
  const props = headerEntry.content[36] || 0;
  const compressed = (props & 0x01) === 0x01;

  sections.sort((a, b) => a.idx - b.idx);
  const parts = [];
  for (const { fi } of sections) {
    let data = Buffer.from(fi.content);
    if (compressed) {
      try {
        data = Buffer.from(pako.inflateRaw(data));
      } catch {
        continue; // 한 섹션이 깨져도 나머지는 시도
      }
    }
    parts.push(parseHwpSection(data));
  }
  return parts.join('\n');
}

// 섹션 스트림 = 레코드(헤더 4바이트 + 데이터) 의 연속.
// 헤더: tagID(10bit) | level(10bit) | size(12bit). size==0xFFF 면 다음 4바이트가 실제 크기.
function parseHwpSection(buf) {
  const out = [];
  let pos = 0;
  while (pos + 4 <= buf.length) {
    const header = buf.readUInt32LE(pos);
    pos += 4;
    const tagID = header & 0x3ff;
    let size = (header >> 20) & 0xfff;
    if (size === 0xfff) {
      if (pos + 4 > buf.length) break;
      size = buf.readUInt32LE(pos);
      pos += 4;
    }
    if (pos + size > buf.length) break;
    if (tagID === HWPTAG_PARA_TEXT) {
      out.push(decodeHwpParaText(buf, pos, size));
    }
    pos += size;
  }
  return out.join('\n');
}

// PARA_TEXT 레코드(UTF-16LE + 제어문자) → 평문
function decodeHwpParaText(buf, start, size) {
  let s = '';
  const end = start + size;
  let i = start;
  while (i + 2 <= end) {
    const c = buf.readUInt16LE(i);
    if (c >= 32) {
      s += String.fromCharCode(c);
      i += 2;
    } else if (c === 9) {
      s += '\t'; // 탭(inline 컨트롤, 8 WChar)
      i += 16;
    } else if (c === 10 || c === 13) {
      s += '\n';
      i += 2;
    } else if (HWP_INLINE_CONTROLS.has(c) || HWP_EXTENDED_CONTROLS.has(c)) {
      i += 16; // inline/extended 컨트롤 = 8 WChar
    } else {
      i += 2; // 그 외 char 컨트롤 = 1 WChar
    }
  }
  return s;
}

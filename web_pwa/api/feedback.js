// 사용자 피드백을 구글 시트(Apps Script 웹앱)로 중계하는 서버리스 프록시.
// 클라이언트는 같은 오리진 /api/feedback 로 JSON POST → 여기서 form-urlencoded 로
// 변환해 FEEDBACK_ENDPOINT 로 전달한다. (엔드포인트는 서버측에만 존재, 브라우저 미노출)
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  // 미설정 시에도 동작하도록 폴백 둠 (config.js 의 공개 키 폴백과 동일 관례).
  // 운영에서는 Vercel · .env.local 의 FEEDBACK_ENDPOINT 로 덮어쓰기 권장.
  const ENDPOINT =
    process.env.FEEDBACK_ENDPOINT ||
    'https://script.google.com/macros/s/AKfycbxhzZUOrfnN-kfLoj2zXvPinBR_po7zclUmEcXjRa66f0la8C0GGYRzNrRfn7eKUxn6rw/exec';

  try {
    // Vercel Node 런타임은 application/json 본문을 자동 파싱하지만, 문자열로 올 때도 방어.
    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }

    // 구글 시트 컬럼과 1:1 매핑되는 키 (시간은 Apps Script 가 서버측에서 부여).
    const params = new URLSearchParams();
    for (const k of ['gender', 'age', 'rating', 'liked', 'improve', 'message', 'email', 'page']) {
      params.set(k, body[k] == null ? '' : String(body[k]));
    }

    // Apps Script 는 POST 시 302 → script.googleusercontent.com 으로 리다이렉트 후 200.
    // Node fetch 는 리다이렉트를 자동 추적하므로 최종 응답으로 성공/실패 판단.
    const upstream = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: params.toString(),
    });
    if (!upstream.ok) throw new Error('upstream ' + upstream.status);

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[api/feedback] forward failed:', e?.message || e);
    res.status(502).json({ ok: false, error: String(e?.message || e) });
  }
}

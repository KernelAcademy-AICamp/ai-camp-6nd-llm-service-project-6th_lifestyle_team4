// Serverless proxy that forwards browser feedback to the configured Apps Script endpoint.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  const contentLength = Number(req.headers['content-length'] || 0);
  if (contentLength > 64 * 1024) {
    res.status(413).json({ ok: false, error: 'payload_too_large' });
    return;
  }

  const endpoint =
    process.env.FEEDBACK_ENDPOINT ||
    'https://script.google.com/macros/s/AKfycbxhzZUOrfnN-kfLoj2zXvPinBR_po7zclUmEcXjRa66f0la8C0GGYRzNrRfn7eKUxn6rw/exec';

  try {
    const endpointUrl = new URL(endpoint);
    if (!['http:', 'https:'].includes(endpointUrl.protocol)) {
      throw new Error('invalid_feedback_endpoint');
    }

    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      body = {};
    }

    const maxLen = {
      gender: 40,
      age: 40,
      rating: 10,
      liked: 2000,
      improve: 2000,
      message: 4000,
      email: 320,
      page: 300,
    };
    const sanitize = (key) => String(body[key] == null ? '' : body[key]).slice(0, maxLen[key] || 1000);

    const params = new URLSearchParams();
    for (const key of ['gender', 'age', 'rating', 'liked', 'improve', 'message', 'email', 'page']) {
      params.set(key, sanitize(key));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let upstream;
    try {
      upstream = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: params.toString(),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!upstream.ok) throw new Error('upstream ' + upstream.status);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[api/feedback] forward failed:', err?.message || err);
    res.status(502).json({ ok: false, error: 'feedback_forward_failed' });
  }
}

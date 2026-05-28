// Exposes only the public (anon) Supabase config to the browser.
// The service_role key never leaves the server.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    // 공개 클라이언트 분석 키 — 미설정 시 analytics.js가 조용히 no-op 처리.
    // 둘 다 공개 키라 기본값을 두고, 필요 시 env로 덮어쓴다.
    amplitudeApiKey: process.env.AMPLITUDE_API_KEY || '016c6218aa17a49377b3ac38e6958070',
    clarityProjectId: process.env.CLARITY_PROJECT_ID || 'wxyaqwn09q',
  });
}

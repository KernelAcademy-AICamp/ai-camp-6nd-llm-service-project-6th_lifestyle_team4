import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class SupabaseConfig {
  const SupabaseConfig._();

  static Future<void> init() async {
    final url = dotenv.env['SUPABASE_URL'];
    final anonKey = dotenv.env['SUPABASE_ANON_KEY'];

    if (url == null || anonKey == null || url.isEmpty || anonKey.isEmpty) {
      throw StateError(
        'SUPABASE_URL / SUPABASE_ANON_KEY 가 .env 에 설정되어 있지 않습니다.',
      );
    }

    await Supabase.initialize(
      url: url,
      anonKey: anonKey,
      debug: false,
    );
  }

  static SupabaseClient get client => Supabase.instance.client;

  static Future<void> ensureSignedIn() async {
    final auth = client.auth;
    if (auth.currentUser != null) return;
    await auth.signInAnonymously();
  }
}

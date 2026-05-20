import 'package:supabase_flutter/supabase_flutter.dart';

import '../core/supabase_client.dart';
import '../models/card.dart';

/// 카드 조회 / 클릭 로깅 / 북마크 + 추천 RPC 래퍼.
class CardRepository {
  CardRepository({SupabaseClient? client})
      : _client = client ?? SupabaseConfig.client;

  final SupabaseClient _client;

  static const String _cardSelectFlat = '''
    card_id, content, scene_meta, temperature, intensity, status, created_at,
    works:work_id (
      work_id, title, format, release_year, creator, description,
      work_genres ( is_primary, genres ( genre_id, code, name_ko ) )
    ),
    card_hashtags ( hashtags ( tag ) )
  ''';

  Future<ScriptCard?> fetchCard(int cardId) async {
    final row = await _client
        .from('cards')
        .select(_cardSelectFlat)
        .eq('card_id', cardId)
        .maybeSingle();
    if (row == null) return null;
    final flat = _flattenWorkGenres(Map<String, dynamic>.from(row));
    final bookmarked = await isBookmarked(cardId);
    return ScriptCard.fromJoinedMap(flat, isBookmarked: bookmarked);
  }

  /// 오늘의 카드 한 장 — recommend_cards RPC 첫 번째 결과.
  Future<ScriptCard?> fetchTodayCard() async {
    final user = _client.auth.currentUser;
    if (user == null) return null;

    final rpc = await _client.rpc('recommend_cards', params: {
      'p_user_id': user.id,
      'p_limit': 1,
    }) as List<dynamic>;

    if (rpc.isEmpty) return null;
    final first = Map<String, dynamic>.from(rpc.first);
    final cardId = (first['card_id'] as num).toInt();
    return fetchCard(cardId);
  }

  /// 지난 기록(최근 클릭한 카드들) — Home 하단용.
  Future<List<ScriptCard>> fetchRecentClickedCards({int limit = 4}) async {
    final user = _client.auth.currentUser;
    if (user == null) return const [];

    final clicks = await _client
        .from('card_clicks')
        .select('card_id, clicked_at')
        .eq('user_id', user.id)
        .order('clicked_at', ascending: false)
        .limit(limit) as List<dynamic>;

    if (clicks.isEmpty) return const [];

    final ids = <int>{};
    for (final c in clicks) {
      ids.add(((c as Map)['card_id'] as num).toInt());
    }
    return _fetchCardsByIds(ids.toList());
  }

  /// Archive — 내가 북마크한 카드.
  Future<List<ScriptCard>> fetchBookmarkedCards({
    String? search,
    String? genreCode,
  }) async {
    final user = _client.auth.currentUser;
    if (user == null) return const [];

    final bookmarks = await _client
        .from('user_bookmarks')
        .select('card_id, created_at')
        .eq('user_id', user.id)
        .order('created_at', ascending: false) as List<dynamic>;

    if (bookmarks.isEmpty) return const [];
    final ids = bookmarks
        .map((b) => ((b as Map)['card_id'] as num).toInt())
        .toList();
    final cards = await _fetchCardsByIds(ids, markAllBookmarked: true);

    Iterable<ScriptCard> result = cards;
    if (search != null && search.trim().isNotEmpty) {
      final q = search.toLowerCase();
      result = result.where((c) =>
          c.content.toLowerCase().contains(q) ||
          c.work.title.toLowerCase().contains(q));
    }
    if (genreCode != null && genreCode.isNotEmpty) {
      result = result.where((c) => c.genres.any((g) => g.code == genreCode));
    }
    return result.toList();
  }

  Future<List<ScriptCard>> _fetchCardsByIds(
    List<int> ids, {
    bool markAllBookmarked = false,
  }) async {
    if (ids.isEmpty) return const [];
    final rows = await _client
        .from('cards')
        .select(_cardSelectFlat)
        .inFilter('card_id', ids) as List<dynamic>;

    final byId = <int, ScriptCard>{};
    for (final r in rows) {
      final flat = _flattenWorkGenres(Map<String, dynamic>.from(r as Map));
      final card = ScriptCard.fromJoinedMap(
        flat,
        isBookmarked: markAllBookmarked,
      );
      byId[card.cardId] = card;
    }
    return ids
        .map((id) => byId[id])
        .whereType<ScriptCard>()
        .toList(growable: false);
  }

  /// 카드 상세 진입 시 click 기록 (선호 트리거가 자동으로 집계).
  Future<void> logClick(int cardId) async {
    final user = _client.auth.currentUser;
    if (user == null) return;
    await _client.from('card_clicks').insert({
      'user_id': user.id,
      'card_id': cardId,
    });
  }

  Future<bool> isBookmarked(int cardId) async {
    final user = _client.auth.currentUser;
    if (user == null) return false;
    final row = await _client
        .from('user_bookmarks')
        .select('card_id')
        .eq('user_id', user.id)
        .eq('card_id', cardId)
        .maybeSingle();
    return row != null;
  }

  Future<bool> toggleBookmark(int cardId) async {
    final user = _client.auth.currentUser;
    if (user == null) return false;
    final exists = await isBookmarked(cardId);
    if (exists) {
      await _client
          .from('user_bookmarks')
          .delete()
          .eq('user_id', user.id)
          .eq('card_id', cardId);
      return false;
    } else {
      await _client.from('user_bookmarks').insert({
        'user_id': user.id,
        'card_id': cardId,
      });
      return true;
    }
  }

  /// 검색용 — 모든 장르 목록.
  Future<List<Map<String, dynamic>>> fetchGenres() async {
    final rows = await _client
        .from('genres')
        .select('genre_id, code, name_ko')
        .order('name_ko') as List<dynamic>;
    return rows
        .map((r) => Map<String, dynamic>.from(r as Map))
        .toList(growable: false);
  }

  /// works → work_genres → genres 가 cards.works 안에 중첩되어 오면
  /// card 모델이 기대하는 최상위 work_genres 키로 펼친다.
  Map<String, dynamic> _flattenWorkGenres(Map<String, dynamic> row) {
    final works = row['works'];
    if (works is Map && works['work_genres'] is List) {
      row['work_genres'] = works['work_genres'];
    }
    return row;
  }
}

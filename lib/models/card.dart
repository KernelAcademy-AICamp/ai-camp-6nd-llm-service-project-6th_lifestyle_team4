import 'genre.dart';
import 'work.dart';

/// 카드 = 명대사/명장면 1개. work + genre 리스트가 조인된 형태로 다룬다.
class ScriptCard {
  final int cardId;
  final String content;
  final Map<String, dynamic>? sceneMeta;
  final int temperature; // 1..5
  final int intensity; // 1..5
  final Work work;
  final List<Genre> genres;
  final List<String> hashtags;
  final bool isBookmarked;

  const ScriptCard({
    required this.cardId,
    required this.content,
    required this.temperature,
    required this.intensity,
    required this.work,
    required this.genres,
    this.sceneMeta,
    this.hashtags = const [],
    this.isBookmarked = false,
  });

  String? get sceneHeader {
    if (sceneMeta == null) return null;
    final header = sceneMeta!['header'] ?? sceneMeta!['scene_header'];
    return header is String ? header : null;
  }

  String? get characterName {
    if (sceneMeta == null) return null;
    final c = sceneMeta!['character'] ?? sceneMeta!['speaker'];
    return c is String ? c : null;
  }

  String? get sceneDescription {
    if (sceneMeta == null) return null;
    final d = sceneMeta!['description'] ?? sceneMeta!['narration'];
    return d is String ? d : null;
  }

  String? get imageUrl {
    if (sceneMeta == null) return null;
    final url = sceneMeta!['image_url'] ?? sceneMeta!['cover_image'];
    return url is String ? url : null;
  }

  /// 전체 각본(한 씬 단위) — seed_full_scenes.sql 로 채워짐.
  String? get fullScene {
    if (sceneMeta == null) return null;
    final v = sceneMeta!['full_scene'] ?? sceneMeta!['script'];
    return v is String && v.trim().isNotEmpty ? v : null;
  }

  factory ScriptCard.fromJoinedMap(
    Map<String, dynamic> map, {
    bool isBookmarked = false,
  }) {
    final workMap = map['works'] is Map<String, dynamic>
        ? map['works'] as Map<String, dynamic>
        : <String, dynamic>{
            'work_id': map['work_id'],
            'title': map['work_title'] ?? '',
            'format': map['format'] ?? 'movie',
            'release_year': map['release_year'],
          };

    final genreList = <Genre>[];
    final rawGenres = map['work_genres'];
    if (rawGenres is List) {
      for (final wg in rawGenres) {
        if (wg is Map && wg['genres'] is Map) {
          genreList
              .add(Genre.fromMap(Map<String, dynamic>.from(wg['genres'])));
        }
      }
    }

    final hashtagList = <String>[];
    final rawHashtags = map['card_hashtags'];
    if (rawHashtags is List) {
      for (final ch in rawHashtags) {
        if (ch is Map && ch['hashtags'] is Map) {
          final tag = ch['hashtags']['tag'];
          if (tag is String) hashtagList.add(tag);
        }
      }
    }

    return ScriptCard(
      cardId: (map['card_id'] as num).toInt(),
      content: map['content'] as String,
      sceneMeta: map['scene_meta'] is Map<String, dynamic>
          ? Map<String, dynamic>.from(map['scene_meta'] as Map)
          : null,
      temperature: (map['temperature'] as num).toInt(),
      intensity: (map['intensity'] as num).toInt(),
      work: Work.fromMap(Map<String, dynamic>.from(workMap)),
      genres: genreList,
      hashtags: hashtagList,
      isBookmarked: isBookmarked,
    );
  }

  ScriptCard copyWith({bool? isBookmarked}) => ScriptCard(
        cardId: cardId,
        content: content,
        sceneMeta: sceneMeta,
        temperature: temperature,
        intensity: intensity,
        work: work,
        genres: genres,
        hashtags: hashtags,
        isBookmarked: isBookmarked ?? this.isBookmarked,
      );
}

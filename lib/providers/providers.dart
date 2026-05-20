import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/card_repository.dart';
import '../models/card.dart';

final cardRepositoryProvider = Provider<CardRepository>((ref) {
  return CardRepository();
});

final todayCardProvider = FutureProvider<ScriptCard?>((ref) async {
  final repo = ref.watch(cardRepositoryProvider);
  return repo.fetchTodayCard();
});

final recentClickedProvider = FutureProvider<List<ScriptCard>>((ref) async {
  final repo = ref.watch(cardRepositoryProvider);
  return repo.fetchRecentClickedCards();
});

class ArchiveFilter {
  const ArchiveFilter({this.search = '', this.genreCode});
  final String search;
  final String? genreCode;

  ArchiveFilter copyWith({String? search, Object? genreCode = _sentinel}) {
    return ArchiveFilter(
      search: search ?? this.search,
      genreCode: identical(genreCode, _sentinel)
          ? this.genreCode
          : genreCode as String?,
    );
  }

  static const _sentinel = Object();
}

final archiveFilterProvider =
    StateProvider<ArchiveFilter>((_) => const ArchiveFilter());

final bookmarkedCardsProvider =
    FutureProvider<List<ScriptCard>>((ref) async {
  final repo = ref.watch(cardRepositoryProvider);
  final filter = ref.watch(archiveFilterProvider);
  return repo.fetchBookmarkedCards(
    search: filter.search,
    genreCode: filter.genreCode,
  );
});

final genresProvider =
    FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final repo = ref.watch(cardRepositoryProvider);
  return repo.fetchGenres();
});

final cardDetailProvider =
    FutureProvider.family<ScriptCard?, int>((ref, cardId) async {
  final repo = ref.watch(cardRepositoryProvider);
  final card = await repo.fetchCard(cardId);
  return card;
});

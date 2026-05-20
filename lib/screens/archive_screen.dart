import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../models/card.dart';
import '../providers/providers.dart';
import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import '../widgets/app_top_bar.dart';
import '../widgets/glass_card.dart';

class ArchiveScreen extends ConsumerWidget {
  const ArchiveScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bookmarks = ref.watch(bookmarkedCardsProvider);
    final genresAsync = ref.watch(genresProvider);
    final filter = ref.watch(archiveFilterProvider);

    return AtmosphericBackground(
      child: SafeArea(
        bottom: false,
        child: Column(
          children: [
            const AppTopBar(),
            Expanded(
              child: RefreshIndicator(
                color: AppColors.secondary,
                backgroundColor: AppColors.surfaceContainerHigh,
                onRefresh: () async {
                  ref.invalidate(bookmarkedCardsProvider);
                },
                child: CustomScrollView(
                  slivers: [
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(
                        AppSpacing.safeMargin,
                        AppSpacing.md,
                        AppSpacing.safeMargin,
                        AppSpacing.md,
                      ),
                      sliver: SliverList(
                        delegate: SliverChildListDelegate.fixed([
                          Text(
                            'Collected Works',
                            style: AppTypography.displayLgMobile
                                .copyWith(color: AppColors.primary),
                          ),
                          const SizedBox(height: AppSpacing.xs),
                          Text(
                            'Your personal anthology of cinematic moments\nand quiet reflections.',
                            style: AppTypography.bodyMd
                                .copyWith(color: AppColors.onSurfaceVariant),
                          ),
                          const SizedBox(height: AppSpacing.md),
                          _SearchFilterBar(
                            filter: filter,
                            genresAsync: genresAsync,
                            onSearchChanged: (q) {
                              ref
                                  .read(archiveFilterProvider.notifier)
                                  .state = filter.copyWith(search: q);
                            },
                            onGenrePicked: (code) {
                              ref
                                  .read(archiveFilterProvider.notifier)
                                  .state = filter.copyWith(genreCode: code);
                            },
                          ),
                          const SizedBox(height: AppSpacing.md),
                        ]),
                      ),
                    ),
                    bookmarks.when(
                      loading: () => const SliverToBoxAdapter(
                        child: Padding(
                          padding: EdgeInsets.symmetric(vertical: 60),
                          child: Center(
                            child: CircularProgressIndicator(
                                color: AppColors.secondary),
                          ),
                        ),
                      ),
                      error: (e, _) => SliverToBoxAdapter(
                        child: Padding(
                          padding: const EdgeInsets.all(AppSpacing.md),
                          child: Text(
                            '불러올 수 없음: $e',
                            style: AppTypography.bodyMd
                                .copyWith(color: AppColors.error),
                          ),
                        ),
                      ),
                      data: (cards) => _ArchiveGrid(cards: cards),
                    ),
                    const SliverToBoxAdapter(child: SizedBox(height: 120)),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SearchFilterBar extends StatelessWidget {
  const _SearchFilterBar({
    required this.filter,
    required this.genresAsync,
    required this.onSearchChanged,
    required this.onGenrePicked,
  });
  final ArchiveFilter filter;
  final AsyncValue<List<Map<String, dynamic>>> genresAsync;
  final ValueChanged<String> onSearchChanged;
  final ValueChanged<String?> onGenrePicked;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: GlassCard(
            padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.sm, vertical: 4),
            child: Row(
              children: [
                const Icon(Icons.search,
                    size: 20, color: AppColors.outline),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    onChanged: onSearchChanged,
                    cursorColor: AppColors.secondary,
                    style: AppTypography.labelSm
                        .copyWith(color: AppColors.onSurface),
                    decoration: InputDecoration(
                      hintText: 'Search scripts...',
                      hintStyle: AppTypography.labelSm
                          .copyWith(color: AppColors.outline),
                      isCollapsed: true,
                      border: InputBorder.none,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        _GenreFilterButton(
          filter: filter,
          genresAsync: genresAsync,
          onPicked: onGenrePicked,
        ),
      ],
    );
  }
}

class _GenreFilterButton extends StatelessWidget {
  const _GenreFilterButton({
    required this.filter,
    required this.genresAsync,
    required this.onPicked,
  });
  final ArchiveFilter filter;
  final AsyncValue<List<Map<String, dynamic>>> genresAsync;
  final ValueChanged<String?> onPicked;

  @override
  Widget build(BuildContext context) {
    final label = filter.genreCode == null
        ? 'All Genres'
        : genresAsync
                .maybeWhen(
                  data: (gs) {
                    final g = gs.firstWhere(
                      (e) => e['code'] == filter.genreCode,
                      orElse: () => const {},
                    );
                    return g['name_ko'] as String?;
                  },
                  orElse: () => null,
                ) ??
            filter.genreCode!;

    return GlassButton(
      onTap: () => _open(context),
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.sm, vertical: 10),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.filter_list,
              size: 18, color: AppColors.onSurface),
          const SizedBox(width: 6),
          Text(
            label,
            style: AppTypography.labelSm
                .copyWith(color: AppColors.onSurface),
          ),
        ],
      ),
    );
  }

  void _open(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.surfaceContainerHigh,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: genresAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Text('$e'),
              data: (gs) {
                return Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _GenreChip(
                      label: 'All Genres',
                      selected: filter.genreCode == null,
                      onTap: () {
                        onPicked(null);
                        Navigator.pop(ctx);
                      },
                    ),
                    ...gs.map(
                      (g) => _GenreChip(
                        label: g['name_ko'] as String,
                        selected: filter.genreCode == g['code'],
                        onTap: () {
                          onPicked(g['code'] as String);
                          Navigator.pop(ctx);
                        },
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
        );
      },
    );
  }
}

class _GenreChip extends StatelessWidget {
  const _GenreChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: selected
              ? AppColors.secondary.withOpacity(0.2)
              : Colors.white.withOpacity(0.05),
          border: Border.all(
            color: selected
                ? AppColors.secondary
                : Colors.white.withOpacity(0.1),
          ),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(
          label,
          style: AppTypography.labelSm.copyWith(
            color: selected
                ? AppColors.secondary
                : AppColors.onSurface,
          ),
        ),
      ),
    );
  }
}

class _ArchiveGrid extends StatelessWidget {
  const _ArchiveGrid({required this.cards});
  final List<ScriptCard> cards;

  @override
  Widget build(BuildContext context) {
    if (cards.isEmpty) {
      return SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Center(
            child: Column(
              children: [
                const Icon(Icons.bookmark_outline,
                    size: 40, color: AppColors.outlineVariant),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  '아직 컬렉션이 비어 있어요.\n오늘의 각본을 저장해 보세요.',
                  textAlign: TextAlign.center,
                  style: AppTypography.bodyMd
                      .copyWith(color: AppColors.outlineVariant),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final width = MediaQuery.of(context).size.width;
    final cols = width >= 720 ? 3 : 2;

    return SliverPadding(
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.safeMargin),
      sliver: SliverGrid(
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: cols,
          mainAxisSpacing: AppSpacing.md,
          crossAxisSpacing: AppSpacing.md,
          childAspectRatio: 0.62,
        ),
        delegate: SliverChildBuilderDelegate(
          (context, i) => _ArchiveTile(card: cards[i]),
          childCount: cards.length,
        ),
      ),
    );
  }
}

class _ArchiveTile extends StatelessWidget {
  const _ArchiveTile({required this.card});
  final ScriptCard card;

  @override
  Widget build(BuildContext context) {
    final image = card.imageUrl;
    return GestureDetector(
      onTap: () => context.push('/card/${card.cardId}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: GlassCard(
              padding: EdgeInsets.zero,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (image != null && image.isNotEmpty)
                    CachedNetworkImage(
                      imageUrl: image,
                      fit: BoxFit.cover,
                      color: Colors.white.withOpacity(0.6),
                      colorBlendMode: BlendMode.modulate,
                    )
                  else
                    Container(color: AppColors.surfaceContainerLow),
                  // 그라데이션 오버레이
                  DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.transparent,
                          AppColors.background.withOpacity(0.85),
                        ],
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(AppSpacing.md - 4),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        if (card.genres.isNotEmpty)
                          Text(
                            card.genres.first.nameKo.toUpperCase(),
                            style: AppTypography.labelSm.copyWith(
                              color: AppColors.secondary,
                            ),
                          ),
                        const SizedBox(height: 4),
                        Text(
                          '"${card.content}"',
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.quoteMain.copyWith(
                            fontSize: 14,
                            height: 1.3,
                            color: AppColors.primary,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            card.work.title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.headlineSm
                .copyWith(fontSize: 16, color: AppColors.primary),
          ),
          Text(
            DateFormat('MMMM d, yyyy').format(DateTime.now()),
            style: AppTypography.labelSm
                .copyWith(color: AppColors.outlineVariant),
          ),
        ],
      ),
    );
  }
}

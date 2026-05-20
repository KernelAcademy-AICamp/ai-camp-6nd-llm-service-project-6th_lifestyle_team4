import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../models/card.dart';
import '../models/work.dart';
import '../providers/providers.dart';
import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import '../widgets/app_top_bar.dart';
import '../widgets/glass_card.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final today = DateFormat('yyyy년 M월 d일', 'ko_KR').format(DateTime.now());
    final todayAsync = ref.watch(todayCardProvider);
    final recentAsync = ref.watch(recentClickedProvider);

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
                  ref.invalidate(todayCardProvider);
                  ref.invalidate(recentClickedProvider);
                },
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.safeMargin,
                    AppSpacing.md,
                    AppSpacing.safeMargin,
                    AppSpacing.xl * 2,
                  ),
                  children: [
                    _DateAnchor(date: today),
                    const SizedBox(height: AppSpacing.lg),
                    _TodayCard(asyncCard: todayAsync),
                    const SizedBox(height: AppSpacing.xl),
                    _RecentSection(asyncList: recentAsync),
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

class _DateAnchor extends StatelessWidget {
  const _DateAnchor({required this.date});
  final String date;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          date.toUpperCase(),
          style: AppTypography.labelSm.copyWith(
            color: AppColors.secondary,
            letterSpacing: 2,
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          '오늘의 각본',
          style: AppTypography.headlineSm
              .copyWith(color: AppColors.onSurfaceVariant),
        ),
      ],
    );
  }
}

class _TodayCard extends StatelessWidget {
  const _TodayCard({required this.asyncCard});
  final AsyncValue<ScriptCard?> asyncCard;

  @override
  Widget build(BuildContext context) {
    return asyncCard.when(
      loading: () => const _TodayCardSkeleton(),
      error: (e, _) => _TodayCardError(message: e.toString()),
      data: (card) {
        if (card == null) {
          return const _TodayCardError(
            message: '오늘 추천할 각본이 없습니다.\n시드 데이터(seed.sql)를 적용해 주세요.',
          );
        }
        return _TodayCardBody(card: card);
      },
    );
  }
}

class _TodayCardBody extends ConsumerStatefulWidget {
  const _TodayCardBody({required this.card});
  final ScriptCard card;

  @override
  ConsumerState<_TodayCardBody> createState() => _TodayCardBodyState();
}

class _TodayCardBodyState extends ConsumerState<_TodayCardBody> {
  late bool _bookmarked = widget.card.isBookmarked;
  bool _busy = false;

  Future<void> _toggle() async {
    if (_busy) return;
    setState(() => _busy = true);
    final repo = ref.read(cardRepositoryProvider);
    final result = await repo.toggleBookmark(widget.card.cardId);
    if (!mounted) return;
    setState(() {
      _bookmarked = result;
      _busy = false;
    });
    ref.invalidate(bookmarkedCardsProvider);
  }

  @override
  Widget build(BuildContext context) {
    final card = widget.card;
    return AspectRatio(
      aspectRatio: 3 / 4,
      child: Stack(
        children: [
          GlassCard(
            padding: const EdgeInsets.all(AppSpacing.md + 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _CardHeader(
                  card: card,
                  bookmarked: _bookmarked,
                  onBookmark: _toggle,
                ),
                Expanded(child: _CardQuote(card: card)),
                _CardFooter(card: card, bookmarked: _bookmarked, onBookmark: _toggle),
              ],
            ),
          ),
          // 카드 우상단 골드 글로우
          Positioned(
            top: -40,
            right: -40,
            child: IgnorePointer(
              child: Container(
                width: 120,
                height: 120,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [
                      AppColors.secondary.withOpacity(0.18),
                      Colors.transparent,
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CardHeader extends StatelessWidget {
  const _CardHeader({
    required this.card,
    required this.bookmarked,
    required this.onBookmark,
  });

  final ScriptCard card;
  final bool bookmarked;
  final VoidCallback onBookmark;

  @override
  Widget build(BuildContext context) {
    final chips = <Widget>[];
    for (final g in card.genres.take(2)) {
      chips.add(_TagChip(label: g.nameKo));
    }
    chips.add(_TagChip(label: formatLabelKo(card.work.format)));

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Wrap(
            spacing: 8,
            runSpacing: 6,
            children: chips,
          ),
        ),
        _CircleIconButton(
          icon: bookmarked ? Icons.bookmark : Icons.bookmark_border,
          color: bookmarked ? AppColors.secondary : AppColors.onSurface,
          onTap: onBookmark,
        ),
      ],
    );
  }
}

class _CardQuote extends StatelessWidget {
  const _CardQuote({required this.card});
  final ScriptCard card;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            'DIALOGUE',
            style: AppTypography.labelSm.copyWith(
              color: AppColors.outlineVariant,
              letterSpacing: 2.4,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            '"${card.content}"',
            textAlign: TextAlign.center,
            style: AppTypography.quoteMain
                .copyWith(color: AppColors.primary, height: 1.6),
          ),
          if (card.hashtags.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.lg),
            Wrap(
              alignment: WrapAlignment.center,
              spacing: AppSpacing.sm,
              children: card.hashtags
                  .map((tag) => Text(
                        '#$tag',
                        style: AppTypography.labelSm
                            .copyWith(color: AppColors.outlineVariant),
                      ))
                  .toList(),
            ),
          ],
        ],
      ),
    );
  }
}

class _CardFooter extends ConsumerWidget {
  const _CardFooter({
    required this.card,
    required this.bookmarked,
    required this.onBookmark,
  });

  final ScriptCard card;
  final bool bookmarked;
  final VoidCallback onBookmark;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      children: [
        SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: () => context.push('/card/${card.cardId}'),
            icon: const Icon(Icons.menu_book_outlined, size: 18),
            label: const Text('전체 각본 읽기'),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              foregroundColor: AppColors.onPrimary,
              padding:
                  const EdgeInsets.symmetric(vertical: AppSpacing.sm),
              textStyle: AppTypography.labelSm
                  .copyWith(color: AppColors.onPrimary, letterSpacing: 1.2),
              shape: RoundedRectangleBorder(
                borderRadius:
                    BorderRadius.circular(AppSpacing.radius),
              ),
              elevation: 0,
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton(
            onPressed: onBookmark,
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.onSurface,
              side: BorderSide(color: Colors.white.withOpacity(0.2)),
              padding:
                  const EdgeInsets.symmetric(vertical: AppSpacing.sm - 2),
              shape: RoundedRectangleBorder(
                borderRadius:
                    BorderRadius.circular(AppSpacing.radius),
              ),
              textStyle: AppTypography.labelSm
                  .copyWith(color: AppColors.onSurface, letterSpacing: 1.2),
            ),
            child: Text(bookmarked ? '컬렉션에 저장됨' : '컬렉션에 추가'),
          ),
        ),
      ],
    );
  }
}

class _TagChip extends StatelessWidget {
  const _TagChip({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.05),
        border: Border.all(color: Colors.white.withOpacity(0.1)),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: AppTypography.labelSm
            .copyWith(color: AppColors.onSurfaceVariant),
      ),
    );
  }
}

class _CircleIconButton extends StatelessWidget {
  const _CircleIconButton({
    required this.icon,
    this.color = AppColors.onSurface,
    this.onTap,
  });
  final IconData icon;
  final Color color;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.05),
            border: Border.all(color: Colors.white.withOpacity(0.1)),
            shape: BoxShape.circle,
          ),
          child: Icon(icon, color: color, size: 20),
        ),
      ),
    );
  }
}

class _RecentSection extends StatelessWidget {
  const _RecentSection({required this.asyncList});
  final AsyncValue<List<ScriptCard>> asyncList;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.history,
                size: 14, color: AppColors.outlineVariant),
            const SizedBox(width: 6),
            Text(
              '지난 기록들',
              style: AppTypography.labelSm
                  .copyWith(color: AppColors.outlineVariant),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.md),
        asyncList.when(
          loading: () => const SizedBox(
            height: 80,
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (e, _) => Text(
            '불러올 수 없음: $e',
            style: AppTypography.labelSm
                .copyWith(color: AppColors.error),
          ),
          data: (cards) {
            if (cards.isEmpty) {
              return Text(
                '아직 본 각본이 없어요.',
                style: AppTypography.labelSm
                    .copyWith(color: AppColors.outlineVariant),
              );
            }
            return GridView.builder(
              physics: const NeverScrollableScrollPhysics(),
              shrinkWrap: true,
              itemCount: cards.length,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: AppSpacing.md,
                crossAxisSpacing: AppSpacing.md,
                childAspectRatio: 16 / 9,
              ),
              itemBuilder: (context, i) {
                final c = cards[i];
                return GestureDetector(
                  onTap: () => context.push('/card/${c.cardId}'),
                  child: GlassCard(
                    padding: const EdgeInsets.all(AppSpacing.sm),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        const Spacer(),
                        Text(
                          c.work.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.headlineSm.copyWith(
                            fontSize: 14,
                            color: AppColors.onSurfaceVariant,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          DateFormat('yy.MM.dd').format(DateTime.now()),
                          style: AppTypography.labelSm.copyWith(
                            fontSize: 10,
                            color: AppColors.outline,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            );
          },
        ),
      ],
    );
  }
}

class _TodayCardSkeleton extends StatelessWidget {
  const _TodayCardSkeleton();
  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: 3 / 4,
      child: GlassCard(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: const Center(
          child: CircularProgressIndicator(color: AppColors.secondary),
        ),
      ),
    );
  }
}

class _TodayCardError extends StatelessWidget {
  const _TodayCardError({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: 3 / 4,
      child: GlassCard(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Center(
          child: Text(
            message,
            textAlign: TextAlign.center,
            style: AppTypography.bodyMd
                .copyWith(color: AppColors.onSurfaceVariant),
          ),
        ),
      ),
    );
  }
}

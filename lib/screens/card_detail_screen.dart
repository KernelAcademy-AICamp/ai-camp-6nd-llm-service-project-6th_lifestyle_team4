import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../models/card.dart';
import '../providers/providers.dart';
import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import '../widgets/glass_card.dart';

class CardDetailScreen extends ConsumerStatefulWidget {
  const CardDetailScreen({super.key, required this.cardId});
  final int cardId;

  @override
  ConsumerState<CardDetailScreen> createState() => _CardDetailScreenState();
}

class _CardDetailScreenState extends ConsumerState<CardDetailScreen> {
  bool? _bookmarked;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    // 상세 진입 = 사용자 선호 학습 신호. 실패해도 화면 표시는 막지 않는다.
    Future.microtask(() async {
      try {
        await ref.read(cardRepositoryProvider).logClick(widget.cardId);
        if (!mounted) return;
        ref.invalidate(recentClickedProvider);
      } catch (_) {
        // 무시 — 학습 신호 누락은 치명적이지 않음
      }
    });
  }

  Future<void> _toggle() async {
    if (_busy) return;
    setState(() => _busy = true);
    final repo = ref.read(cardRepositoryProvider);
    final result = await repo.toggleBookmark(widget.cardId);
    if (!mounted) return;
    setState(() {
      _bookmarked = result;
      _busy = false;
    });
    ref.invalidate(bookmarkedCardsProvider);
    ref.invalidate(cardDetailProvider(widget.cardId));
  }

  @override
  Widget build(BuildContext context) {
    final asyncCard = ref.watch(cardDetailProvider(widget.cardId));

    return Scaffold(
      backgroundColor: AppColors.background,
      body: AtmosphericBackground(
        child: asyncCard.when(
          loading: () => const Center(
            child: CircularProgressIndicator(color: AppColors.secondary),
          ),
          error: (e, _) => SafeArea(
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.md),
                child: Text('$e',
                    style: AppTypography.bodyMd
                        .copyWith(color: AppColors.error)),
              ),
            ),
          ),
          data: (card) {
            if (card == null) {
              return const Center(child: Text('카드를 찾을 수 없습니다.'));
            }
            _bookmarked ??= card.isBookmarked;
            return _DetailBody(
              card: card,
              bookmarked: _bookmarked!,
              busy: _busy,
              onBookmark: _toggle,
            );
          },
        ),
      ),
    );
  }
}

class _DetailBody extends StatelessWidget {
  const _DetailBody({
    required this.card,
    required this.bookmarked,
    required this.busy,
    required this.onBookmark,
  });

  final ScriptCard card;
  final bool bookmarked;
  final bool busy;
  final VoidCallback onBookmark;

  @override
  Widget build(BuildContext context) {
    final image = card.imageUrl;
    return Stack(
      children: [
        // 배경 — 카드 이미지가 있으면 어둡게 깔기
        if (image != null && image.isNotEmpty)
          Positioned.fill(
            child: ShaderMask(
              shaderCallback: (rect) {
                return LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.black.withOpacity(0.4),
                    Colors.black,
                  ],
                ).createShader(rect);
              },
              blendMode: BlendMode.darken,
              child: CachedNetworkImage(
                imageUrl: image,
                fit: BoxFit.cover,
                color: Colors.black.withOpacity(0.5),
                colorBlendMode: BlendMode.darken,
              ),
            ),
          ),
        SafeArea(
          child: Column(
            children: [
              _TopBar(
                title: card.work.title,
                bookmarked: bookmarked,
                onBookmark: onBookmark,
              ),
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.safeMargin,
                    AppSpacing.lg,
                    AppSpacing.safeMargin,
                    AppSpacing.xl * 2,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const SizedBox(height: AppSpacing.xl),
                      _ScriptBody(card: card),
                      const SizedBox(height: AppSpacing.xl),
                      _CollectButton(
                        bookmarked: bookmarked,
                        busy: busy,
                        onPressed: onBookmark,
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar({
    required this.title,
    required this.bookmarked,
    required this.onBookmark,
  });
  final String title;
  final bool bookmarked;
  final VoidCallback onBookmark;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.sm, vertical: AppSpacing.xs),
      child: Row(
        children: [
          IconButton(
            onPressed: () => context.pop(),
            icon: const Icon(Icons.arrow_back_ios_new,
                color: AppColors.primary),
          ),
          Expanded(
            child: Text(
              title,
              textAlign: TextAlign.center,
              style: AppTypography.headlineSm
                  .copyWith(color: AppColors.primary),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          IconButton(
            onPressed: onBookmark,
            icon: Icon(
              bookmarked ? Icons.bookmark : Icons.bookmark_border,
              color:
                  bookmarked ? AppColors.secondary : AppColors.primary,
            ),
          ),
        ],
      ),
    );
  }
}

class _ScriptBody extends StatelessWidget {
  const _ScriptBody({required this.card});
  final ScriptCard card;

  @override
  Widget build(BuildContext context) {
    final fullScene = card.fullScene;
    final sceneHeader = card.sceneHeader;
    final desc = card.sceneDescription;
    final character = card.characterName;

    return GlassCard(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (fullScene != null)
            _FullSceneScript(text: fullScene, highlight: card.content)
          else ...[
            if (sceneHeader != null) ...[
              Text(
                sceneHeader.toUpperCase(),
                style: AppTypography.labelSm.copyWith(
                  color: AppColors.outline,
                  letterSpacing: 2.4,
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
            ],
            if (desc != null) ...[
              Text(
                desc,
                style: AppTypography.bodyLg.copyWith(
                  color: AppColors.onSurfaceVariant,
                  height: 1.6,
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
            ],
            if (character != null) ...[
              Center(
                child: Text(
                  character.toUpperCase(),
                  style: AppTypography.labelSm.copyWith(
                    color: AppColors.primary,
                    fontSize: 13,
                    letterSpacing: 3,
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
            ],
            Text(
              '"${card.content}"',
              textAlign: TextAlign.center,
              style: AppTypography.quoteMain
                  .copyWith(color: AppColors.primary, height: 1.6),
            ),
          ],
          if (card.hashtags.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            Wrap(
              alignment: WrapAlignment.center,
              spacing: AppSpacing.sm,
              children: card.hashtags
                  .map((t) => Text('#$t',
                      style: AppTypography.labelSm
                          .copyWith(color: AppColors.outlineVariant)))
                  .toList(),
            ),
          ],
        ],
      ),
    );
  }
}

/// 시나리오 폰트(monospace 계열) 로 풀 씬을 보여주고,
/// 카드의 한 줄 명대사가 등장하면 골드로 하이라이트한다.
class _FullSceneScript extends StatelessWidget {
  const _FullSceneScript({required this.text, required this.highlight});
  final String text;
  final String highlight;

  @override
  Widget build(BuildContext context) {
    final mono = GoogleFonts.ibmPlexMono(
      fontSize: 14,
      height: 1.7,
      color: AppColors.onSurface,
    );
    final monoGold = mono.copyWith(
      color: AppColors.secondary,
      fontWeight: FontWeight.w600,
    );

    final spans = <TextSpan>[];
    final lines = text.split('\n');
    final needle = highlight.trim();

    for (var i = 0; i < lines.length; i++) {
      final line = lines[i];
      // 명대사가 포함된 줄(공백 무시) 은 골드 강조
      final isQuote = needle.isNotEmpty &&
          line.trim().replaceAll('"', '').contains(needle.replaceAll('"', ''));
      spans.add(TextSpan(
        text: line + (i == lines.length - 1 ? '' : '\n'),
        style: isQuote ? monoGold : mono,
      ));
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.sm),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.25),
        borderRadius: BorderRadius.circular(AppSpacing.radius),
        border: Border.all(color: Colors.white.withOpacity(0.05)),
      ),
      child: SelectableText.rich(
        TextSpan(children: spans),
      ),
    );
  }
}

class _CollectButton extends StatelessWidget {
  const _CollectButton({
    required this.bookmarked,
    required this.busy,
    required this.onPressed,
  });
  final bool bookmarked;
  final bool busy;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: OutlinedButton.icon(
        onPressed: busy ? null : onPressed,
        icon: Icon(
          bookmarked ? Icons.check : Icons.add,
          color: bookmarked ? AppColors.secondary : AppColors.primary,
        ),
        label: Text(
          bookmarked ? 'COLLECTED' : 'COLLECT SCRIPT ARTIFACT',
          style: AppTypography.labelSm.copyWith(
            color: bookmarked ? AppColors.secondary : AppColors.primary,
            letterSpacing: 1.6,
          ),
        ),
        style: OutlinedButton.styleFrom(
          side: BorderSide(
            color: bookmarked
                ? AppColors.secondary
                : Colors.white.withOpacity(0.25),
          ),
          padding:
              const EdgeInsets.symmetric(vertical: AppSpacing.sm),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppSpacing.radius),
          ),
        ),
      ),
    );
  }
}

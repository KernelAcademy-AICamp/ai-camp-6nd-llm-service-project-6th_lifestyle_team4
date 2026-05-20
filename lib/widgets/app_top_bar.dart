import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_typography.dart';

class AppTopBar extends StatelessWidget implements PreferredSizeWidget {
  const AppTopBar({
    super.key,
    this.title = 'Daily Script',
    this.leading,
    this.trailing,
    this.showDivider = true,
  });

  final String title;
  final Widget? leading;
  final Widget? trailing;
  final bool showDivider;

  @override
  Size get preferredSize => const Size.fromHeight(64);

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 64,
      padding: const EdgeInsets.symmetric(horizontal: 24),
      decoration: BoxDecoration(
        color: AppColors.background.withOpacity(0.8),
        border: showDivider
            ? Border(
                bottom:
                    BorderSide(color: Colors.white.withOpacity(0.08), width: 1),
              )
            : null,
      ),
      child: Row(
        children: [
          SizedBox(
            width: 40,
            child: leading ??
                IconButton(
                  icon: const Icon(Icons.menu, color: AppColors.primary),
                  onPressed: () {},
                ),
          ),
          Expanded(
            child: Center(
              child: Text(
                title,
                style: AppTypography.headlineMd
                    .copyWith(color: AppColors.primary),
              ),
            ),
          ),
          SizedBox(width: 40, child: trailing ?? const _Avatar()),
        ],
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar();
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 32,
      height: 32,
      decoration: BoxDecoration(
        color: AppColors.surfaceVariant,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white.withOpacity(0.1)),
      ),
      child: const Icon(Icons.person, size: 18, color: AppColors.onSurfaceVariant),
    );
  }
}

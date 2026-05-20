import 'dart:ui';

import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_typography.dart';

class AppBottomNav extends StatelessWidget {
  const AppBottomNav({
    super.key,
    required this.currentIndex,
    required this.onTap,
  });

  final int currentIndex;
  final ValueChanged<int> onTap;

  static const _items = [
    _NavItem(label: 'Home', icon: Icons.tv_outlined, activeIcon: Icons.tv),
    _NavItem(
      label: 'Archive',
      icon: Icons.calendar_today_outlined,
      activeIcon: Icons.calendar_today,
    ),
    _NavItem(
      label: 'Settings',
      icon: Icons.settings_outlined,
      activeIcon: Icons.settings,
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return ClipRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
        child: Container(
          decoration: BoxDecoration(
            color: AppColors.surfaceContainerLowest.withOpacity(0.85),
            border: Border(
              top: BorderSide(color: Colors.white.withOpacity(0.05)),
            ),
            boxShadow: const [
              BoxShadow(
                color: Color(0x80000000),
                blurRadius: 30,
                offset: Offset(0, -10),
              ),
            ],
          ),
          padding: EdgeInsets.only(
            top: 8,
            bottom: 8 + MediaQuery.of(context).padding.bottom,
            left: 16,
            right: 16,
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              for (int i = 0; i < _items.length; i++)
                _NavButton(
                  item: _items[i],
                  selected: currentIndex == i,
                  onTap: () => onTap(i),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavItem {
  const _NavItem({
    required this.label,
    required this.icon,
    required this.activeIcon,
  });
  final String label;
  final IconData icon;
  final IconData activeIcon;
}

class _NavButton extends StatelessWidget {
  const _NavButton({
    required this.item,
    required this.selected,
    required this.onTap,
  });

  final _NavItem item;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color =
        selected ? AppColors.secondary : AppColors.outlineVariant;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
          decoration: BoxDecoration(
            color: selected
                ? Colors.white.withOpacity(0.05)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(selected ? item.activeIcon : item.icon, color: color),
              const SizedBox(height: 4),
              Text(
                item.label,
                style: AppTypography.labelSm.copyWith(color: color),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/supabase_client.dart';
import '../providers/providers.dart';
import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import '../widgets/app_top_bar.dart';
import '../widgets/glass_card.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});
  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  bool _pushOn = true;

  @override
  Widget build(BuildContext context) {
    final user = SupabaseConfig.client.auth.currentUser;
    final nick = (user?.userMetadata?['nickname'] as String?) ??
        (user?.email?.split('@').first) ??
        'Anonymous Viewer';

    return AtmosphericBackground(
      child: SafeArea(
        bottom: false,
        child: Column(
          children: [
            const AppTopBar(),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.safeMargin,
                  AppSpacing.md,
                  AppSpacing.safeMargin,
                  AppSpacing.xl * 2,
                ),
                children: [
                  const SizedBox(height: AppSpacing.md),
                  _ProfileHeader(nickname: nick),
                  const SizedBox(height: AppSpacing.xl),
                  _PushRow(
                    value: _pushOn,
                    onChanged: (v) => setState(() => _pushOn = v),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  const _SettingRow(
                    icon: Icons.palette_outlined,
                    title: 'Theme Settings',
                    subtitle: 'Cinematic Dark (Active)',
                  ),
                  const SizedBox(height: AppSpacing.md),
                  const _SettingRow(
                    icon: Icons.description_outlined,
                    title: 'Terms of Service',
                    subtitle: 'Privacy & Legal Guidelines',
                  ),
                  const SizedBox(height: AppSpacing.md),
                  const _SettingRow(
                    icon: Icons.info_outline,
                    title: 'Version Info',
                    subtitle: 'Build 1.0.0 (Late Night Edition)',
                    trailing: _VersionBadge(),
                  ),
                  const SizedBox(height: AppSpacing.xl),
                  OutlinedButton(
                    style: OutlinedButton.styleFrom(
                      side: BorderSide(
                          color: AppColors.secondary.withOpacity(0.4)),
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    onPressed: () async {
                      await SupabaseConfig.client.auth.signOut();
                      if (!mounted) return;
                      // 익명 로그인 재진입
                      await SupabaseConfig.ensureSignedIn();
                      ref.invalidate(todayCardProvider);
                      ref.invalidate(recentClickedProvider);
                      ref.invalidate(bookmarkedCardsProvider);
                      if (!mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('새로운 익명 세션으로 다시 로그인했습니다.'),
                        ),
                      );
                    },
                    child: Text(
                      'SIGN OUT OF DAILY SCRIPT',
                      style: AppTypography.labelSm.copyWith(
                        color: AppColors.secondary,
                        letterSpacing: 1.6,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProfileHeader extends StatelessWidget {
  const _ProfileHeader({required this.nickname});
  final String nickname;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Stack(
          children: [
            Container(
              width: 96,
              height: 96,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: AppColors.secondary, width: 2),
                color: AppColors.surfaceContainer,
              ),
              child: const Center(
                child: Icon(Icons.person,
                    size: 44, color: AppColors.onSurfaceVariant),
              ),
            ),
            Positioned(
              right: 0,
              bottom: 0,
              child: Container(
                width: 26,
                height: 26,
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppColors.secondary,
                ),
                child: const Icon(Icons.edit,
                    size: 14, color: AppColors.onSecondary),
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(nickname,
            style: AppTypography.headlineMd.copyWith(color: AppColors.primary)),
        const SizedBox(height: 2),
        Text(
          'COLLECTOR OF NARRATIVES',
          style: AppTypography.labelSm.copyWith(
            color: AppColors.outlineVariant,
            letterSpacing: 2,
          ),
        ),
      ],
    );
  }
}

class _PushRow extends StatelessWidget {
  const _PushRow({required this.value, required this.onChanged});
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return _SettingShell(
      child: Row(
        children: [
          const _IconBox(icon: Icons.notifications_none),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Push Notifications',
                    style: AppTypography.bodyLg.copyWith(
                      color: AppColors.primary,
                      fontWeight: FontWeight.w600,
                      fontSize: 16,
                    )),
                Text(
                  'Script arrival: 11:00 PM',
                  style: AppTypography.bodyMd.copyWith(
                    color: AppColors.outlineVariant,
                    fontSize: 14,
                  ),
                ),
              ],
            ),
          ),
          Switch.adaptive(
            value: value,
            onChanged: onChanged,
            activeColor: AppColors.secondary,
          ),
        ],
      ),
    );
  }
}

class _SettingRow extends StatelessWidget {
  const _SettingRow({
    required this.icon,
    required this.title,
    required this.subtitle,
    this.trailing,
  });
  final IconData icon;
  final String title;
  final String subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return _SettingShell(
      child: Row(
        children: [
          _IconBox(icon: icon),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: AppTypography.bodyLg.copyWith(
                      color: AppColors.primary,
                      fontWeight: FontWeight.w600,
                      fontSize: 16,
                    )),
                Text(subtitle,
                    style: AppTypography.bodyMd.copyWith(
                      color: AppColors.outlineVariant,
                      fontSize: 14,
                    )),
              ],
            ),
          ),
          trailing ??
              const Icon(Icons.chevron_right,
                  color: AppColors.outlineVariant),
        ],
      ),
    );
  }
}

class _SettingShell extends StatelessWidget {
  const _SettingShell({required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md - 4),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerLow,
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
        border: Border.all(color: Colors.white.withOpacity(0.04)),
      ),
      child: child,
    );
  }
}

class _IconBox extends StatelessWidget {
  const _IconBox({required this.icon});
  final IconData icon;
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 40,
      height: 40,
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Icon(icon, color: AppColors.secondary, size: 20),
    );
  }
}

class _VersionBadge extends StatelessWidget {
  const _VersionBadge();
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text('STABLE',
          style: AppTypography.labelSm.copyWith(
            color: AppColors.outlineVariant,
            fontSize: 10,
          )),
    );
  }
}

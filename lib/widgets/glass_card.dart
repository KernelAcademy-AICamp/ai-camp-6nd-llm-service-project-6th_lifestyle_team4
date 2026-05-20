import 'dart:ui';

import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';

/// Soft glassmorphism container — 5% white fill, 15% stroke, 20px blur.
class GlassCard extends StatelessWidget {
  const GlassCard({
    super.key,
    required this.child,
    this.padding,
    this.borderRadius = AppSpacing.radiusLg,
    this.strokeOpacity = 0.15,
    this.fillOpacity = 0.05,
    this.blur = 20,
  });

  final Widget child;
  final EdgeInsetsGeometry? padding;
  final double borderRadius;
  final double strokeOpacity;
  final double fillOpacity;
  final double blur;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(borderRadius);
    return ClipRRect(
      borderRadius: radius,
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: blur, sigmaY: blur),
        child: Container(
          padding: padding,
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(fillOpacity),
            border: Border.all(
              color: Colors.white.withOpacity(strokeOpacity),
            ),
            borderRadius: radius,
          ),
          child: child,
        ),
      ),
    );
  }
}

class GlassButton extends StatelessWidget {
  const GlassButton({
    super.key,
    required this.child,
    this.onTap,
    this.padding = const EdgeInsets.symmetric(
      horizontal: AppSpacing.sm,
      vertical: AppSpacing.xs,
    ),
    this.borderRadius = AppSpacing.radiusMd,
  });

  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry padding;
  final double borderRadius;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(borderRadius),
        onTap: onTap,
        child: GlassCard(
          borderRadius: borderRadius,
          padding: padding,
          child: child,
        ),
      ),
    );
  }
}

class AtmosphericBackground extends StatelessWidget {
  const AtmosphericBackground({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        Positioned.fill(
          child: DecoratedBox(
            decoration: const BoxDecoration(
              color: AppColors.background,
            ),
          ),
        ),
        Positioned(
          top: -120,
          left: 0,
          right: 0,
          child: IgnorePointer(
            child: Container(
              height: 260,
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: const Alignment(0, -1),
                  radius: 0.8,
                  colors: [
                    AppColors.secondary.withOpacity(0.08),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
        ),
        Positioned(
          bottom: -80,
          left: -80,
          child: IgnorePointer(
            child: Container(
              width: 280,
              height: 280,
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  colors: [
                    const Color(0xFF708090).withOpacity(0.06),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
        ),
        Positioned.fill(child: child),
      ],
    );
  }
}

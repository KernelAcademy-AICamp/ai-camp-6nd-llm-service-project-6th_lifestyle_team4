import 'package:flutter/material.dart';

/// Daily Script — Cinematic dark palette (from DESIGN.md).
class AppColors {
  const AppColors._();

  // Stage
  static const Color background = Color(0xFF131314);
  static const Color surface = Color(0xFF131314);
  static const Color surfaceDim = Color(0xFF131314);
  static const Color surfaceBright = Color(0xFF39393A);
  static const Color surfaceContainerLowest = Color(0xFF0E0E0F);
  static const Color surfaceContainerLow = Color(0xFF1B1B1C);
  static const Color surfaceContainer = Color(0xFF1F1F20);
  static const Color surfaceContainerHigh = Color(0xFF2A2A2B);
  static const Color surfaceContainerHighest = Color(0xFF353436);
  static const Color surfaceVariant = Color(0xFF353436);

  // Ink
  static const Color onSurface = Color(0xFFE5E2E3);
  static const Color onSurfaceVariant = Color(0xFFC5C7C9);
  static const Color outline = Color(0xFF8F9194);
  static const Color outlineVariant = Color(0xFF44474A);

  // Primary (off-white)
  static const Color primary = Color(0xFFFFFFFF);
  static const Color onPrimary = Color(0xFF2F3132);

  // Accent — gold
  static const Color secondary = Color(0xFFE9C349);
  static const Color onSecondary = Color(0xFF3C2F00);
  static const Color secondaryContainer = Color(0xFFAF8D11);

  // Error
  static const Color error = Color(0xFFFFB4AB);
  static const Color onError = Color(0xFF690005);

  // Glass overlays
  static Color get glassFill => Colors.white.withOpacity(0.05);
  static Color get glassStroke => Colors.white.withOpacity(0.15);
  static Color get glassStrokeSoft => Colors.white.withOpacity(0.08);
}

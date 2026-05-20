import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'app_colors.dart';

/// Noto Serif (Korean) for "Script" content, Hanken Grotesk for UI.
class AppTypography {
  const AppTypography._();

  static TextStyle _serif(
    double size, {
    double? height,
    FontWeight weight = FontWeight.w400,
    double letterSpacing = 0,
    Color color = AppColors.onSurface,
    FontStyle fontStyle = FontStyle.normal,
  }) {
    return GoogleFonts.notoSerifKr(
      fontSize: size,
      height: height == null ? null : height / size,
      fontWeight: weight,
      letterSpacing: letterSpacing,
      color: color,
      fontStyle: fontStyle,
    );
  }

  static TextStyle _sans(
    double size, {
    double? height,
    FontWeight weight = FontWeight.w400,
    double letterSpacing = 0,
    Color color = AppColors.onSurface,
  }) {
    return GoogleFonts.hankenGrotesk(
      fontSize: size,
      height: height == null ? null : height / size,
      fontWeight: weight,
      letterSpacing: letterSpacing,
      color: color,
    );
  }

  // Display / headlines (serif)
  static TextStyle get displayLg => _serif(
        40,
        height: 52,
        weight: FontWeight.w700,
        letterSpacing: -0.8,
      );
  static TextStyle get displayLgMobile => _serif(
        32,
        height: 40,
        weight: FontWeight.w700,
      );
  static TextStyle get headlineMd =>
      _serif(24, height: 32, weight: FontWeight.w600);
  static TextStyle get headlineSm =>
      _serif(20, height: 28, weight: FontWeight.w600);
  static TextStyle get quoteMain => _serif(
        22,
        height: 36,
        weight: FontWeight.w400,
        letterSpacing: -0.22,
        fontStyle: FontStyle.italic,
      );

  // Body / labels (sans)
  static TextStyle get bodyLg => _sans(18, height: 28);
  static TextStyle get bodyMd => _sans(16, height: 24);
  static TextStyle get labelSm => _sans(
        12,
        height: 16,
        weight: FontWeight.w600,
        letterSpacing: 0.6,
      );
}

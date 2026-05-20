import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'app_colors.dart';
import 'app_typography.dart';

class AppTheme {
  const AppTheme._();

  static ThemeData get dark {
    final base = ThemeData.dark(useMaterial3: true);
    final colorScheme = ColorScheme.dark(
      brightness: Brightness.dark,
      surface: AppColors.surface,
      onSurface: AppColors.onSurface,
      surfaceContainer: AppColors.surfaceContainer,
      surfaceContainerHigh: AppColors.surfaceContainerHigh,
      surfaceContainerHighest: AppColors.surfaceContainerHighest,
      surfaceContainerLow: AppColors.surfaceContainerLow,
      surfaceContainerLowest: AppColors.surfaceContainerLowest,
      onSurfaceVariant: AppColors.onSurfaceVariant,
      outline: AppColors.outline,
      outlineVariant: AppColors.outlineVariant,
      primary: AppColors.primary,
      onPrimary: AppColors.onPrimary,
      secondary: AppColors.secondary,
      onSecondary: AppColors.onSecondary,
      secondaryContainer: AppColors.secondaryContainer,
      error: AppColors.error,
      onError: AppColors.onError,
    );

    return base.copyWith(
      colorScheme: colorScheme,
      scaffoldBackgroundColor: AppColors.background,
      canvasColor: AppColors.background,
      splashFactory: InkRipple.splashFactory,
      textTheme: GoogleFonts.hankenGroteskTextTheme(base.textTheme).apply(
        bodyColor: AppColors.onSurface,
        displayColor: AppColors.onSurface,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.background,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: true,
        titleTextStyle: AppTypography.headlineMd.copyWith(
          color: AppColors.primary,
        ),
        iconTheme: const IconThemeData(color: AppColors.primary),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: AppColors.surfaceContainerLowest,
        selectedItemColor: AppColors.secondary,
        unselectedItemColor: AppColors.outlineVariant,
        type: BottomNavigationBarType.fixed,
        showUnselectedLabels: true,
      ),
      iconTheme: const IconThemeData(color: AppColors.onSurfaceVariant),
      dividerColor: AppColors.outlineVariant.withOpacity(0.3),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: AppColors.surfaceContainerHigh,
        contentTextStyle: AppTypography.bodyMd,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }
}

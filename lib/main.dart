import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'core/supabase_client.dart';
import 'routing/app_router.dart';
import 'theme/app_colors.dart';
import 'theme/app_theme.dart';
import 'theme/app_typography.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  String? bootError;
  try {
    await dotenv.load(fileName: '.env');
    await initializeDateFormatting('ko_KR');
    await SupabaseConfig.init();
    await SupabaseConfig.ensureSignedIn();
  } catch (e, st) {
    bootError = '$e\n\n$st';
    // ignore: avoid_print
    print('[BOOT ERROR] $e\n$st');
  }

  if (bootError != null) {
    runApp(_BootErrorApp(message: bootError));
    return;
  }

  runApp(const ProviderScope(child: DailyScriptApp()));
}

class DailyScriptApp extends StatelessWidget {
  const DailyScriptApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Daily Script',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dark,
      routerConfig: appRouter,
    );
  }
}

class _BootErrorApp extends StatelessWidget {
  const _BootErrorApp({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dark,
      home: Scaffold(
        backgroundColor: AppColors.background,
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('초기화 실패',
                      style: AppTypography.headlineMd
                          .copyWith(color: AppColors.error)),
                  const SizedBox(height: 12),
                  Text(
                    '아래 원인을 확인해 주세요.\n'
                    '1) .env 의 SUPABASE_URL / SUPABASE_ANON_KEY\n'
                    '2) Supabase 대시보드의 Anonymous Sign-In 활성화\n'
                    '3) 네트워크',
                    style: AppTypography.bodyMd
                        .copyWith(color: AppColors.onSurfaceVariant),
                  ),
                  const SizedBox(height: 24),
                  SelectableText(
                    message,
                    style: AppTypography.bodyMd
                        .copyWith(color: AppColors.error, fontSize: 12),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

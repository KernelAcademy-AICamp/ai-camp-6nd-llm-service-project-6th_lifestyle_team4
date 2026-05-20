import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../screens/archive_screen.dart';
import '../screens/card_detail_screen.dart';
import '../screens/home_screen.dart';
import '../screens/settings_screen.dart';
import '../widgets/app_bottom_nav.dart';

final appRouter = GoRouter(
  initialLocation: '/home',
  routes: [
    ShellRoute(
      builder: (context, state, child) => _ShellScaffold(
        location: state.uri.path,
        child: child,
      ),
      routes: [
        GoRoute(
          path: '/home',
          builder: (context, state) => const HomeScreen(),
        ),
        GoRoute(
          path: '/archive',
          builder: (context, state) => const ArchiveScreen(),
        ),
        GoRoute(
          path: '/settings',
          builder: (context, state) => const SettingsScreen(),
        ),
      ],
    ),
    GoRoute(
      path: '/card/:id',
      builder: (context, state) {
        final id = int.parse(state.pathParameters['id']!);
        return CardDetailScreen(cardId: id);
      },
    ),
  ],
);

class _ShellScaffold extends StatelessWidget {
  const _ShellScaffold({required this.location, required this.child});

  final String location;
  final Widget child;

  int get _currentIndex {
    if (location.startsWith('/archive')) return 1;
    if (location.startsWith('/settings')) return 2;
    return 0;
  }

  void _onTap(BuildContext context, int index) {
    switch (index) {
      case 0:
        context.go('/home');
        break;
      case 1:
        context.go('/archive');
        break;
      case 2:
        context.go('/settings');
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBody: true,
      backgroundColor: Colors.transparent,
      body: child,
      bottomNavigationBar: AppBottomNav(
        currentIndex: _currentIndex,
        onTap: (i) => _onTap(context, i),
      ),
    );
  }
}

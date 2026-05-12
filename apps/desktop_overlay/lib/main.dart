import 'package:flutter/material.dart';
import 'src/overlay_home.dart';

void main() {
  runApp(const GapOverlayApp());
}

class GapOverlayApp extends StatelessWidget {
  const GapOverlayApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark(useMaterial3: true).copyWith(
        scaffoldBackgroundColor: const Color(0xFF080808),
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF00FF88),
          brightness: Brightness.dark,
        ),
      ),
      home: const OverlayHome(),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:window_manager/window_manager.dart';

import 'src/overlay_home.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await windowManager.ensureInitialized();

  const options = WindowOptions(
    size: Size(460, 620),
    minimumSize: Size(280, 92),
    center: false,
    backgroundColor: Colors.transparent,
    skipTaskbar: false,
    titleBarStyle: TitleBarStyle.hidden,
    alwaysOnTop: true,
  );

  await windowManager.waitUntilReadyToShow(options, () async {
    await windowManager.setAsFrameless();
    await windowManager.setAlwaysOnTop(true);
    await windowManager.show();
    await windowManager.focus();
  });

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

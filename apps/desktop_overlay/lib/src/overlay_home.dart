import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import 'approval_card.dart';

class OverlayHome extends StatefulWidget {
  const OverlayHome({super.key});

  @override
  State<OverlayHome> createState() => _OverlayHomeState();
}

class _OverlayHomeState extends State<OverlayHome> {
  WebSocketChannel? _channel;
  Process? _gapdProcess;
  Timer? _reconnectTimer;
  bool _disposed = false;
  bool _startingGapd = false;
  String _connection = 'disconnected';
  Map<String, dynamic>? _gitRequest;
  Map<String, dynamic>? _agentRequest;
  final List<String> _logs = <String>[];

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    _addLog('Bootstrapping local GAP runtime');
    final running = await _isGapdHealthy();
    if (!running) {
      await _startBundledGapd();
    }
    _connect();
  }

  Future<bool> _isGapdHealthy() async {
    try {
      final client = HttpClient();
      final request = await client
          .getUrl(Uri.parse('http://127.0.0.1:3000/health'))
          .timeout(const Duration(milliseconds: 700));
      final response = await request.close().timeout(const Duration(milliseconds: 700));
      final ok = response.statusCode == 200;
      client.close(force: true);
      return ok;
    } catch (_) {
      return false;
    }
  }

  Future<void> _startBundledGapd() async {
    if (_startingGapd) return;
    _startingGapd = true;

    try {
      final executableDir = File(Platform.resolvedExecutable).parent.path;
      final gapdPath = '$executableDir${Platform.pathSeparator}gapd.exe';
      final gapdFile = File(gapdPath);

      if (!await gapdFile.exists()) {
        _addLog('gapd.exe not found beside overlay executable');
        return;
      }

      _addLog('Starting bundled gapd.exe');
      _gapdProcess = await Process.start(
        gapdPath,
        const <String>[],
        workingDirectory: executableDir,
        mode: ProcessStartMode.detachedWithStdio,
      );

      _gapdProcess!.stdout
          .transform(utf8.decoder)
          .transform(const LineSplitter())
          .listen((line) => _addLog('gapd: $line'));
      _gapdProcess!.stderr
          .transform(utf8.decoder)
          .transform(const LineSplitter())
          .listen((line) => _addLog('gapd error: $line'));

      for (var i = 0; i < 20; i += 1) {
        if (await _isGapdHealthy()) {
          _addLog('gapd is ready');
          return;
        }
        await Future<void>.delayed(const Duration(milliseconds: 250));
      }

      _addLog('gapd did not become ready before timeout');
    } catch (error) {
      _addLog('Failed to start gapd: $error');
    } finally {
      _startingGapd = false;
    }
  }

  void _connect() {
    if (_disposed) return;

    try {
      _channel?.sink.close();
      final channel = WebSocketChannel.connect(Uri.parse('ws://127.0.0.1:3000/ws'));
      _channel = channel;
      setState(() => _connection = 'connecting');

      channel.stream.listen(
        _handleMessage,
        onDone: () {
          if (_disposed) return;
          setState(() => _connection = 'disconnected');
          _scheduleReconnect();
        },
        onError: (Object error) {
          if (_disposed) return;
          setState(() => _connection = 'error');
          _addLog('WebSocket error: $error');
          _scheduleReconnect();
        },
      );
    } catch (error) {
      setState(() => _connection = 'error');
      _addLog('Connect failed: $error');
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    if (_disposed) return;
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(const Duration(seconds: 2), () async {
      if (!await _isGapdHealthy()) {
        await _startBundledGapd();
      }
      _connect();
    });
  }

  void _handleMessage(dynamic raw) {
    final message = jsonDecode(raw as String) as Map<String, dynamic>;
    final type = message['type'] as String? ?? 'unknown';

    setState(() {
      if (type == 'connection_status') {
        _connection = message['status'] as String? ?? 'connected';
      } else if (type == 'git_push_request') {
        _gitRequest = message;
        _logs.insert(0, 'Git approval requested: ${message['branch'] ?? message['id']}');
      } else if (type == 'agent_push_request') {
        _agentRequest = message;
        _logs.insert(0, 'Agent push approval requested: ${message['summary'] ?? message['id']}');
      } else if (type == 'agent_status') {
        _logs.insert(0, 'Agent ${message['status']}: ${message['currentStep'] ?? ''}');
      } else if (type == 'git_push_result' || type == 'agent_push_result') {
        _logs.insert(0, '${message['type']} ${message['decision']}');
      } else if (type == 'error') {
        _logs.insert(0, 'Error: ${message['error']}');
      } else {
        _logs.insert(0, 'Message: $type');
      }

      _trimLogs();
    });
  }

  void _respondGit(String decision) {
    final request = _gitRequest;
    if (request == null) return;
    _channel?.sink.add(jsonEncode({
      'type': 'git_push_response',
      'id': request['id'],
      'decision': decision,
    }));
    setState(() => _gitRequest = null);
  }

  void _respondAgent(String decision) {
    final request = _agentRequest;
    if (request == null) return;
    _channel?.sink.add(jsonEncode({
      'type': 'agent_push_response',
      'id': request['id'],
      'decision': decision,
    }));
    setState(() => _agentRequest = null);
  }

  void _addLog(String line) {
    if (_disposed) return;
    setState(() {
      _logs.insert(0, line);
      _trimLogs();
    });
  }

  void _trimLogs() {
    if (_logs.length > 200) {
      _logs.removeRange(200, _logs.length);
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _reconnectTimer?.cancel();
    _channel?.sink.close();
    _gapdProcess?.kill();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        color: const Color(0xFF080808),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'GAP Overlay',
              style: TextStyle(
                color: Color(0xFF00FF88),
                fontWeight: FontWeight.w800,
                fontFamily: 'monospace',
                fontSize: 22,
              ),
            ),
            const SizedBox(height: 8),
            Text('gapd: $_connection', style: const TextStyle(fontFamily: 'monospace')),
            const SizedBox(height: 16),
            if (_gitRequest != null)
              ApprovalCard(
                title: 'Git push approval',
                subtitle: '${_gitRequest!['branch'] ?? ''}\n${_gitRequest!['repoPath'] ?? ''}',
                approve: () => _respondGit('approve'),
                reject: () => _respondGit('reject'),
              ),
            if (_agentRequest != null)
              ApprovalCard(
                title: 'Agent push approval',
                subtitle: '${_agentRequest!['summary'] ?? ''}\n${_agentRequest!['repoPath'] ?? ''}',
                approve: () => _respondAgent('approve'),
                reject: () => _respondAgent('reject'),
              ),
            const SizedBox(height: 16),
            const Text(
              'Live logs',
              style: TextStyle(color: Color(0xFFA78BFA), fontFamily: 'monospace'),
            ),
            const SizedBox(height: 8),
            Expanded(
              child: ListView.builder(
                itemCount: _logs.length,
                itemBuilder: (context, index) => Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Text(
                    _logs[index],
                    style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

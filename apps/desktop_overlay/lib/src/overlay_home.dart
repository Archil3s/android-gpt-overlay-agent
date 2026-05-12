import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:window_manager/window_manager.dart';

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
  final TextEditingController _chatController = TextEditingController();
  bool _disposed = false;
  bool _startingGapd = false;
  bool _compact = false;
  bool _sendingChat = false;
  String _connection = 'disconnected';
  Map<String, dynamic>? _gitRequest;
  Map<String, dynamic>? _agentRequest;
  final List<String> _logs = <String>[];
  final List<_ChatMessage> _chatMessages = <_ChatMessage>[];

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
    await _openPuterBridge();
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

  Future<void> _openPuterBridge() async {
    try {
      const url = 'http://127.0.0.1:3000/puter-bridge';
      if (Platform.isWindows) {
        await Process.start('cmd', <String>['/c', 'start', '', url], mode: ProcessStartMode.detached);
      } else if (Platform.isMacOS) {
        await Process.start('open', <String>[url], mode: ProcessStartMode.detached);
      } else if (Platform.isLinux) {
        await Process.start('xdg-open', <String>[url], mode: ProcessStartMode.detached);
      }
      _addLog('Opened Puter bridge page');
    } catch (error) {
      _addLog('Could not open Puter bridge automatically: $error');
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
        if (_connection == 'puter_bridge_connected') {
          _addLog('Puter bridge connected');
        }
      } else if (type == 'git_push_request') {
        _gitRequest = message;
        _compact = false;
        _expandWindow();
        _logs.insert(0, 'Git approval requested: ${message['branch'] ?? message['id']}');
      } else if (type == 'agent_push_request') {
        _agentRequest = message;
        _compact = false;
        _expandWindow();
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

  Future<void> _sendChat() async {
    final message = _chatController.text.trim();
    if (message.isEmpty || _sendingChat) return;

    setState(() {
      _sendingChat = true;
      _chatController.clear();
      _chatMessages.insert(0, _ChatMessage(role: 'user', text: message));
    });

    try {
      final client = HttpClient();
      final request = await client.postUrl(Uri.parse('http://127.0.0.1:3000/chat'));
      request.headers.contentType = ContentType.json;
      request.write(jsonEncode(<String, String>{'message': message}));
      final response = await request.close().timeout(const Duration(minutes: 2));
      final body = await response.transform(utf8.decoder).join();
      client.close(force: true);

      final json = jsonDecode(body) as Map<String, dynamic>;
      if (response.statusCode >= 400) {
        throw Exception(json['error'] ?? 'chat failed');
      }

      setState(() {
        _chatMessages.insert(0, _ChatMessage(role: 'assistant', text: json['response'] as String? ?? ''));
      });
    } catch (error) {
      setState(() {
        _chatMessages.insert(0, _ChatMessage(role: 'system', text: 'Chat failed: $error'));
      });
      _addLog('Chat failed: $error');
    } finally {
      if (!_disposed) {
        setState(() => _sendingChat = false);
      }
    }
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

  Future<void> _toggleCompact() async {
    setState(() => _compact = !_compact);
    if (_compact) {
      await windowManager.setSize(const Size(260, 92));
    } else {
      await _expandWindow();
    }
  }

  Future<void> _expandWindow() async {
    await windowManager.setSize(const Size(460, 620));
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
    _chatController.dispose();
    _channel?.sink.close();
    _gapdProcess?.kill();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: GestureDetector(
        onPanStart: (_) => windowManager.startDragging(),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          decoration: BoxDecoration(
            color: const Color(0xFF080808),
            border: Border.all(color: const Color(0xFF00FF88), width: 1.2),
            borderRadius: BorderRadius.circular(_compact ? 46 : 18),
            boxShadow: const [
              BoxShadow(color: Colors.black54, blurRadius: 18, offset: Offset(0, 8)),
            ],
          ),
          margin: const EdgeInsets.all(8),
          padding: EdgeInsets.all(_compact ? 12 : 16),
          child: _compact ? _buildCompact() : _buildExpanded(),
        ),
      ),
    );
  }

  Widget _buildCompact() {
    final pending = _gitRequest != null || _agentRequest != null;
    return Row(
      children: [
        Container(
          width: 44,
          height: 44,
          decoration: const BoxDecoration(
            color: Color(0xFF00FF88),
            shape: BoxShape.circle,
          ),
          alignment: Alignment.center,
          child: const Text(
            'AI',
            style: TextStyle(color: Color(0xFF00180C), fontWeight: FontWeight.w900),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            pending ? 'Approval pending' : 'gapd: $_connection',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontFamily: 'monospace'),
          ),
        ),
        IconButton(
          tooltip: 'Expand',
          onPressed: _toggleCompact,
          icon: const Icon(Icons.open_in_full, size: 18),
        ),
      ],
    );
  }

  Widget _buildExpanded() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Expanded(
              child: Text(
                'GAP Overlay',
                style: TextStyle(
                  color: Color(0xFF00FF88),
                  fontWeight: FontWeight.w800,
                  fontFamily: 'monospace',
                  fontSize: 22,
                ),
              ),
            ),
            IconButton(
              tooltip: 'Open Puter bridge',
              onPressed: _openPuterBridge,
              icon: const Icon(Icons.link, size: 18),
            ),
            IconButton(
              tooltip: 'Compact',
              onPressed: _toggleCompact,
              icon: const Icon(Icons.bubble_chart, size: 18),
            ),
            IconButton(
              tooltip: 'Minimize',
              onPressed: () => windowManager.minimize(),
              icon: const Icon(Icons.remove, size: 18),
            ),
            IconButton(
              tooltip: 'Close',
              onPressed: () => windowManager.close(),
              icon: const Icon(Icons.close, size: 18),
            ),
          ],
        ),
        Text('gapd: $_connection', style: const TextStyle(fontFamily: 'monospace')),
        const SizedBox(height: 12),
        _buildChat(),
        const SizedBox(height: 12),
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
        const SizedBox(height: 12),
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
    );
  }

  Widget _buildChat() {
    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: const Color(0xFFA78BFA)),
        borderRadius: BorderRadius.circular(12),
        color: const Color(0xFF101010),
      ),
      padding: const EdgeInsets.all(10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('GPT Chat', style: TextStyle(color: Color(0xFFA78BFA), fontFamily: 'monospace')),
          const SizedBox(height: 8),
          SizedBox(
            height: 120,
            child: ListView.builder(
              reverse: true,
              itemCount: _chatMessages.length,
              itemBuilder: (context, index) {
                final item = _chatMessages[index];
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(
                    '${item.role}: ${item.text}',
                    style: TextStyle(
                      color: item.role == 'user' ? const Color(0xFF00FF88) : Colors.white,
                      fontFamily: 'monospace',
                      fontSize: 12,
                    ),
                  ),
                );
              },
            ),
          ),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _chatController,
                  minLines: 1,
                  maxLines: 3,
                  style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
                  decoration: const InputDecoration(
                    hintText: 'Ask GPT...',
                    isDense: true,
                    border: OutlineInputBorder(),
                  ),
                  onSubmitted: (_) => _sendChat(),
                ),
              ),
              const SizedBox(width: 8),
              FilledButton(
                onPressed: _sendingChat ? null : _sendChat,
                child: Text(_sendingChat ? '...' : 'SEND'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ChatMessage {
  const _ChatMessage({required this.role, required this.text});

  final String role;
  final String text;
}

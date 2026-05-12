import 'dart:convert';

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
  String _connection = 'disconnected';
  Map<String, dynamic>? _gitRequest;
  Map<String, dynamic>? _agentRequest;
  final List<String> _logs = <String>[];

  @override
  void initState() {
    super.initState();
    _connect();
  }

  void _connect() {
    try {
      final channel = WebSocketChannel.connect(Uri.parse('ws://127.0.0.1:3000/ws'));
      _channel = channel;
      setState(() => _connection = 'connecting');

      channel.stream.listen(
        _handleMessage,
        onDone: () => setState(() => _connection = 'disconnected'),
        onError: (Object error) => setState(() {
          _connection = 'error';
          _logs.insert(0, 'WebSocket error: $error');
        }),
      );
    } catch (error) {
      setState(() {
        _connection = 'error';
        _logs.insert(0, 'Connect failed: $error');
      });
    }
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

      if (_logs.length > 200) {
        _logs.removeRange(200, _logs.length);
      }
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

  @override
  void dispose() {
    _channel?.sink.close();
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

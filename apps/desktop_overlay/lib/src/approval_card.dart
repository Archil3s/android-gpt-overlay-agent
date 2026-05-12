import 'package:flutter/material.dart';

class ApprovalCard extends StatelessWidget {
  const ApprovalCard({
    super.key,
    required this.title,
    required this.subtitle,
    required this.approve,
    required this.reject,
  });

  final String title;
  final String subtitle;
  final VoidCallback approve;
  final VoidCallback reject;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF141414),
        border: Border.all(color: const Color(0xFFFFB800)),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              color: Color(0xFFFFB800),
              fontFamily: 'monospace',
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            subtitle,
            style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: FilledButton(
                  style: FilledButton.styleFrom(backgroundColor: const Color(0xFFFF6B6B)),
                  onPressed: reject,
                  child: const Text('REJECT'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: FilledButton(
                  style: FilledButton.styleFrom(backgroundColor: const Color(0xFF00FF88)),
                  onPressed: approve,
                  child: const Text(
                    'APPROVE',
                    style: TextStyle(color: Color(0xFF00180C)),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

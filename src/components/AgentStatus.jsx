import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

const COLORS = {
  bg: "#080808",
  accent: "#00FF88",
  reject: "#FF6B6B",
  pending: "#FFB800",
  agent: "#A78BFA",
  text: "#F5F5F5",
  muted: "#9CA3AF",
  card: "#141414"
};

export default function AgentStatus({
  status,
  visible,
  onClose,
  onApprovePush,
  onRejectPush
}) {
  if (!status) return null;

  const ready = status.status === "ready_to_push";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.panel}>
          <View style={styles.header}>
            <Text style={styles.title}>Agent Status</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.close}>CLOSE</Text>
            </Pressable>
          </View>

          <Text style={[styles.status, ready && styles.ready]}>{status.status}</Text>
          <Text style={styles.label}>Goal</Text>
          <Text style={styles.text}>{status.goal || "No goal supplied"}</Text>
          <Text style={styles.label}>Repo</Text>
          <Text style={styles.text}>{status.repoPath || "Unknown repo"}</Text>
          <Text style={styles.label}>Current step</Text>
          <Text style={styles.text}>{status.currentStep || "Idle"}</Text>

          <Text style={styles.label}>Logs</Text>
          <ScrollView style={styles.logs}>
            {(status.logs || []).slice(-80).map((line, index) => (
              <Text key={`log_${index}`} style={styles.logLine}>
                {line}
              </Text>
            ))}
          </ScrollView>

          {ready && (
            <View style={styles.actions}>
              <Pressable style={[styles.button, styles.reject]} onPress={() => onRejectPush?.(status.id)}>
                <Text style={styles.rejectText}>REJECT</Text>
              </Pressable>
              <Pressable style={[styles.button, styles.approve]} onPress={() => onApprovePush?.(status.id)}>
                <Text style={styles.approveText}>APPROVE PUSH</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  panel: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderColor: COLORS.agent,
    borderWidth: 1,
    padding: 16,
    maxHeight: "86%"
  },
  header: { flexDirection: "row", justifyContent: "space-between" },
  title: { color: COLORS.agent, fontSize: 18, fontFamily: "JetBrains Mono" },
  close: { color: COLORS.muted, fontFamily: "JetBrains Mono" },
  status: { color: COLORS.pending, fontFamily: "JetBrains Mono", marginTop: 12, fontSize: 16 },
  ready: { color: COLORS.accent },
  label: { color: COLORS.muted, fontFamily: "JetBrains Mono", marginTop: 12, fontSize: 12 },
  text: { color: COLORS.text, fontFamily: "JetBrains Mono", marginTop: 4 },
  logs: { backgroundColor: COLORS.card, borderRadius: 12, padding: 10, marginTop: 6, maxHeight: 260 },
  logLine: { color: COLORS.text, fontFamily: "JetBrains Mono", fontSize: 12, marginBottom: 4 },
  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  button: { flex: 1, borderRadius: 12, padding: 14, alignItems: "center" },
  reject: { backgroundColor: COLORS.reject },
  approve: { backgroundColor: COLORS.accent },
  rejectText: { color: "#2B0000", fontFamily: "JetBrains Mono", fontWeight: "700" },
  approveText: { color: "#00180C", fontFamily: "JetBrains Mono", fontWeight: "700" }
});

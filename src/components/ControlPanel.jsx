import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../config";

export default function ControlPanel({
  connectionStatus,
  overlayStatus,
  overlayMessage,
  gitState,
  agentState,
  onOpenAgent,
  onOpenGit,
  onStartOverlay,
  onStopOverlay,
  onRequestPermission,
  onRefreshOverlay
}) {
  const pendingGitCount = gitState.pendingRequests.length;
  const agentStatus = agentState.current?.status || "idle";

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Android GPT Overlay Agent</Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Runtime</Text>
        <StatusRow label="WebSocket" value={connectionStatus} />
        <StatusRow label="Overlay" value={overlayStatus} />
        {!!overlayMessage && <Text style={styles.muted}>{overlayMessage}</Text>}

        <View style={styles.actionRow}>
          <Button label="START" onPress={onStartOverlay} tone="approve" />
          <Button label="PERMISSION" onPress={onRequestPermission} tone="pending" />
          <Button label="STOP" onPress={onStopOverlay} tone="reject" />
        </View>
        <Pressable style={styles.outlineButton} onPress={onRefreshOverlay}>
          <Text style={styles.outlineText}>REFRESH OVERLAY</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Git approvals</Text>
        <StatusRow label="Pending" value={String(pendingGitCount)} />
        <StatusRow label="History" value={String(gitState.history.length)} />
        <Pressable style={styles.outlineButton} onPress={onOpenGit} disabled={!gitState.activeRequest}>
          <Text style={styles.outlineText}>OPEN ACTIVE GIT REQUEST</Text>
        </Pressable>
        {gitState.history.slice(0, 4).map(item => (
          <Text key={`${item.id}_${item.event}_${item.resolvedAt || item.timestamp}`} style={styles.logLine}>
            {item.event}: {item.branch || item.id}
          </Text>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Agent</Text>
        <StatusRow label="Status" value={agentStatus} />
        <StatusRow label="Logs" value={String(agentState.logs.length)} />
        <Pressable style={styles.outlineButton} onPress={onOpenAgent} disabled={!agentState.current}>
          <Text style={styles.outlineText}>OPEN AGENT STATUS</Text>
        </Pressable>
        {agentState.logs.slice(-6).map((line, index) => (
          <Text key={`agent_log_${index}`} style={styles.logLine} numberOfLines={2}>
            {line}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

function StatusRow({ label, value }) {
  return (
    <View style={styles.statusRow}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function Button({ label, onPress, tone }) {
  const style = tone === "approve" ? styles.approve : tone === "reject" ? styles.reject : styles.pending;
  const textStyle = tone === "reject" ? styles.rejectText : styles.darkText;

  return (
    <Pressable style={[styles.button, style]} onPress={onPress}>
      <Text style={textStyle}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  content: { padding: 20, paddingBottom: 120 },
  title: {
    color: COLORS.accent,
    fontFamily: "JetBrains Mono",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 14
  },
  card: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.accent,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14
  },
  sectionTitle: {
    color: COLORS.accent,
    fontFamily: "JetBrains Mono",
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 8
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 7
  },
  label: { color: COLORS.muted, fontFamily: "JetBrains Mono" },
  value: { color: COLORS.text, fontFamily: "JetBrains Mono", flexShrink: 1, textAlign: "right" },
  muted: { color: COLORS.muted, fontFamily: "JetBrains Mono", marginTop: 10 },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  button: { flex: 1, borderRadius: 12, padding: 12, alignItems: "center" },
  approve: { backgroundColor: COLORS.accent },
  pending: { backgroundColor: COLORS.pending },
  reject: { backgroundColor: COLORS.reject },
  darkText: { color: "#00180C", fontFamily: "JetBrains Mono", fontSize: 11, fontWeight: "800" },
  rejectText: { color: "#2B0000", fontFamily: "JetBrains Mono", fontSize: 11, fontWeight: "800" },
  outlineButton: {
    borderColor: COLORS.agent,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    marginTop: 12
  },
  outlineText: { color: COLORS.agent, fontFamily: "JetBrains Mono", fontSize: 11, fontWeight: "800" },
  logLine: {
    color: COLORS.text,
    fontFamily: "JetBrains Mono",
    fontSize: 11,
    marginTop: 8
  }
});

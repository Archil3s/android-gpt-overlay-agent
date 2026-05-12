import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

const COLORS = {
  bg: "#080808",
  accent: "#00FF88",
  reject: "#FF6B6B",
  pending: "#FFB800",
  text: "#F5F5F5",
  muted: "#9CA3AF",
  card: "#141414"
};

export default function GitConfirm({ request, visible, onApprove, onReject, onClose }) {
  if (!request) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.kicker}>GIT PUSH REQUEST</Text>
          <Text style={styles.title}>{request.branch || "Unknown branch"}</Text>
          <Text style={styles.meta}>{request.repoPath || "Unknown repo"}</Text>
          <Text style={styles.meta}>{request.timestamp || ""}</Text>

          <ScrollView style={styles.details}>
            <Section title="Files changed" items={request.filesChanged} />
            <Section title="Commits" items={request.commits} />
          </ScrollView>

          <View style={styles.actions}>
            <Pressable style={[styles.button, styles.reject]} onPress={() => onReject(request.id)}>
              <Text style={styles.rejectText}>REJECT</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.approve]} onPress={() => onApprove(request.id)}>
              <Text style={styles.approveText}>APPROVE</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Section({ title, items = [] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {items.length ? (
        items.map((item, index) => (
          <Text key={`${title}_${index}`} style={styles.item}>
            - {item}
          </Text>
        ))
      ) : (
        <Text style={styles.empty}>None reported</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "center", padding: 16 },
  card: {
    backgroundColor: COLORS.bg,
    borderColor: COLORS.pending,
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    maxHeight: "86%"
  },
  kicker: { color: COLORS.pending, fontFamily: "JetBrains Mono", fontSize: 12 },
  title: { color: COLORS.text, fontFamily: "JetBrains Mono", fontSize: 20, marginTop: 8 },
  meta: { color: COLORS.muted, fontFamily: "JetBrains Mono", marginTop: 4 },
  details: { marginTop: 14 },
  section: { backgroundColor: COLORS.card, borderRadius: 12, padding: 12, marginBottom: 10 },
  sectionTitle: { color: COLORS.accent, fontFamily: "JetBrains Mono", marginBottom: 8 },
  item: { color: COLORS.text, fontFamily: "JetBrains Mono", marginBottom: 5 },
  empty: { color: COLORS.muted, fontFamily: "JetBrains Mono" },
  actions: { flexDirection: "row", gap: 10, marginTop: 12 },
  button: { flex: 1, padding: 14, borderRadius: 12, alignItems: "center" },
  reject: { backgroundColor: COLORS.reject },
  approve: { backgroundColor: COLORS.accent },
  rejectText: { color: "#2B0000", fontFamily: "JetBrains Mono", fontWeight: "700" },
  approveText: { color: "#00180C", fontFamily: "JetBrains Mono", fontWeight: "700" }
});

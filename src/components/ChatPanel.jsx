import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import Markdown from "react-native-markdown-display";
import { sendChatMessage } from "../services/puter";

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

export default function ChatPanel({ visible, onClose }) {
  const scrollRef = useRef(null);
  const [messages, setMessages] = useState([
    { role: "system", content: "Floating GPT assistant ready." }
  ]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    setInput("");
    setError("");

    const userMessage = { role: "user", content: trimmed };
    const assistantMessage = { role: "assistant", content: "" };
    const nextMessages = [...messages, userMessage, assistantMessage];

    setMessages(nextMessages);
    setIsSending(true);

    try {
      let streamed = "";
      const response = await sendChatMessage(trimmed, messages, token => {
        streamed += token;
        setMessages(current => replaceLastAssistant(current, streamed));
      });

      setMessages(current => replaceLastAssistant(current, response));
    } catch (err) {
      setError(err?.message || "Chat request failed");
      setMessages(current => replaceLastAssistant(current, "Request failed."));
    } finally {
      setIsSending(false);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd?.({ animated: true }));
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.panel}>
          <View style={styles.header}>
            <Text style={styles.title}>GPT Overlay</Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>CLOSE</Text>
            </Pressable>
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.thread}
            contentContainerStyle={styles.threadContent}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd?.({ animated: true })}
          >
            {messages.filter(m => m.role !== "system").map((message, index) => (
              <View
                key={`${message.role}_${index}`}
                style={[
                  styles.message,
                  message.role === "user" ? styles.userMessage : styles.assistantMessage
                ]}
              >
                <Text style={styles.role}>{message.role}</Text>
                <Markdown
                  style={markdownStyles}
                  rules={{
                    fence: node => (
                      <View key={node.key} style={styles.codeBlock}>
                        <View style={styles.codeHeader}>
                          <Text style={styles.codeLabel}>{node.sourceInfo || "code"}</Text>
                          <Pressable onPress={() => Clipboard.setString(node.content)}>
                            <Text style={styles.copyText}>COPY</Text>
                          </Pressable>
                        </View>
                        <Text style={styles.codeText}>{node.content}</Text>
                      </View>
                    )
                  }}
                >
                  {message.content || " "}
                </Markdown>
              </View>
            ))}
            {isSending && <ActivityIndicator color={COLORS.accent} />}
            {!!error && <Text style={styles.error}>{error}</Text>}
          </ScrollView>

          <View style={styles.inputRow}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask GPT..."
              placeholderTextColor={COLORS.muted}
              style={styles.input}
              multiline
            />
            <Pressable onPress={handleSend} style={styles.sendButton}>
              <Text style={styles.sendText}>SEND</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function replaceLastAssistant(messages, content) {
  const next = [...messages];
  for (let i = next.length - 1; i >= 0; i -= 1) {
    if (next[i].role === "assistant") {
      next[i] = { ...next[i], content };
      break;
    }
  }
  return next;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  panel: {
    maxHeight: "82%",
    minHeight: "55%",
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    borderColor: COLORS.accent,
    borderWidth: 1
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: COLORS.accent, fontSize: 18, fontFamily: "JetBrains Mono" },
  closeButton: { padding: 8 },
  closeText: { color: COLORS.muted, fontFamily: "JetBrains Mono" },
  thread: { flex: 1, marginTop: 12 },
  threadContent: { paddingBottom: 12 },
  message: { borderRadius: 14, padding: 12, marginBottom: 10 },
  userMessage: { backgroundColor: "#10251B", alignSelf: "flex-end", maxWidth: "90%" },
  assistantMessage: { backgroundColor: COLORS.card, alignSelf: "flex-start", maxWidth: "96%" },
  role: { color: COLORS.muted, fontSize: 11, marginBottom: 4, fontFamily: "JetBrains Mono" },
  error: { color: COLORS.reject, fontFamily: "JetBrains Mono", marginTop: 8 },
  inputRow: { flexDirection: "row", gap: 8, alignItems: "flex-end" },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    color: COLORS.text,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 12,
    fontFamily: "JetBrains Mono"
  },
  sendButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12
  },
  sendText: { color: "#00180C", fontWeight: "700", fontFamily: "JetBrains Mono" },
  codeBlock: { backgroundColor: "#050505", borderRadius: 10, marginVertical: 8, overflow: "hidden" },
  codeHeader: { flexDirection: "row", justifyContent: "space-between", padding: 8 },
  codeLabel: { color: COLORS.agent, fontSize: 11, fontFamily: "JetBrains Mono" },
  copyText: { color: COLORS.accent, fontSize: 11, fontFamily: "JetBrains Mono" },
  codeText: { color: COLORS.text, padding: 10, fontFamily: "JetBrains Mono" }
});

const markdownStyles = {
  body: { color: COLORS.text, fontFamily: "JetBrains Mono" },
  code_inline: { backgroundColor: "#050505", color: COLORS.pending, fontFamily: "JetBrains Mono" },
  link: { color: COLORS.accent }
};

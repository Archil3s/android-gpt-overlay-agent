import React, { useEffect, useMemo, useState } from "react";
import { SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";
import AgentStatus from "./src/components/AgentStatus";
import Bubble from "./src/components/Bubble";
import ChatPanel from "./src/components/ChatPanel";
import GitConfirm from "./src/components/GitConfirm";
import PuterBridge from "./src/components/PuterBridge";
import { APP_CONFIG, COLORS } from "./src/config";
import {
  approveAgentPush,
  approveGitPush,
  connectWebSocket,
  rejectAgentPush,
  rejectGitPush,
  subscribe
} from "./src/services/websocket";
import {
  initializeNotifications,
  notifyAgentApprovalRequired,
  notifyAgentStatus,
  notifyGitPushRequest
} from "./src/services/notifications";

export default function App() {
  const [chatVisible, setChatVisible] = useState(false);
  const [gitRequest, setGitRequest] = useState(null);
  const [agentStatus, setAgentStatus] = useState(null);
  const [agentVisible, setAgentVisible] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [lastError, setLastError] = useState("");

  useEffect(() => {
    initializeNotifications().catch(error => {
      setLastError(error?.message || "Notifications unavailable");
    });

    connectWebSocket(APP_CONFIG.websocketUrl);

    const unsubscribe = subscribe(message => {
      if (message.type === "connection_status") {
        setConnectionStatus(message.status);
        return;
      }

      if (message.type === "git_push_request") {
        setGitRequest(message);
        notifyGitPushRequest(message).catch(() => {});
        return;
      }

      if (message.type === "agent_status") {
        setAgentStatus(message);
        notifyAgentStatus(message).catch(() => {});
        return;
      }

      if (message.type === "agent_push_request") {
        const nextStatus = {
          ...message,
          status: "ready_to_push",
          currentStep: "Agent is requesting approval before push",
          logs: message.logs || []
        };
        setAgentStatus(nextStatus);
        setAgentVisible(true);
        notifyAgentApprovalRequired(message).catch(() => {});
        return;
      }

      if (message.type === "error") {
        setLastError(message.error || "Unknown WebSocket error");
      }
    });

    return unsubscribe;
  }, []);

  const pendingGitCount = gitRequest ? 1 : 0;
  const agentActive = useMemo(() => {
    return Boolean(agentStatus && !["idle", "done", "failed"].includes(agentStatus.status));
  }, [agentStatus]);

  function handleApproveGit(requestId) {
    approveGitPush(requestId);
    setGitRequest(null);
  }

  function handleRejectGit(requestId) {
    rejectGitPush(requestId);
    setGitRequest(null);
  }

  function handleApproveAgent(requestId) {
    approveAgentPush(requestId);
    setAgentVisible(false);
  }

  function handleRejectAgent(requestId) {
    rejectAgentPush(requestId);
    setAgentVisible(false);
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <PuterBridge />

      <View style={styles.centerCard}>
        <Text style={styles.title}>{APP_CONFIG.appName}</Text>
        <Text style={styles.subtitle}>Connection: {connectionStatus}</Text>
        <Text style={styles.subtitle}>Laptop server: {APP_CONFIG.websocketUrl}</Text>
        {!!lastError && <Text style={styles.error}>{lastError}</Text>}
        <Text style={styles.hint}>Tap the floating bubble to open chat.</Text>
      </View>

      <Bubble
        onPress={() => setChatVisible(true)}
        pendingGitCount={pendingGitCount}
        agentActive={agentActive}
      />

      <ChatPanel visible={chatVisible} onClose={() => setChatVisible(false)} />

      <GitConfirm
        visible={Boolean(gitRequest)}
        request={gitRequest}
        onApprove={handleApproveGit}
        onReject={handleRejectGit}
        onClose={() => setGitRequest(null)}
      />

      <AgentStatus
        visible={agentVisible}
        status={agentStatus}
        onClose={() => setAgentVisible(false)}
        onApprovePush={handleApproveAgent}
        onRejectPush={handleRejectAgent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background
  },
  centerCard: {
    margin: 20,
    padding: 18,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    borderColor: COLORS.accent,
    borderWidth: 1
  },
  title: {
    color: COLORS.accent,
    fontFamily: "JetBrains Mono",
    fontSize: 18,
    fontWeight: "700"
  },
  subtitle: {
    color: COLORS.text,
    fontFamily: "JetBrains Mono",
    marginTop: 8
  },
  hint: {
    color: COLORS.muted,
    fontFamily: "JetBrains Mono",
    marginTop: 16
  },
  error: {
    color: COLORS.reject,
    fontFamily: "JetBrains Mono",
    marginTop: 12
  }
});

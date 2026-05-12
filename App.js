import React, { useEffect, useMemo, useState } from "react";
import { Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";
import AgentStatus from "./src/components/AgentStatus";
import Bubble from "./src/components/Bubble";
import ChatPanel from "./src/components/ChatPanel";
import GitConfirm from "./src/components/GitConfirm";
import PuterBridge from "./src/components/PuterBridge";
import { APP_CONFIG, COLORS } from "./src/config";
import {
  hasOverlayPermission,
  isOverlaySupported,
  requestOverlayPermission,
  startOverlayService,
  stopOverlayService
} from "./src/services/overlay";
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
  const [overlayStatus, setOverlayStatus] = useState("checking");
  const [overlayMessage, setOverlayMessage] = useState("");
  const [lastError, setLastError] = useState("");

  useEffect(() => {
    initializeNotifications().catch(error => {
      setLastError(error?.message || "Notifications unavailable");
    });

    refreshOverlayPermission();
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

  async function refreshOverlayPermission() {
    try {
      if (!isOverlaySupported()) {
        setOverlayStatus("unsupported");
        setOverlayMessage("Overlay is only available in the Android native build.");
        return;
      }

      const granted = await hasOverlayPermission();
      setOverlayStatus(granted ? "permission-granted" : "permission-required");
      setOverlayMessage(granted ? "Overlay permission granted." : "Overlay permission required.");
    } catch (error) {
      setOverlayStatus("error");
      setOverlayMessage(error?.message || "Unable to check overlay permission.");
    }
  }

  async function handleStartOverlay() {
    try {
      const result = await startOverlayService();
      setOverlayStatus(result.started ? "running" : "permission-required");
      setOverlayMessage(result.message);
    } catch (error) {
      setOverlayStatus("error");
      setOverlayMessage(error?.message || "Unable to start overlay.");
    }
  }

  function handleRequestOverlayPermission() {
    try {
      requestOverlayPermission();
      setOverlayMessage("Android overlay settings opened. Return here after granting permission.");
    } catch (error) {
      setOverlayStatus("error");
      setOverlayMessage(error?.message || "Unable to open overlay settings.");
    }
  }

  function handleStopOverlay() {
    try {
      const result = stopOverlayService();
      setOverlayStatus("stopped");
      setOverlayMessage(result.message);
    } catch (error) {
      setOverlayStatus("error");
      setOverlayMessage(error?.message || "Unable to stop overlay.");
    }
  }

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
        <Text style={styles.subtitle}>Overlay: {overlayStatus}</Text>
        {!!overlayMessage && <Text style={styles.hint}>{overlayMessage}</Text>}
        {!!lastError && <Text style={styles.error}>{lastError}</Text>}

        <View style={styles.actions}>
          <Pressable style={styles.actionButton} onPress={handleStartOverlay}>
            <Text style={styles.actionText}>START OVERLAY</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={handleRequestOverlayPermission}>
            <Text style={styles.secondaryText}>PERMISSION</Text>
          </Pressable>
          <Pressable style={styles.stopButton} onPress={handleStopOverlay}>
            <Text style={styles.stopText}>STOP</Text>
          </Pressable>
        </View>

        <Pressable style={styles.refreshButton} onPress={refreshOverlayPermission}>
          <Text style={styles.refreshText}>REFRESH OVERLAY STATUS</Text>
        </Pressable>

        <Text style={styles.hint}>Tap the in-app bubble to open chat. Use Start Overlay for the system-level bubble.</Text>
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
    marginTop: 12
  },
  error: {
    color: COLORS.reject,
    fontFamily: "JetBrains Mono",
    marginTop: 12
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16
  },
  actionButton: {
    flex: 1,
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    padding: 12,
    alignItems: "center"
  },
  actionText: {
    color: "#00180C",
    fontFamily: "JetBrains Mono",
    fontWeight: "800",
    fontSize: 11
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: COLORS.pending,
    borderRadius: 12,
    padding: 12,
    alignItems: "center"
  },
  secondaryText: {
    color: "#221700",
    fontFamily: "JetBrains Mono",
    fontWeight: "800",
    fontSize: 11
  },
  stopButton: {
    flex: 1,
    backgroundColor: COLORS.reject,
    borderRadius: 12,
    padding: 12,
    alignItems: "center"
  },
  stopText: {
    color: "#2B0000",
    fontFamily: "JetBrains Mono",
    fontWeight: "800",
    fontSize: 11
  },
  refreshButton: {
    borderColor: COLORS.agent,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    marginTop: 10
  },
  refreshText: {
    color: COLORS.agent,
    fontFamily: "JetBrains Mono",
    fontWeight: "800",
    fontSize: 11
  }
});

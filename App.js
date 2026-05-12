import React, { useEffect, useMemo, useState } from "react";
import { SafeAreaView, StatusBar, StyleSheet } from "react-native";
import AgentStatus from "./src/components/AgentStatus";
import Bubble from "./src/components/Bubble";
import ChatPanel from "./src/components/ChatPanel";
import ControlPanel from "./src/components/ControlPanel";
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
import {
  getAgentState,
  ingestAgentPushRequest,
  ingestAgentStatus,
  resolveAgentApproval,
  subscribeAgentStore
} from "./src/state/agentStore";
import {
  getGitState,
  ingestGitRequest,
  ingestGitResult,
  resolveGitRequest,
  subscribeGitStore
} from "./src/state/gitStore";

export default function App() {
  const [chatVisible, setChatVisible] = useState(false);
  const [agentVisible, setAgentVisible] = useState(false);
  const [gitVisible, setGitVisible] = useState(false);
  const [gitState, setGitState] = useState(getGitState());
  const [agentState, setAgentState] = useState(getAgentState());
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [overlayStatus, setOverlayStatus] = useState("checking");
  const [overlayMessage, setOverlayMessage] = useState("");
  const [lastError, setLastError] = useState("");

  useEffect(() => {
    const unGit = subscribeGitStore(setGitState);
    const unAgent = subscribeAgentStore(setAgentState);
    return () => {
      unGit();
      unAgent();
    };
  }, []);

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
        ingestGitRequest(message);
        setGitVisible(true);
        notifyGitPushRequest(message).catch(() => {});
        return;
      }

      if (message.type === "git_push_result") {
        ingestGitResult(message);
        return;
      }

      if (message.type === "agent_status") {
        ingestAgentStatus(message);
        notifyAgentStatus(message).catch(() => {});
        return;
      }

      if (message.type === "agent_push_request") {
        ingestAgentPushRequest(message);
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

  const pendingGitCount = gitState.pendingRequests.length;
  const activeGitRequest = gitState.activeRequest;
  const activeAgentStatus = agentState.approvalRequest || agentState.current;
  const agentActive = useMemo(() => {
    return Boolean(agentState.current && !["idle", "done", "failed"].includes(agentState.current.status));
  }, [agentState]);

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
    resolveGitRequest(requestId, "approved");
    setGitVisible(false);
  }

  function handleRejectGit(requestId) {
    rejectGitPush(requestId);
    resolveGitRequest(requestId, "rejected");
    setGitVisible(false);
  }

  function handleApproveAgent(requestId) {
    approveAgentPush(requestId);
    resolveAgentApproval(requestId, "approved");
    setAgentVisible(false);
  }

  function handleRejectAgent(requestId) {
    rejectAgentPush(requestId);
    resolveAgentApproval(requestId, "rejected");
    setAgentVisible(false);
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <PuterBridge />

      <ControlPanel
        connectionStatus={connectionStatus}
        overlayStatus={overlayStatus}
        overlayMessage={overlayMessage || lastError}
        gitState={gitState}
        agentState={agentState}
        onOpenAgent={() => setAgentVisible(true)}
        onOpenGit={() => setGitVisible(true)}
        onStartOverlay={handleStartOverlay}
        onStopOverlay={handleStopOverlay}
        onRequestPermission={handleRequestOverlayPermission}
        onRefreshOverlay={refreshOverlayPermission}
      />

      <Bubble
        onPress={() => setChatVisible(true)}
        pendingGitCount={pendingGitCount}
        agentActive={agentActive}
      />

      <ChatPanel visible={chatVisible} onClose={() => setChatVisible(false)} />

      <GitConfirm
        visible={gitVisible && Boolean(activeGitRequest)}
        request={activeGitRequest}
        onApprove={handleApproveGit}
        onReject={handleRejectGit}
        onClose={() => setGitVisible(false)}
      />

      <AgentStatus
        visible={agentVisible && Boolean(activeAgentStatus)}
        status={activeAgentStatus}
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
  }
});

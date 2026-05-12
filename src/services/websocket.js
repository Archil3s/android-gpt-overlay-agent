let socket = null;
let url = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
const listeners = new Set();

export function connectWebSocket(nextUrl) {
  url = nextUrl;
  cleanupSocket();

  socket = new WebSocket(url);

  socket.onopen = () => {
    reconnectAttempts = 0;
    emit({ type: "connection_status", status: "connected" });
  };

  socket.onmessage = event => {
    try {
      emit(JSON.parse(event.data));
    } catch {
      emit({ type: "error", error: "Invalid WebSocket JSON message" });
    }
  };

  socket.onerror = () => {
    emit({ type: "connection_status", status: "error" });
  };

  socket.onclose = () => {
    emit({ type: "connection_status", status: "disconnected" });
    scheduleReconnect();
  };
}

export function disconnectWebSocket() {
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
  url = null;
  cleanupSocket();
}

export function sendMessage(message) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    emit({ type: "error", error: "WebSocket is not connected" });
    return false;
  }

  socket.send(JSON.stringify(message));
  return true;
}

export function approveGitPush(requestId) {
  return sendMessage({ type: "git_push_response", id: requestId, decision: "approve" });
}

export function rejectGitPush(requestId) {
  return sendMessage({ type: "git_push_response", id: requestId, decision: "reject" });
}

export function approveAgentPush(requestId) {
  return sendMessage({ type: "agent_push_response", id: requestId, decision: "approve" });
}

export function rejectAgentPush(requestId) {
  return sendMessage({ type: "agent_push_response", id: requestId, decision: "reject" });
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => unsubscribe(listener);
}

export function unsubscribe(listener) {
  listeners.delete(listener);
}

function emit(message) {
  listeners.forEach(listener => listener(message));
}

function scheduleReconnect() {
  if (!url) return;

  const delay = Math.min(30000, 1000 * 2 ** reconnectAttempts);
  reconnectAttempts += 1;

  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => connectWebSocket(url), delay);
}

function cleanupSocket() {
  if (!socket) return;

  socket.onopen = null;
  socket.onmessage = null;
  socket.onerror = null;
  socket.onclose = null;

  try {
    socket.close();
  } catch {
    // noop
  }

  socket = null;
}

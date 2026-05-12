const listeners = new Set();

let state = {
  current: null,
  logs: [],
  history: [],
  approvalRequest: null
};

export function getAgentState() {
  return state;
}

export function subscribeAgentStore(listener) {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function ingestAgentStatus(status) {
  const logs = mergeLogs(state.logs, status.logs || []);
  const next = { ...status, logs };

  state = {
    ...state,
    current: next,
    logs,
    history: prepend({ ...next, event: "status" }, state.history)
  };
  emit();
}

export function ingestAgentPushRequest(request) {
  const logs = mergeLogs(state.logs, request.logs || []);
  const next = {
    ...request,
    status: "ready_to_push",
    currentStep: request.currentStep || "Agent is requesting approval before push",
    logs
  };

  state = {
    ...state,
    current: next,
    approvalRequest: next,
    logs,
    history: prepend({ ...next, event: "approval_requested" }, state.history)
  };
  emit();
}

export function resolveAgentApproval(requestId, decision) {
  state = {
    ...state,
    approvalRequest: state.approvalRequest?.id === requestId ? null : state.approvalRequest,
    history: prepend(
      {
        id: requestId,
        event: decision,
        decision,
        resolvedAt: new Date().toISOString()
      },
      state.history
    )
  };
  emit();
}

function mergeLogs(existing, incoming) {
  return [...existing, ...incoming].slice(-200);
}

function prepend(item, items) {
  return [item, ...items].slice(0, 50);
}

function emit() {
  listeners.forEach(listener => listener(state));
}

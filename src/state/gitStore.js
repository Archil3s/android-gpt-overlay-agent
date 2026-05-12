const listeners = new Set();

let state = {
  pendingRequests: [],
  history: [],
  activeRequest: null
};

export function getGitState() {
  return state;
}

export function subscribeGitStore(listener) {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function ingestGitRequest(request) {
  state = {
    ...state,
    activeRequest: request,
    pendingRequests: upsertById(state.pendingRequests, request),
    history: prepend({ ...request, event: "received" }, state.history)
  };
  emit();
}

export function resolveGitRequest(requestId, decision) {
  const request = state.pendingRequests.find(item => item.id === requestId) || state.activeRequest;

  state = {
    ...state,
    activeRequest: state.activeRequest?.id === requestId ? null : state.activeRequest,
    pendingRequests: state.pendingRequests.filter(item => item.id !== requestId),
    history: prepend(
      {
        ...(request || { id: requestId }),
        event: decision,
        decision,
        resolvedAt: new Date().toISOString()
      },
      state.history
    )
  };
  emit();
}

export function ingestGitResult(result) {
  state = {
    ...state,
    history: prepend({ ...result, event: "result", receivedAt: new Date().toISOString() }, state.history)
  };
  emit();
}

function upsertById(items, item) {
  const without = items.filter(existing => existing.id !== item.id);
  return [item, ...without].slice(0, 20);
}

function prepend(item, items) {
  return [item, ...items].slice(0, 50);
}

function emit() {
  listeners.forEach(listener => listener(state));
}

let bridgeRef = null;
const pendingRequests = new Map();

export const PUTER_WEBVIEW_HTML = `
<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script src="https://js.puter.com/v2/"></script>
  </head>
  <body>
    <script>
      function send(payload) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }

      async function waitForPuter() {
        for (let i = 0; i < 100; i += 1) {
          if (window.puter && window.puter.ai && window.puter.ai.chat) return;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw new Error("Puter.js did not load");
      }

      document.addEventListener("message", onMessage);
      window.addEventListener("message", onMessage);

      async function onMessage(event) {
        let payload;
        try {
          payload = JSON.parse(event.data);
        } catch (error) {
          send({ type: "puter_error", error: "Invalid bridge payload" });
          return;
        }

        if (!payload || payload.type !== "puter_chat") return;

        try {
          await waitForPuter();
          const response = await window.puter.ai.chat(payload.message);
          send({
            type: "puter_chat_result",
            id: payload.id,
            response: typeof response === "string" ? response : String(response ?? "")
          });
        } catch (error) {
          send({
            type: "puter_chat_error",
            id: payload.id,
            error: error && error.message ? error.message : "Unknown Puter.js error"
          });
        }
      }

      send({ type: "puter_ready" });
    </script>
  </body>
</html>
`;

export function initializePuterBridge(webViewRef) {
  bridgeRef = webViewRef;
}

export function handlePuterBridgeMessage(event) {
  let payload;

  try {
    payload = JSON.parse(event.nativeEvent?.data ?? event.data);
  } catch {
    return;
  }

  if (!payload?.id) return;

  const pending = pendingRequests.get(payload.id);
  if (!pending) return;

  if (payload.type === "puter_chat_result") {
    pendingRequests.delete(payload.id);
    pending.resolve(payload.response ?? "");
  }

  if (payload.type === "puter_chat_error") {
    pendingRequests.delete(payload.id);
    pending.reject(new Error(payload.error || "Puter bridge failed"));
  }
}

export function sendChatMessage(message, history = [], onToken) {
  if (!bridgeRef?.current) {
    return Promise.reject(new Error("Puter WebView bridge is not initialized"));
  }

  const id = `puter_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const prompt = buildPrompt(message, history);

  const promise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error("Puter request timed out"));
    }, 120000);

    pendingRequests.set(id, {
      resolve: response => {
        clearTimeout(timeout);
        if (typeof onToken === "function") {
          simulateTokens(response, onToken);
        }
        resolve(response);
      },
      reject: error => {
        clearTimeout(timeout);
        reject(error);
      }
    });
  });

  const payload = JSON.stringify({ type: "puter_chat", id, message: prompt });
  bridgeRef.current.postMessage(payload);

  return promise;
}

function buildPrompt(message, history) {
  const prior = history
    .slice(-12)
    .map(item => `${item.role}: ${item.content}`)
    .join("\n");

  return prior ? `${prior}\nuser: ${message}` : message;
}

function simulateTokens(text, onToken) {
  const chunks = String(text).match(/.{1,24}/g) ?? [];
  chunks.forEach(chunk => onToken(chunk));
}

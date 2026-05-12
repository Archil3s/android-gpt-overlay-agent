package puterbridge

import (
	"encoding/json"
	"errors"
	"sync"
	"time"

	"gap/internal/protocol"

	"github.com/gorilla/websocket"
)

var ErrBridgeUnavailable = errors.New("puter bridge is not connected")

type Bridge struct {
	mu      sync.Mutex
	conn    *websocket.Conn
	pending map[string]chan protocol.ChatBridgeResponse
}

func New() *Bridge {
	return &Bridge{pending: make(map[string]chan protocol.ChatBridgeResponse)}
}

func (b *Bridge) Attach(conn *websocket.Conn) {
	b.mu.Lock()
	if b.conn != nil {
		_ = b.conn.Close()
	}
	b.conn = conn
	b.mu.Unlock()
}

func (b *Bridge) Detach(conn *websocket.Conn) {
	b.mu.Lock()
	if b.conn == conn {
		b.conn = nil
	}
	b.mu.Unlock()
}

func (b *Bridge) Chat(message string) (string, error) {
	b.mu.Lock()
	conn := b.conn
	if conn == nil {
		b.mu.Unlock()
		return "", ErrBridgeUnavailable
	}

	id := time.Now().UTC().Format("20060102150405.000000000")
	responseCh := make(chan protocol.ChatBridgeResponse, 1)
	b.pending[id] = responseCh
	request := protocol.ChatBridgeRequest{Type: protocol.TypeChatRequest, ID: id, Message: message}
	payload, err := json.Marshal(request)
	if err != nil {
		delete(b.pending, id)
		b.mu.Unlock()
		return "", err
	}
	err = conn.WriteMessage(websocket.TextMessage, payload)
	b.mu.Unlock()

	if err != nil {
		b.mu.Lock()
		delete(b.pending, id)
		b.mu.Unlock()
		return "", err
	}

	select {
	case response := <-responseCh:
		if response.Error != "" {
			return "", errors.New(response.Error)
		}
		return response.Response, nil
	case <-time.After(2 * time.Minute):
		b.mu.Lock()
		delete(b.pending, id)
		b.mu.Unlock()
		return "", errors.New("puter bridge chat timed out")
	}
}

func (b *Bridge) HandleMessage(payload []byte) {
	var response protocol.ChatBridgeResponse
	if err := json.Unmarshal(payload, &response); err != nil {
		return
	}
	if response.Type != protocol.TypeChatResponse {
		return
	}

	b.mu.Lock()
	ch, ok := b.pending[response.ID]
	if ok {
		delete(b.pending, response.ID)
	}
	b.mu.Unlock()

	if ok {
		ch <- response
	}
}

func PageHTML() string {
	return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>GAP Puter Bridge</title>
  <script src="https://js.puter.com/v2/"></script>
  <style>
    body { background: #080808; color: #00FF88; font-family: monospace; padding: 24px; }
  </style>
</head>
<body>
  <h1>GAP Puter Bridge</h1>
  <p id="status">connecting</p>
  <script>
    const status = document.getElementById('status');
    const ws = new WebSocket('ws://127.0.0.1:3000/puter-ws');

    ws.onopen = () => {
      status.textContent = 'connected';
      ws.send(JSON.stringify({ type: 'puter_ready' }));
    };

    ws.onclose = () => { status.textContent = 'closed'; };
    ws.onerror = () => { status.textContent = 'error'; };

    ws.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      if (message.type !== 'chat_request') return;

      try {
        await waitForPuter();
        const response = await window.puter.ai.chat(message.message);
        ws.send(JSON.stringify({
          type: 'chat_response',
          id: message.id,
          response: typeof response === 'string' ? response : String(response ?? '')
        }));
      } catch (error) {
        ws.send(JSON.stringify({
          type: 'chat_response',
          id: message.id,
          response: '',
          error: error && error.message ? error.message : String(error)
        }));
      }
    };

    async function waitForPuter() {
      for (let i = 0; i < 100; i += 1) {
        if (window.puter && window.puter.ai && window.puter.ai.chat) return;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error('Puter.js did not load');
    }
  </script>
</body>
</html>`
}

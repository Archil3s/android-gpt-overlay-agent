# Android GPT Overlay Agent

Android overlay assistant with three core features:

1. Floating GPT chat bubble over Android apps.
2. Git push approval from phone before a laptop push proceeds.
3. Overnight laptop-side AI coding agent with phone approval before push.

## Architecture

- React Native Android app for overlay UI.
- Kotlin native module and Android service for `TYPE_APPLICATION_OVERLAY`.
- Puter.js browser bridge for GPT access without API keys.
- Node.js local server for git hook, WebSocket events, and agent status.
- Bash pre-push hook for local git approval flow.

## Important Puter.js note

Puter.js is browser-based:

```html
<script src="https://js.puter.com/v2/"></script>
```

The React Native app uses a WebView bridge rather than importing Puter.js as a Node or React Native package.

The laptop agent isolates AI access behind `chatWithAI()` so a browser bridge, Playwright bridge, or another approved local adapter can be added without changing agent logic.

## Project layout

```text
android/
  OverlayModule.kt
  OverlayService.kt

src/
  components/
    Bubble.jsx
    ChatPanel.jsx
    GitConfirm.jsx
    AgentStatus.jsx
  services/
    puter.js
    websocket.js
    notifications.js

agent/
  server.js
  agent.js
  gitHook.sh
```

## Design tokens

- Background: `#080808`
- Accent / approve: `#00FF88`
- Reject: `#FF6B6B`
- Pending: `#FFB800`
- Agent: `#A78BFA`
- Font: JetBrains Mono, monospace fallback

## Local setup

```bash
npm install
npm run agent:server
```

Install the git hook in a project you want protected:

```bash
cp agent/gitHook.sh /path/to/repo/.git/hooks/pre-push
chmod +x /path/to/repo/.git/hooks/pre-push
```

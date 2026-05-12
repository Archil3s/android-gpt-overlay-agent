# GAP Desktop Architecture

GAP is now desktop-first.

## Target

The overlay runs on the same desktop screen where the user is working. It is not primarily a phone companion app.

## Stack

- Flutter desktop: overlay UI, chat panel, approvals, live logs.
- Go: long-running runtime daemon, git hooks, agent orchestration, checks, commit and push.
- Puter.js: GPT access isolated behind a browser bridge because Puter.js is browser-based.

## Runtime flow

```text
User starts gapd
Flutter overlay connects to gapd over localhost WebSocket
Git hook posts pre-push request to gapd
Flutter overlay displays approval request
User approves or rejects locally
Go daemon responds to git hook
GPT agent reads repo context
Go daemon asks GPT via Puter bridge
GPT returns file replacement blocks
Go daemon writes files, runs checks, and asks overlay before commit/push
```

## Project layout

```text
apps/desktop_overlay/      Flutter desktop overlay app
cmd/gapd/                  Go daemon entry point
internal/approval/         approval request state and waiting
internal/agent/            GPT coding orchestration
internal/gitops/           git commands and repo summaries
internal/protocol/         shared JSON message types
internal/puterbridge/      GPT bridge interface and browser-backed implementation placeholder
legacy/react_native/       previous React Native/phone implementation, if preserved later
```

## Design rules

- GPT is the coding brain.
- Go is the orchestrator, not the model.
- No commit or push happens without explicit local approval.
- Puter.js stays behind a bridge boundary.
- Desktop overlay should be lightweight, always-on-top, draggable, and focused on action.

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const APPROVAL_TIMEOUT_MS = Number(process.env.APPROVAL_TIMEOUT_MS || 5 * 60 * 1000);
const SHARED_SECRET = process.env.AGENT_SHARED_SECRET || "";

function createServer() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  const server = http.createServer(app);
  const wss = new WebSocket.Server({ server });
  const clients = new Set();
  const pending = new Map();

  wss.on("connection", ws => {
    clients.add(ws);
    ws.send(JSON.stringify({ type: "connection_status", status: "connected" }));

    ws.on("message", raw => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ type: "error", error: "Invalid JSON" }));
        return;
      }

      if (message.type === "git_push_response") {
        resolveApproval(clients, pending, message.id, message.decision, "git_push_result");
        return;
      }

      if (message.type === "agent_push_response") {
        resolveApproval(clients, pending, message.id, message.decision, "agent_push_result");
      }
    });

    ws.on("close", () => clients.delete(ws));
  });

  app.post("/git/pre-push", requireSecret, async (req, res) => {
    const id = crypto.randomUUID();
    const request = {
      type: "git_push_request",
      id,
      branch: req.body.branch,
      filesChanged: req.body.filesChanged || [],
      commits: req.body.commits || [],
      repoPath: req.body.repoPath,
      timestamp: new Date().toISOString()
    };

    broadcast(clients, request);

    const approved = await waitForApproval(clients, pending, {
      id,
      resultType: "git_push_result",
      request
    });

    res.json({ approved });
  });

  app.post("/agent/status", requireSecret, (req, res) => {
    broadcast(clients, {
      type: "agent_status",
      ...req.body,
      timestamp: new Date().toISOString()
    });
    res.json({ ok: true });
  });

  app.post("/agent/push-request", requireSecret, async (req, res) => {
    const id = crypto.randomUUID();
    const request = {
      type: "agent_push_request",
      id,
      ...req.body,
      timestamp: new Date().toISOString()
    };

    broadcast(clients, request);

    const approved = await waitForApproval(clients, pending, {
      id,
      resultType: "agent_push_result",
      request
    });

    res.json({ approved });
  });

  function requireSecret(req, res, next) {
    if (!SHARED_SECRET) return next();
    if (req.header("x-agent-secret") === SHARED_SECRET) return next();
    res.status(401).json({ error: "Unauthorized" });
  }

  return { app, server, wss, clients, pending };
}

function waitForApproval(clients, pending, item) {
  return new Promise(resolve => {
    const timeout = setTimeout(() => {
      pending.delete(item.id);
      const result = buildResultMessage(item.resultType, item.id, "timeout", item.request);
      broadcast(clients, result);
      resolve(false);
    }, APPROVAL_TIMEOUT_MS);

    pending.set(item.id, {
      ...item,
      resolve,
      timeout
    });
  });
}

function resolveApproval(clients, pending, id, decision, resultType) {
  const item = pending.get(id);
  if (!item) {
    broadcast(clients, buildResultMessage(resultType, id, "missing"));
    return;
  }

  clearTimeout(item.timeout);
  pending.delete(id);

  const normalizedDecision = decision === "approve" ? "approved" : "rejected";
  broadcast(clients, buildResultMessage(item.resultType, id, normalizedDecision, item.request));
  item.resolve(normalizedDecision === "approved");
}

function buildResultMessage(type, id, decision, request = {}) {
  return {
    type,
    id,
    decision,
    approved: decision === "approved",
    branch: request.branch,
    repoPath: request.repoPath,
    goal: request.goal,
    summary: request.summary,
    completedAt: new Date().toISOString()
  };
}

function broadcast(clients, message) {
  const payload = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}

if (require.main === module) {
  const { server } = createServer();
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Agent server listening on http://0.0.0.0:${PORT}`);
  });
}

module.exports = { createServer, buildResultMessage };

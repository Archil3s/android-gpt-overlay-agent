const childProcess = require("child_process");
const path = require("path");

const SERVER_URL = process.env.AGENT_SERVER_URL || "http://localhost:3000";
const HTTP_TIMEOUT_MS = Number(process.env.AGENT_APPROVAL_HTTP_TIMEOUT_MS || 10 * 60 * 1000);

/**
 * Bridge for connecting an external multi-agent runner such as Eigent to the
 * existing phone approval server in this project.
 *
 * Eigent or another local orchestrator can call this module before it performs
 * a risky action such as pushing code, opening a PR, sending a message, or
 * running a destructive command. The bridge sends the request to the local
 * Node server, which forwards it to the Android/Flutter overlay client through
 * WebSocket.
 */
async function requestEigentApproval(options = {}) {
  const repoPath = path.resolve(options.repoPath || process.cwd());
  const snapshot = await collectGitSnapshot(repoPath);

  const payload = {
    source: "eigent",
    type: "eigent_approval_request",
    action: options.action || "agent_action",
    goal: options.goal || "Approve Eigent agent action",
    summary: options.summary || snapshot.summary,
    risk: options.risk || inferRisk(options.action),
    repoPath,
    branch: snapshot.branch,
    filesChanged: snapshot.filesChanged,
    commits: snapshot.commits,
    diffStat: snapshot.diffStat,
    diffPreview: snapshot.diffPreview,
    requestedAt: new Date().toISOString(),
    metadata: options.metadata || {}
  };

  const approved = await requestPhoneApproval(payload, options);
  return { approved, payload };
}

async function requestPhoneApproval(payload, options = {}) {
  const endpoint = `${normalizeServerUrl(options.serverUrl || SERVER_URL)}/agent/push-request`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || HTTP_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...secretHeader(options.sharedSecret)
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Approval server returned ${response.status}: ${body}`);
    }

    const json = await response.json();
    return Boolean(json.approved);
  } finally {
    clearTimeout(timeout);
  }
}

async function collectGitSnapshot(repoPath) {
  const [branch, filesChanged, commits, diffStat, diffPreview, status] = await Promise.all([
    run("git rev-parse --abbrev-ref HEAD", repoPath),
    run("git diff --name-only -- .", repoPath),
    run("git log --oneline -5", repoPath),
    run("git diff --stat -- .", repoPath),
    run("git diff -- .", repoPath),
    run("git status --short", repoPath)
  ]);

  const changedFromDiff = splitLines(filesChanged.output);
  const changedFromStatus = splitLines(status.output)
    .map(line => line.slice(3).trim())
    .filter(Boolean);

  const uniqueFiles = [...new Set([...changedFromDiff, ...changedFromStatus])];

  return {
    branch: branch.output || "unknown",
    filesChanged: uniqueFiles,
    commits: splitLines(commits.output),
    diffStat: diffStat.output || "No diff stat available",
    diffPreview: truncate(diffPreview.output || "No diff available", 20000),
    summary: buildFallbackSummary(uniqueFiles)
  };
}

function buildFallbackSummary(filesChanged) {
  if (!filesChanged.length) return "Eigent requests approval with no local file changes detected.";
  return `Eigent requests approval after changing ${filesChanged.length} file${filesChanged.length === 1 ? "" : "s"}.`;
}

function inferRisk(action = "") {
  const normalized = action.toLowerCase();
  if (["git_push", "open_pr", "delete_file", "send_email", "send_slack"].some(item => normalized.includes(item))) {
    return "high";
  }
  if (["commit", "install", "shell", "terminal"].some(item => normalized.includes(item))) {
    return "medium";
  }
  return "low";
}

function normalizeServerUrl(value) {
  return String(value || "http://localhost:3000").replace(/\/+$/, "");
}

function secretHeader(explicitSecret) {
  const secret = explicitSecret || process.env.AGENT_SHARED_SECRET;
  return secret ? { "x-agent-secret": secret } : {};
}

function splitLines(value) {
  return String(value || "")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
}

function truncate(value, limit) {
  const text = String(value || "");
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n\n--- Diff preview truncated at ${limit} characters ---`;
}

function run(command, cwd) {
  return new Promise(resolve => {
    childProcess.exec(command, { cwd, timeout: 30000 }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        output: `${stdout || ""}${stderr || ""}`.trim()
      });
    });
  });
}

function parseCliArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;

    const key = token.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }

  return args;
}

async function runCli() {
  const args = parseCliArgs(process.argv.slice(2));

  const result = await requestEigentApproval({
    action: args.action || "git_push",
    goal: args.goal || "Approve Eigent agent output",
    summary: args.summary,
    repoPath: args.repo || process.cwd(),
    risk: args.risk,
    serverUrl: args.server,
    sharedSecret: args.secret
  });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.approved ? "Approved by phone" : "Rejected or timed out");
  }

  process.exit(result.approved ? 0 : 1);
}

if (require.main === module) {
  runCli().catch(error => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = {
  requestEigentApproval,
  requestPhoneApproval,
  collectGitSnapshot,
  inferRisk,
  parseCliArgs
};

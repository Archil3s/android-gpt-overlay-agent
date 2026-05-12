const fs = require("fs/promises");
const path = require("path");
const childProcess = require("child_process");
const { chatWithPuter, closePuterBridge } = require("./puterBridge");

const SERVER_URL = process.env.AGENT_SERVER_URL || "http://localhost:3000";
const MAX_ITERATIONS = Number(process.env.AGENT_MAX_ITERATIONS || 5);
const AUTO_PUSH = process.env.AGENT_AUTO_PUSH === "true";

async function runAgent(goal, options = {}) {
  if (!goal) throw new Error("Goal string is required");

  const repoPath = options.repoPath || process.cwd();
  await postStatus("planning", goal, "Collecting repository context", [], repoPath);

  const context = await collectRepoContext(repoPath);
  const plan = await chatWithAI(buildPlanPrompt(goal, context));

  const logs = [`Plan received:\n${plan}`];

  try {
    for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration += 1) {
      await postStatus("editing", goal, `Iteration ${iteration}: asking GPT for code edits`, logs, repoPath);

      const latestContext = await collectRepoContext(repoPath);
      const editPrompt = buildEditPrompt(goal, latestContext, logs);
      const response = await chatWithAI(editPrompt);

      logs.push(`GPT edit response:\n${response}`);
      await applyPatchOrEdit(response, repoPath, logs);

      const diff = await getGitDiff(repoPath);
      logs.push(`Current diff:\n${diff.slice(0, 12000) || "No diff"}`);

      await postStatus("testing", goal, `Iteration ${iteration}: running checks`, logs, repoPath);
      const check = await runChecks(repoPath);

      logs.push(check.output);

      if (check.ok) {
        const summary = await buildChangeSummary(goal, repoPath, logs);
        logs.push(`Change summary:\n${summary}`);

        await postStatus("ready_to_push", goal, "Checks passed. Waiting for phone approval.", logs, repoPath);
        const approved = await requestPushApproval({ goal, repoPath, logs, summary });
        if (!approved) {
          await postStatus("idle", goal, "Push rejected by phone", logs, repoPath);
          return { ok: false, reason: "Push rejected" };
        }

        if (AUTO_PUSH) {
          await postStatus("pushing", goal, "Approved. Committing and pushing changes.", logs, repoPath);
          const pushResult = await commitAndPush(repoPath, summary, logs);
          await postStatus("done", goal, "Approved changes pushed.", logs, repoPath);
          return { ok: true, pushed: true, pushResult };
        }

        await postStatus("done", goal, "Approved. Auto-push disabled; changes are ready for manual push.", logs, repoPath);
        return { ok: true, pushed: false, reason: "AGENT_AUTO_PUSH is not true" };
      }

      logs.push("Checks failed. Sending failure output back to GPT for correction.");
    }

    await postStatus("failed", goal, "Max iterations reached", logs, repoPath);
    return { ok: false, reason: "Max iterations reached" };
  } finally {
    await closePuterBridge().catch(() => {});
  }
}

async function collectRepoContext(repoPath = process.cwd()) {
  const files = await listFiles(repoPath);
  const selected = files
    .filter(file => /\.(js|jsx|ts|tsx|kt|java|json|md|sh|gradle|xml)$/.test(file))
    .slice(0, 120);

  const entries = [];
  for (const file of selected) {
    const full = path.join(repoPath, file);
    const content = await fs.readFile(full, "utf8").catch(() => "");
    entries.push({ path: file, content: content.slice(0, 12000) });
  }

  return entries;
}

async function applyPatchOrEdit(aiResponse, repoPath, logs) {
  const edits = parseFileBlocks(aiResponse);

  if (!edits.length) {
    logs.push("No file blocks found in GPT response. No files changed.");
    return;
  }

  for (const edit of edits) {
    const targetPath = safeResolve(repoPath, edit.path);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, edit.content, "utf8");
    logs.push(`Wrote ${edit.path}`);
  }
}

function parseFileBlocks(text) {
  const edits = [];
  const pattern = /```(?:file:)?([^\n`]+)\n([\s\S]*?)```/g;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const filePath = match[1].trim();
    const content = match[2].replace(/\n$/, "");

    if (!filePath || filePath.includes("..") || path.isAbsolute(filePath)) continue;
    edits.push({ path: filePath, content });
  }

  return edits;
}

async function runChecks(repoPath) {
  const commands = getCheckCommands();
  let output = "";

  for (const command of commands) {
    const result = await run(command, repoPath);
    output += `\n$ ${command}\n${result.output}\n`;

    if (!result.ok) {
      return { ok: false, output };
    }
  }

  return { ok: true, output };
}

function getCheckCommands() {
  if (process.env.AGENT_CHECK_COMMANDS) {
    return process.env.AGENT_CHECK_COMMANDS.split("&&").map(command => command.trim()).filter(Boolean);
  }

  return ["npm test -- --watch=false", "npm run lint"];
}

async function buildChangeSummary(goal, repoPath, logs) {
  const diff = await getGitDiff(repoPath);
  if (!diff.trim()) return `No file changes for goal: ${goal}`;

  const prompt = [
    "Summarize these code changes as a concise git commit message.",
    "Return only one line, 72 characters or less if possible.",
    `Goal: ${goal}`,
    `Diff:\n${diff.slice(0, 16000)}`,
    `Logs:\n${logs.slice(-5).join("\n\n")}`
  ].join("\n\n");

  const summary = await chatWithAI(prompt);
  return sanitizeCommitMessage(summary) || `agent: implement ${goal}`;
}

async function commitAndPush(repoPath, commitMessage, logs) {
  const status = await run("git status --short", repoPath);
  logs.push(`Git status before commit:\n${status.output || "clean"}`);

  if (!status.output.trim()) {
    return { committed: false, pushed: false, reason: "No changes to commit" };
  }

  const add = await run("git add .", repoPath);
  logs.push(`git add:\n${add.output || "ok"}`);
  if (!add.ok) throw new Error(`git add failed: ${add.output}`);

  const commit = await run(`git commit -m ${shellQuote(commitMessage)}`, repoPath);
  logs.push(`git commit:\n${commit.output || "ok"}`);
  if (!commit.ok) throw new Error(`git commit failed: ${commit.output}`);

  const push = await run("git push", repoPath);
  logs.push(`git push:\n${push.output || "ok"}`);
  if (!push.ok) throw new Error(`git push failed: ${push.output}`);

  return { committed: true, pushed: true, message: commitMessage };
}

async function getGitDiff(repoPath) {
  const result = await run("git diff -- .", repoPath);
  return result.output || "";
}

async function requestPushApproval(payload) {
  const response = await fetch(`${SERVER_URL}/agent/push-request`, {
    method: "POST",
    headers: { "content-type": "application/json", ...secretHeader() },
    body: JSON.stringify(payload)
  });

  const json = await response.json();
  return Boolean(json.approved);
}

async function postStatus(status, goal, currentStep, logs, repoPath) {
  await fetch(`${SERVER_URL}/agent/status`, {
    method: "POST",
    headers: { "content-type": "application/json", ...secretHeader() },
    body: JSON.stringify({ status, goal, currentStep, logs, repoPath })
  }).catch(() => {});
}

async function chatWithAI(prompt) {
  return chatWithPuter(prompt);
}

function buildPlanPrompt(goal, context) {
  return [
    "You are GPT acting as the coding brain for a local orchestrator.",
    "The local agent can only read files, write complete file replacements, run checks, commit, and push after phone approval.",
    "Return a concise implementation plan first.",
    "When later asked for edits, return complete file replacement blocks only in this format:",
    "```file:relative/path.ext",
    "file contents",
    "```",
    `Goal:\n${goal}`,
    `Repo context:\n${formatContext(context)}`
  ].join("\n\n");
}

function buildEditPrompt(goal, context, logs) {
  return [
    "You are GPT generating code for a local orchestrator.",
    "Implement the requested goal using complete file replacement blocks only.",
    "The local orchestrator will write these files, run checks, and ask the phone before pushing.",
    "Do not include destructive shell commands.",
    "Do not delete directories.",
    "Use this exact output format for every changed file:",
    "```file:relative/path.ext",
    "file contents",
    "```",
    `Goal:\n${goal}`,
    `Context:\n${formatContext(context)}`,
    `Logs:\n${logs.join("\n\n")}`
  ].join("\n\n");
}

function formatContext(context) {
  return context.map(file => `--- ${file.path} ---\n${file.content}`).join("\n\n");
}

async function listFiles(dir, base = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];

  for (const entry of entries) {
    if (["node_modules", ".git", "build", "dist", ".gradle"].includes(entry.name)) continue;

    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await listFiles(full, base));
    else out.push(path.relative(base, full));
  }

  return out;
}

function safeResolve(repoPath, relativePath) {
  const targetPath = path.resolve(repoPath, relativePath);
  const root = path.resolve(repoPath);

  if (!targetPath.startsWith(root + path.sep)) {
    throw new Error(`Unsafe file path rejected: ${relativePath}`);
  }

  return targetPath;
}

function sanitizeCommitMessage(message) {
  return String(message || "")
    .split("\n")[0]
    .replace(/^['"`]+|['"`]+$/g, "")
    .replace(/[\r\n]/g, " ")
    .trim()
    .slice(0, 120);
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function run(command, cwd) {
  return new Promise(resolve => {
    childProcess.exec(command, { cwd, timeout: 120000 }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        output: `${stdout || ""}${stderr || ""}`.trim()
      });
    });
  });
}

function secretHeader() {
  return process.env.AGENT_SHARED_SECRET
    ? { "x-agent-secret": process.env.AGENT_SHARED_SECRET }
    : {};
}

if (require.main === module) {
  runAgent(process.argv.slice(2).join(" "))
    .then(result => {
      console.log(result);
      process.exit(result.ok ? 0 : 1);
    })
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  runAgent,
  collectRepoContext,
  applyPatchOrEdit,
  runChecks,
  requestPushApproval,
  commitAndPush,
  chatWithAI,
  parseFileBlocks
};

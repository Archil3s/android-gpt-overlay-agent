const fs = require("fs/promises");
const path = require("path");
const childProcess = require("child_process");

const SERVER_URL = process.env.AGENT_SERVER_URL || "http://localhost:3000";
const MAX_ITERATIONS = Number(process.env.AGENT_MAX_ITERATIONS || 5);

async function runAgent(goal, options = {}) {
  if (!goal) throw new Error("Goal string is required");

  const repoPath = options.repoPath || process.cwd();
  await postStatus("planning", goal, "Collecting repository context", [], repoPath);

  const context = await collectRepoContext(repoPath);
  const plan = await chatWithAI(buildPlanPrompt(goal, context));

  const logs = [`Plan received:\n${plan}`];

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration += 1) {
    await postStatus("editing", goal, `Iteration ${iteration}: applying changes`, logs, repoPath);

    const editPrompt = buildEditPrompt(goal, context, logs);
    const response = await chatWithAI(editPrompt);

    logs.push(`AI edit response:\n${response}`);
    await applyPatchOrEdit(response, repoPath, logs);

    await postStatus("testing", goal, `Iteration ${iteration}: running checks`, logs, repoPath);
    const check = await runChecks(repoPath);

    logs.push(check.output);

    if (check.ok) {
      await postStatus("ready_to_push", goal, "Checks passed. Waiting for push approval.", logs, repoPath);
      const approved = await requestPushApproval({ goal, repoPath, logs });
      if (!approved) {
        await postStatus("idle", goal, "Push rejected by phone", logs, repoPath);
        return { ok: false, reason: "Push rejected" };
      }
      await postStatus("done", goal, "Approved. Ready for manual push.", logs, repoPath);
      return { ok: true };
    }

    logs.push("Checks failed. Asking AI for correction.");
  }

  await postStatus("failed", goal, "Max iterations reached", logs, repoPath);
  return { ok: false, reason: "Max iterations reached" };
}

async function collectRepoContext(repoPath = process.cwd()) {
  const files = await listFiles(repoPath);
  const selected = files
    .filter(file => /\.(js|jsx|ts|tsx|kt|java|json|md|sh)$/.test(file))
    .slice(0, 80);

  const entries = [];
  for (const file of selected) {
    const full = path.join(repoPath, file);
    const content = await fs.readFile(full, "utf8").catch(() => "");
    entries.push({ path: file, content: content.slice(0, 12000) });
  }

  return entries;
}

async function applyPatchOrEdit(aiResponse, repoPath, logs) {
  logs.push("TODO: implement safe patch parser. No files changed by placeholder.");
  logs.push("Expected future format: fenced blocks with file paths and complete replacement content.");
}

async function runChecks(repoPath) {
  const commands = [
    "npm test -- --watch=false",
    "npm run lint"
  ];

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
  throw new Error(
    "Puter.js browser bridge is not implemented for Node yet. Add a Playwright/browser bridge here."
  );
}

function buildPlanPrompt(goal, context) {
  return `Goal:\n${goal}\n\nRepo context:\n${formatContext(context)}\n\nReturn an implementation plan.`;
}

function buildEditPrompt(goal, context, logs) {
  return `Goal:\n${goal}\n\nContext:\n${formatContext(context)}\n\nLogs:\n${logs.join("\n\n")}\n\nReturn safe code edits only.`;
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
  chatWithAI
};

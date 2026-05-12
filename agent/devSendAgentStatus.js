const SERVER_URL = process.env.AGENT_SERVER_URL || "http://localhost:3000";

async function main() {
  const statuses = [
    {
      status: "planning",
      goal: "Test overnight agent status flow",
      currentStep: "Reading project files",
      logs: ["Started dev status sender", "Collecting repo context"],
      repoPath: process.cwd()
    },
    {
      status: "testing",
      goal: "Test overnight agent status flow",
      currentStep: "Running checks",
      logs: ["GPT produced edits", "npm test running"],
      repoPath: process.cwd()
    }
  ];

  for (const status of statuses) {
    await post("/agent/status", status);
    console.log(`Sent ${status.status}`);
    await delay(1200);
  }

  const pushResponse = await post("/agent/push-request", {
    goal: "Test overnight agent status flow",
    repoPath: process.cwd(),
    summary: "dev: verify agent push approval",
    logs: ["Checks passed", "Waiting for phone approval"]
  });

  console.log(JSON.stringify(pushResponse, null, 2));
  process.exit(pushResponse.approved ? 0 : 1);
}

async function post(path, payload) {
  const response = await fetch(`${SERVER_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...secretHeader() },
    body: JSON.stringify(payload)
  });

  return response.json();
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function secretHeader() {
  return process.env.AGENT_SHARED_SECRET
    ? { "x-agent-secret": process.env.AGENT_SHARED_SECRET }
    : {};
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

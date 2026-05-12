const SERVER_URL = process.env.AGENT_SERVER_URL || "http://localhost:3000";

async function main() {
  const payload = {
    branch: process.env.DEV_BRANCH || "feature/test-approval-flow",
    repoPath: process.cwd(),
    filesChanged: [
      "src/components/ChatPanel.jsx",
      "src/services/websocket.js",
      "agent/server.js"
    ],
    commits: [
      "abc1234 feat: test git approval modal",
      "def5678 fix: verify approve reject response"
    ]
  };

  console.log("Sending test git push request to phone...");
  const response = await fetch(`${SERVER_URL}/git/pre-push`, {
    method: "POST",
    headers: { "content-type": "application/json", ...secretHeader() },
    body: JSON.stringify(payload)
  });

  const json = await response.json();
  console.log(JSON.stringify(json, null, 2));
  process.exit(json.approved ? 0 : 1);
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

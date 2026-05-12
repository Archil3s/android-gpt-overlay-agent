#!/usr/bin/env bash
set -euo pipefail

SERVER_URL="${GIT_APPROVAL_SERVER_URL:-http://localhost:3000/git/pre-push}"
SECRET="${AGENT_SHARED_SECRET:-}"

if ! command -v curl >/dev/null 2>&1; then
  echo "gitHook: curl is required"
  exit 1
fi

branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo detached)"
repo_path="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

remote_name="${1:-origin}"
remote_url="${2:-}"

stdin_payload="$(cat || true)"
files_changed=()
commits=()

while read -r local_ref local_sha remote_ref remote_sha; do
  [ -z "${local_ref:-}" ] && continue

  if [ "$remote_sha" = "0000000000000000000000000000000000000000" ]; then
    range="$local_sha"
  else
    range="$remote_sha..$local_sha"
  fi

  while IFS= read -r file; do
    [ -n "$file" ] && files_changed+=("$file")
  done < <(git diff --name-only "$range" 2>/dev/null || true)

  while IFS= read -r commit; do
    [ -n "$commit" ] && commits+=("$commit")
  done < <(git log --oneline "$range" 2>/dev/null || true)
done <<< "$stdin_payload"

json_escape_array() {
  printf '%s\n' "$@" | python3 -c 'import json,sys; print(json.dumps([line.rstrip("\n") for line in sys.stdin if line.rstrip("\n")]))'
}

files_json="$(json_escape_array "${files_changed[@]:-}")"
commits_json="$(json_escape_array "${commits[@]:-}")"

payload="$(cat <<JSON
{
  "branch": "$branch",
  "repoPath": "$repo_path",
  "remoteName": "$remote_name",
  "remoteUrl": "$remote_url",
  "filesChanged": $files_json,
  "commits": $commits_json
}
JSON
)"

headers=(-H "Content-Type: application/json")
if [ -n "$SECRET" ]; then
  headers+=(-H "x-agent-secret: $SECRET")
fi

response="$(curl -sS --max-time 310 -X POST "${headers[@]}" -d "$payload" "$SERVER_URL" || true)"

if echo "$response" | grep -q '"approved"[[:space:]]*:[[:space:]]*true'; then
  echo "gitHook: push approved"
  exit 0
fi

echo "gitHook: push rejected or approval unavailable"
echo "$response"
exit 1

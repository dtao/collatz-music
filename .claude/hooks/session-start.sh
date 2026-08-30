#!/bin/bash
set -euo pipefail

# Remote sessions start from a fresh clone, so any repo-local git identity is
# gone by the time work begins and commits fall back to the agent default.
# Restore it here so authorship stays correct without having to remember.
#
# Local checkouts are left alone: there, your own global git config already
# applies and should win.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

repo="${CLAUDE_PROJECT_DIR:-$(pwd)}"
git -C "$repo" config user.name "Dan Tao"
git -C "$repo" config user.email "daniel.tao@gmail.com"

echo "git identity set to $(git -C "$repo" config user.name) <$(git -C "$repo" config user.email)>"

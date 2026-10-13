"""Claude Code hook: send what Claude is doing to the Agents Farm server.

Claude Code runs this script on PreToolUse, PostToolUse and Stop, and
passes details as JSON on stdin. We turn that into our own event format
(see docs/events.md) and POST it to the server.

Rule number one: never get in Claude's way. Short timeout, ignore every
error, always exit with code 0.
"""

import json
import os
import shlex
import sys
import urllib.request
from datetime import datetime, timezone

SERVER = "http://127.0.0.1:8000/events"

# Claude Code hook name -> our phase
PHASES = {"PreToolUse": "start", "PostToolUse": "end"}

# Claude Code tool name -> our action (other tools are skipped)
ACTIONS = {
    "Read": "read",
    "Edit": "edit",
    "Write": "edit",
    "MultiEdit": "edit",
    "Bash": "command",
}

# Bash commands that only read a file, like "cat README.md"
READ_COMMANDS = {"cat", "head", "tail"}

# If a command has any of these, it is not a simple read: pipes, &&, ;,
# redirects (cat > file WRITES), wildcards, variables, sub-commands, new lines
SHELL_SIGNS = "|&;<>*?$`()\n"


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def relative_path(path, project_dir):
    """/Users/me/project/src/app.py -> src/app.py (None if outside the project)."""
    if not path:
        return None
    relative = os.path.relpath(path, project_dir)
    if relative.startswith(".."):
        return None
    return relative.replace(os.sep, "/")


def file_read_by(command, cwd, project_dir):
    """"cat README.md" -> "README.md". None unless it is clearly ONE simple
    read of ONE file in this project. When unsure, say None: the farmer
    then goes to the well, which is better than the wrong crop."""
    if any(sign in command for sign in SHELL_SIGNS):
        return None
    try:
        words = shlex.split(command)  # splits like the shell: "cat 'my file.md'" -> 2 words
    except ValueError:
        return None  # broken quotes
    if len(words) != 2 or words[0] not in READ_COMMANDS or words[1].startswith("-"):
        return None  # flags (head -n 5 x) or several files: skip
    path = os.path.join(cwd, words[1])
    if not os.path.isfile(path):
        return None
    return relative_path(path, project_dir)


def make_event(hook):
    """Turn Claude Code's hook JSON into our event, or None to skip it."""
    name = hook.get("hook_event_name")
    # Every Claude Code session has its own id, so each session gets its own farmer
    agent_id = hook.get("session_id") or "main"

    if name == "Stop":
        return {"agent_id": agent_id, "file": None, "action": "done",
                "phase": "end", "command": None, "time": now()}

    if name not in PHASES:
        return None
    action = ACTIONS.get(hook.get("tool_name"))
    if action is None:
        return None

    tool_input = hook.get("tool_input") or {}
    project_dir = os.environ.get("CLAUDE_PROJECT_DIR") or hook.get("cwd") or os.getcwd()
    file = None
    command = None
    if action == "command":
        command = tool_input.get("command") or ""
        file = file_read_by(command, hook.get("cwd") or project_dir, project_dir)
        if file is not None:
            action = "read"  # "cat README.md" is really a read of README.md
    else:
        file = relative_path(tool_input.get("file_path", ""), project_dir)
        if file is None:
            return None  # a file outside this project: not part of the farm

    return {"agent_id": agent_id, "file": file, "action": action,
            "phase": PHASES[name], "command": command, "time": now()}


def send(event):
    request = urllib.request.Request(
        SERVER,
        data=json.dumps(event).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    urllib.request.urlopen(request, timeout=1)


def main():
    try:
        event = make_event(json.load(sys.stdin))
        if event is not None:
            send(event)
    except Exception:
        pass  # server down, bad JSON, anything: Claude must keep working
    sys.exit(0)


if __name__ == "__main__":
    main()

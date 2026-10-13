# Agents Farm - Event Format

## Fields

- `agent_id` -> which farmer did the action: the Claude Code session id, like
  "3f2a9c1e-8b7d-4e5f-a1b2-c3d4e5f6a7b8". Every new id gets a new farmer, and
  the page shows a friendly name for it, like "Lina" (the ?demo uses "main", "sub-1"...)
- `file` -> the file the agent touched, like "src/app.py" (null if no file)
- `action` -> what the agent did (allowed: read, edit, command, done)
- `phase` -> "start" when the action begins, "end" when it finishes
- `command` -> the shell command, for action "command" (null otherwise). A simple
  "cat/head/tail <file>" is sent as action "read" of that file, with the command kept
- `time` -> when it happened, in ISO 8601 format like "2026-10-12T14:30:05Z" (UTC)

Added by the server (the hook does not send these; see server/danger.py):

- `danger` -> true if the event looks risky, like `rm -rf` or editing `.env`
- `reason` -> a short reason when `danger` is true, like "Deletes files for good" (null otherwise)

## Example 1: Claude starts reading app.py

```json
{
  "agent_id": "main",
  "file": "src/app.py",
  "action": "read",
  "phase": "start",
  "time": "2026-10-12T14:30:05Z"
}
```

## Example 2: Claude starts editing utils.py

```json
{
  "agent_id": "main",
  "file": "______",
  "action": "______",
  "phase": "start",
  "time": "2026-10-12T14:31:10Z"
}
```

## Example 3: Claude finishes running npm test

```json
{
  "agent_id": "main",
  "file": null,
  "action": "______",
  "phase": "______",
  "command": "______",
  "time": "2026-10-12T14:32:00Z"
}
```

## Example 4: Claude starts a risky command (as the server sends it to the page)

```json
{
  "agent_id": "3f2a9c1e-8b7d-4e5f-a1b2-c3d4e5f6a7b8",
  "file": null,
  "action": "command",
  "phase": "start",
  "command": "rm -rf build",
  "time": "2026-10-13T16:40:00Z",
  "danger": true,
  "reason": "Deletes files for good"
}
```

# Agents Farm - Event Format

## Fields

- `agent_id` -> which farmer did the action, like "main" or "sub-1"
- `file` -> the file the agent touched, like "src/app.py" (null if no file)
- `action` -> what the agent did (allowed: read, edit, command, done)
- `phase` -> "start" when the action begins, "end" when it finishes
- `time` -> when it happened, in ISO 8601 format like "2026-10-12T14:30:05Z"

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
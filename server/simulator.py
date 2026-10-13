import random
import time
from datetime import datetime, timezone

import httpx

SERVER = "http://127.0.0.1:8000/events"

FILES = ["src/app.py", "src/utils.py", "src/models.py", "tests/test_app.py", "README.md"]
COMMANDS = ["npm test", "pytest", "git status", "ls"]
ACTIONS = ["read", "edit", "command"]


def now():
    return datetime.now(timezone.utc).isoformat()


def send(event):
    httpx.post(SERVER, json=event)
    print("sent:", event["action"], event["phase"], event["file"] or event["command"])


while True:
    action = random.choice(ACTIONS)

    if action == "command":
        file = None
        command = random.choice(COMMANDS)
    else:
        file = random.choice(FILES)
        command = None

    event = {
        "agent_id": "main",
        "file": file,
        "action": action,
        "phase": "start",
        "command": command,
        "time": now(),
    }
    send(event)
    time.sleep(random.uniform(1, 3))

    event["phase"] = "end"
    event["time"] = now()
    send(event)
    time.sleep(1)
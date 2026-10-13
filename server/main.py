from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from typing import Literal
from pydantic import BaseModel

from server.danger import find_danger

app = FastAPI()

connections: list[WebSocket] = []

class Event(BaseModel):
    agent_id: str
    file: str | None = None
    action: Literal["read", "edit", "command", "done"]   # ← changed
    phase: Literal["start", "end"]                        # ← changed
    command: str | None = None
    time: str
    danger: bool = False       # set by the server, not the hook (see danger.py)
    reason: str | None = None  # why it is risky, like "Deletes files for good"

@app.get("/")
def home():
    return {"message": "Agents Farm server is running"}

@app.post("/events")
async def receive_event(event: Event):
    event.reason = find_danger(event)
    event.danger = event.reason is not None
    print(event)
    for ws in connections:
        await ws.send_json(event.model_dump())
    return {"status": "received"}

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    connections.append(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        connections.remove(ws)
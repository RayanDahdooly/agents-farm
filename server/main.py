from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from typing import Literal
from pydantic import BaseModel

app = FastAPI()

connections: list[WebSocket] = []

class Event(BaseModel):
    agent_id: str
    file: str | None = None
    action: str
    phase: str
    command: str | None = None
    time: str

@app.get("/")
def home():
    return {"message": "Agents Farm server is running"}

@app.post("/events")
async def receive_event(event: Event):
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
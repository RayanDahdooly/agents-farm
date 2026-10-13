from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

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
def receive_event(event: Event):
    print(event)
    return {"status": "received"}
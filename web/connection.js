// Agents Farm - talks to the FastAPI server and passes events to the farm

const SERVER_URL = "ws://127.0.0.1:8000/ws";

function connectToServer() {
  const ws = new WebSocket(SERVER_URL);

  ws.onopen = () => {
    setConnection("online");
  };

  ws.onmessage = (e) => {
    const event = JSON.parse(e.data);
    handleEvent(event);
  };

  ws.onclose = () => {
    setConnection("offline");
    setTimeout(connectToServer, 2000);
  };
}

function setConnection(text) {
  const element = document.getElementById("connection");
  element.textContent = text;
  element.className = text;
}
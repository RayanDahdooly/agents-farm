// Agents Farm - the farmers (agents): where they are, how they walk
// along the roads, and the log. Uses `layout` and drawing helpers from farm.js.
// For now a fake demo sends the events. Later the WebSocket will.

const WALK_SPEED = 4;        // tiles per second
const DEMO_INTERVAL = 2500;  // milliseconds between fake events
const MAX_LOG_LINES = 50;

// An agent's state is one of:
//   "home"       inside the house (not drawn)
//   "walking"    on the way to a crop
//   "working"    standing next to its crop
//   "going-home" on the way back to the house
function newAgent(id, sprite) {
  return {
    id,
    sprite,
    state: "home",
    col: layout.door.col, // position in farm tiles (can be 3.5 while walking)
    row: layout.door.row,
    plot: null,           // the crop it is working on, or null
    path: [],             // points still to walk to: [{ col, row }, ...]
    queue: [],            // events waiting until it finishes walking
  };
}

const agents = [
  newAgent("main", "farmer"),
  newAgent("sub-1", "farmer2"),
  newAgent("sub-2", "farmer"),
];

function countAgentsHome() {
  return agents.filter((agent) => agent.state === "home").length;
}

function findPlot(file) {
  for (const box of layout.fields) {
    for (const plot of box.plots) {
      if (plot.file === file) return plot;
    }
  }
  return null;
}

// ---------- Routes: lists of points that follow the roads ----------

// From where the agent is now, out to the main road
function routeToRoad(agent) {
  if (agent.plot === null) {
    return [{ col: layout.door.col, row: layout.roadRow }]; // out of the door
  }
  const gateCol = agent.plot.field.gateCol;
  return [
    { col: gateCol, row: agent.plot.row }, // onto the walkway
    { col: gateCol, row: layout.roadRow }, // through the gate, down to the road
  ];
}

function routeToPlot(agent, plot) {
  const gateCol = plot.field.gateCol;
  let route;
  if (agent.plot !== null && agent.plot.field === plot.field) {
    // Same field: just use the walkway, no need to leave
    route = [{ col: gateCol, row: agent.plot.row }];
  } else {
    route = [...routeToRoad(agent), { col: gateCol, row: layout.roadRow }];
  }
  route.push({ col: gateCol, row: plot.row });      // up the walkway
  route.push({ col: plot.standCol, row: plot.row }); // step next to the crop
  return route;
}

function routeHome(agent) {
  return [
    ...routeToRoad(agent),
    { col: layout.door.col, row: layout.roadRow },
    { col: layout.door.col, row: layout.door.row },
  ];
}

// ---------- Events ----------

// Every event (fake now, real later) comes in here
function handleEvent(event) {
  addLog(event);
  const agent = agents.find((a) => a.id === event.agent_id);
  if (agent) agent.queue.push(event);
}

// Act on the next waiting event. Only called when the agent is not walking.
function startNextEvent(agent) {
  const event = agent.queue.shift();

  if (event.action === "done") {
    if (agent.state !== "home") {
      agent.path = routeHome(agent);
      agent.plot = null;
      agent.state = "going-home";
    }
  } else if (event.file && event.phase === "start") {
    const plot = findPlot(event.file);
    if (plot === null || plot === agent.plot) return; // unknown file, or already there
    agent.path = routeToPlot(agent, plot);
    agent.plot = plot;
    agent.state = "walking";
  }
  updateStatus();
}

// ---------- Moving ----------

// Called every frame. `seconds` is the time since the last frame.
function updateAgents(seconds) {
  for (const agent of agents) {
    if (agent.path.length === 0) {
      if (agent.queue.length > 0) startNextEvent(agent);
      continue;
    }

    // Walk toward the next point on the path
    const target = agent.path[0];
    const dx = target.col - agent.col;
    const dy = target.row - agent.row;
    const distance = Math.hypot(dx, dy);
    const step = WALK_SPEED * seconds;

    if (distance <= step) {
      // Reached this point: snap to it and aim for the next one
      agent.col = target.col;
      agent.row = target.row;
      agent.path.shift();
      if (agent.path.length === 0) arrive(agent);
    } else {
      agent.col += (dx / distance) * step;
      agent.row += (dy / distance) * step;
    }
  }
}

function arrive(agent) {
  agent.state = agent.state === "going-home" ? "home" : "working";
  updateStatus();
}

function drawAgents() {
  for (const agent of agents) {
    if (agent.state === "home") continue; // inside the house, not visible
    drawTile(agent.sprite, agent.col + view.offsetCol, agent.row + view.offsetRow);
    drawText(agent.id, toX(agent.col + 0.5), toY(agent.row) - 2, 0.22, "center");
  }
}

// ---------- Status bar and log ----------

function updateStatus() {
  const out = agents.length - countAgentsHome();
  document.getElementById("farmer-count").textContent =
    agents.length + " farmers · " + out + " working";
}

function addLog(event) {
  const log = document.getElementById("log");
  document.getElementById("log-waiting")?.remove();

  const time = event.time.slice(11, 19); // "2026-10-13T14:30:05Z" -> "14:30:05"
  const what = event.file || event.command || "";
  const line = document.createElement("li");
  line.textContent = time + "  " + event.agent_id + " " + event.action + " " + what;
  log.prepend(line); // newest on top

  while (log.children.length > MAX_LOG_LINES) {
    log.lastElementChild.remove();
  }
}

// ---------- Fake demo ----------
// Same shape as the real events in docs/events.md (time is added when sent).

const DEMO_EVENTS = [
  { agent_id: "main",  file: "src/app.py",        action: "read",    phase: "start" },
  { agent_id: "sub-1", file: "tests/test_app.py", action: "read",    phase: "start" },
  { agent_id: "main",  file: "src/utils.py",      action: "edit",    phase: "start" },
  { agent_id: "sub-2", file: "README.md",         action: "read",    phase: "start" },
  { agent_id: "sub-1", file: null,                action: "command", phase: "start", command: "pytest" },
  { agent_id: "main",  file: "requirements.txt",  action: "edit",    phase: "start" },
  { agent_id: "sub-1", file: null,                action: "done",    phase: "end" },
  { agent_id: "sub-2", file: "README.md",         action: "edit",    phase: "start" },
  { agent_id: "main",  file: null,                action: "done",    phase: "end" },
  { agent_id: "sub-2", file: null,                action: "done",    phase: "end" },
];

function startDemo() {
  updateStatus();
  let i = 0;
  setInterval(() => {
    const event = { ...DEMO_EVENTS[i], time: new Date().toISOString() };
    handleEvent(event);
    i = (i + 1) % DEMO_EVENTS.length; // after the last one, start again
  }, DEMO_INTERVAL);
}

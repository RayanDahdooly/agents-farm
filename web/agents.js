// Agents Farm - the farmers (agents): where they are, how they walk
// along the roads, and the log. Uses `layout` and drawing helpers from farm.js.
// Events come from the server (connection.js), or from the fake demo with ?demo.

const WALK_SPEED = 4;        // tiles per second
const DEMO_INTERVAL = 2500;  // milliseconds between fake events
const MAX_LOG_LINES = 50;
const MAX_LOG_TEXT = 40;     // longer files/commands are cut, full text on hover

// An agent's state is one of:
//   "home"       inside the house (not drawn)
//   "walking"    on the way to a crop or the well
//   "working"    standing next to its crop, or at the well
//   "going-home" on the way back to the house
function newAgent(id, sprite) {
  return {
    id,
    sprite,
    state: "home",
    col: layout.door.col, // position in farm tiles (can be 3.5 while walking)
    row: layout.door.row,
    plot: null,           // the crop it is working on, or null
    atWell: false,        // true while it is at (or walking to) the well
    command: null,        // the command it runs at the well
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
  if (agent.atWell) {
    return [{ col: layout.well.col, row: layout.roadRow }]; // down the well's path
  }
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
  // Compare names, not objects: the layout (and its objects) is rebuilt when the farm grows
  if (agent.plot !== null && agent.plot.field.name === plot.field.name) {
    // Same field: just use the walkway, no need to leave
    route = [{ col: gateCol, row: agent.plot.row }];
  } else {
    route = [...routeToRoad(agent), { col: gateCol, row: layout.roadRow }];
  }
  route.push({ col: gateCol, row: plot.row });      // up the walkway
  route.push({ col: plot.standCol, row: plot.row }); // step next to the crop
  return route;
}

function routeToWell(agent) {
  const well = layout.well;
  return [
    ...routeToRoad(agent),
    { col: well.col, row: layout.roadRow },
    { col: well.col, row: well.standRow }, // up the path, just below the well
  ];
}

function routeHome(agent) {
  return [
    ...routeToRoad(agent),
    { col: layout.door.col, row: layout.roadRow },
    { col: layout.door.col, row: layout.door.row },
  ];
}

// ---------- Events ----------

// Every event (from the server, or the ?demo) comes in here
function handleEvent(event) {
  addLog(event);
  if (event.file) growFarm(event.file); // in farm.js: adds the file if it is new
  const agent = agents.find((a) => a.id === event.agent_id);
  if (agent) agent.queue.push(event);
}

// Act on the waiting events. Only called when the agent is not walking.
// Claude works much faster than a farmer walks, so many events can pile up.
// Only the newest one that means "go somewhere" matters: a file or a
// command being started, or "done". The farmer walks straight there and
// skips the rest.
function isMove(e) {
  return e.action === "done" || (e.phase === "start" && (e.file || e.action === "command"));
}

function startNextEvent(agent) {
  const moves = agent.queue.filter(isMove);
  agent.queue = [];
  if (moves.length === 0) return;
  const event = moves[moves.length - 1];

  // Each route is worked out BEFORE changing plot/atWell,
  // because the route starts from where the farmer is now.
  if (event.action === "done") {
    if (agent.state !== "home") {
      agent.path = routeHome(agent);
      agent.plot = null;
      agent.atWell = false;
      agent.command = null;
      agent.state = "going-home";
    }
  } else if (event.file) {
    const plot = findPlot(event.file);
    if (plot === null) return; // unknown file
    if (agent.plot !== null && agent.plot.file === plot.file) return; // already there
    agent.path = routeToPlot(agent, plot);
    agent.plot = plot;
    agent.atWell = false;
    agent.command = null;
    agent.state = "walking";
  } else {
    // A command: go to the well (if not there yet) and show the command above it
    agent.command = event.command || "";
    if (agent.atWell) return; // already there, only the text changes
    agent.path = routeToWell(agent);
    agent.plot = null;
    agent.atWell = true;
    agent.state = "walking";
  }
  updateStatus();
}

// The command shown above the well (one farmer's, if several are there)
function wellCommand() {
  const agent = agents.find((a) => a.atWell && a.command);
  return agent ? agent.command : null;
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

// "a very long command" -> "a very lo…" (never longer than `max` characters)
function shorten(text, max) {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function addLog(event) {
  const log = document.getElementById("log");
  document.getElementById("log-waiting")?.remove();

  // event.time is UTC ("...14:30:05Z"). new Date() reads it, and
  // toLocaleTimeString() shows it in this computer's time zone.
  const time = new Date(event.time).toLocaleTimeString([], { hour12: false });
  const what = (event.file || event.command || "").replace(/\s+/g, " "); // one line, even for multi-line commands
  const phase = event.phase === "start" ? "▶" : "✓"; // started or finished
  const line = document.createElement("li");
  line.textContent = time + " " + phase + " " + event.agent_id + " " + event.action + " " + shorten(what, MAX_LOG_TEXT);
  line.title = what; // the browser shows this as a tooltip on hover
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
  { agent_id: "main",  file: null,                action: "command", phase: "start", command: "python -m pytest tests/ -v --maxfail=1 && git status --short" },
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

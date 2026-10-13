// Agents Farm - the farmers (agents): where they are, how they walk
// along the roads, and the log. Uses `layout` and drawing helpers from farm.js.
// Events come from the server (connection.js), or from the fake demo with ?demo.

const WALK_SPEED = 4;        // tiles per second
const DEMO_INTERVAL = 2500;  // milliseconds between fake events
const MAX_LOG_LINES = 50;
const MAX_LOG_TEXT = 40;     // longer files/commands are cut, full text on hover
const ALERT_TIME = 8000;     // milliseconds the red ! stays above a farmer
const BUBBLE_TIME = 4000;    // milliseconds a speech bubble stays (learning mode)

// An agent's state is one of:
//   "home"       inside the house (not drawn)
//   "walking"    on the way to a crop or the well
//   "working"    standing next to its crop, or at the well
//   "going-home" on the way back to the house
function newAgent(id, name, sprite) {
  return {
    id,                   // Claude's session id: long, like "3f2a9c1e-..."
    name,                 // friendly name for the screen, like "Lina"
    sprite,
    state: "home",
    col: layout.door.col, // position in farm tiles (can be 3.5 while walking)
    row: layout.door.row,
    plot: null,           // the crop it is working on, or null
    atWell: false,        // true while it is at (or walking to) the well
    command: null,        // the command it runs at the well
    alertUntil: 0,        // show the red ! until this time (see ALERT_TIME)
    bubble: "",           // what it says in its speech bubble (learning mode)
    bubbleUntil: 0,       // show the bubble until this time (see BUBBLE_TIME)
    path: [],             // points still to walk to: [{ col, row }, ...]
    queue: [],            // events waiting until it finishes walking
  };
}

// Starts empty. Every new id (a new Claude Code session) adds a farmer,
// just like every new file adds a crop.
const agents = [];

const NAMES = [
  "Sami", "Lina", "Omar", "Noor", "Karim", "Yara", "Zaid", "Maya", "Rami", "Huda",
  "Fadi", "Dana", "Tariq", "Salma", "Jad", "Rana", "Hadi", "Mira", "Nabil", "Leen",
];

// A simple hash: turn the id into a number, then pick a name with it.
// Every character has a number code ("a" is 97). Mix them in one by one:
// times 31, plus the code. "% NAMES.length" keeps only the remainder after
// dividing by 20, so the result is always 0 to 19: a spot in the list.
// The same id always gives the same number, so the name survives a reload.
function nameFor(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) % NAMES.length;
  }
  return NAMES[hash];
}

// Find the farmer for this id, or create a new one at the house door
function getAgent(id) {
  let agent = agents.find((a) => a.id === id);
  if (agent) return agent;

  // Two sessions can land on the same name (1 in 20): add a number then
  let name = nameFor(id);
  const sameName = agents.filter((a) => a.name.split(" ")[0] === name).length;
  if (sameName > 0) name += " " + (sameName + 1);

  const sprite = agents.length % 2 === 0 ? "farmer" : "farmer2"; // take turns
  agent = newAgent(id, name, sprite);
  agents.push(agent);
  updateStatus();
  return agent;
}

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
  const agent = getAgent(event.agent_id); // a new id makes a new farmer
  addLog(event);
  if (event.file) growFarm(event.file); // in farm.js: adds the file if it is new
  agent.queue.push(event);
  // The server marked it as risky: show the red ! right away, even mid-walk
  if (event.danger && event.phase === "start") agent.alertUntil = performance.now() + ALERT_TIME;
  // Bubbles only for starts and "done": an "end" comes right after its
  // start, so "Finished ..." would replace the bubble before you can read it
  if (event.phase === "start" || event.action === "done") {
    agent.bubble = describe(event); // in learning.js
    agent.bubbleUntil = performance.now() + BUBBLE_TIME;
  }
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
    drawText(agent.name, toX(agent.col + 0.5), toY(agent.row) - 2, 0.22, "center");
    if (performance.now() < agent.alertUntil) {
      // The red ! goes just above the name
      drawTile("emote_exclamation", agent.col + view.offsetCol, agent.row - 1.25 + view.offsetRow);
    }
  }
}

// Speech bubbles go on top of everything, so draw() calls this last
function drawBubbles() {
  if (!isLearning()) return; // in learning.js
  const now = performance.now();
  for (const agent of agents) {
    if (agent.state === "home" || now >= agent.bubbleUntil) continue;
    // Leave room for the name, and for the red ! if it is showing
    const above = now < agent.alertUntil ? 1.3 : 0.3;
    drawBubble(agent.bubble, toX(agent.col + 0.5), toY(agent.row - above)); // in farm.js
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

  const line = document.createElement("li");
  line.event = event; // kept, so refreshLog() can rewrite the line later
  fillLogLine(line);
  log.prepend(line); // newest on top

  while (log.children.length > MAX_LOG_LINES) {
    log.lastElementChild.remove();
  }
}

// Write one log line, in plain English (learning mode) or technical
function fillLogLine(line) {
  const event = line.event;
  // event.time is UTC ("...14:30:05Z"). new Date() reads it, and
  // toLocaleTimeString() shows it in this computer's time zone.
  const time = new Date(event.time).toLocaleTimeString([], { hour12: false });
  const what = (event.file || event.command || "").replace(/\s+/g, " "); // one line, even for multi-line commands
  const technical = (event.action + " " + what).trim();
  const phase = event.phase === "start" ? "▶" : "✓"; // started or finished

  const name = getAgent(event.agent_id).name;
  const text = isLearning()
    ? name + ": " + shorten(describe(event), MAX_LOG_TEXT)
    : name + " " + event.action + " " + shorten(what, MAX_LOG_TEXT);
  line.textContent = time + " " + phase + " " + text;
  // The browser shows this as a tooltip on hover
  line.title = technical + "\nsession: " + event.agent_id;
  if (event.danger) {
    line.classList.add("danger"); // red, see style.css
    line.textContent += " ⚠ " + event.reason;
  }
}

// Called when learning mode is switched on or off
function refreshLog() {
  for (const line of document.querySelectorAll("#log li")) {
    if (line.event) fillLogLine(line);
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
  // In the demo there is no server, so danger and reason are written here by hand
  { agent_id: "sub-2", file: null,                action: "command", phase: "start", command: "rm -rf build", danger: true, reason: "Deletes files for good" },
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

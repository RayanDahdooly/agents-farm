// Agents Farm - builds the farm map and draws it on the canvas.
// Phase 4a v2: full-screen farm with a house, roads and big fields.
// Still fake data, no WebSocket yet.

const TILE = 16; // one tile in the art is 16 x 16 pixels

// Fake data: a field is a folder, a crop is a file in that folder.
const fields = [
  { name: "src/",   files: ["app.py", "utils.py"] },
  { name: "tests/", files: ["test_app.py"] },
  { name: "root",   files: ["README.md", "requirements.txt"] },
];

// ---------- Sizes, counted in tiles ----------

// Inside a field, from left to right:
// fence | crop + space | walkway (the gate) | crop + space | fence
const FIELD_WIDTH = 9;
const FIELD_GAP = 2;      // grass between two fields
const MIN_CROP_ROWS = 2;  // keeps fields big, even with only 1 file
const HOUSE_WIDTH = 5;
const HOUSE_HEIGHT = 4;

// The house, tile by tile (each name is a file in assets/)
const HOUSE_TILES = [
  ["house_roof_top_left", "house_roof_top", "house_roof_top", "house_roof_top", "house_roof_top_right"],
  ["house_roof_bottom_left", "house_roof_bottom", "house_roof_bottom", "house_roof_bottom", "house_roof_bottom_right"],
  ["house_wall_left", "house_window", "house_wall", "house_window", "house_wall_right"],
  ["house_wall_left", "house_wall", "house_door", "house_wall", "house_wall_right"],
];

// Every picture we use. Each name matches a file in web/assets/.
const IMAGE_NAMES = [
  "grass", "grass_tufts", "grass_flowers", "tree", "tree_round", "soil", "path", "sign",
  "fence_top_left", "fence_horizontal", "fence_top_right", "fence_left", "fence_right",
  "fence_bottom_left", "fence_bottom_right", "fence_gate_left", "fence_gate_right",
  "crop_carrot", "crop_turnip", "crop_corn", "crop_tomato", "crop_cabbage", "crop_wheat",
  "farmer", "farmer2",
  ...HOUSE_TILES.flat(),
];

const canvas = document.getElementById("farm-canvas");
const ctx = canvas.getContext("2d"); // ctx is the "pen" we draw with
let images = {};

// ---------- Crops ----------

// Pick a crop from the file name, so the file type is visible at a glance
function cropFor(fileName) {
  if (fileName.startsWith("test_")) return "crop_tomato";
  if (fileName.endsWith(".py")) return "crop_corn";
  if (fileName.endsWith(".md")) return "crop_cabbage";
  if (fileName.endsWith(".txt")) return "crop_wheat";
  if (fileName.endsWith(".js")) return "crop_turnip";
  return "crop_carrot";
}

// ---------- Layout: where everything goes ----------
// Positions are in "farm tiles": (0, 0) is the top-left corner of the farm.
// The farm never changes, so we work this out only once.

function computeLayout() {
  const width = fields.length * FIELD_WIDTH + (fields.length - 1) * FIELD_GAP;
  const houseLeft = Math.floor((width - HOUSE_WIDTH) / 2);
  const houseTop = 1;                     // row 0 is for the "inside" label
  const door = { col: houseLeft + 2, row: houseTop + HOUSE_HEIGHT - 1 };
  const roadRow = door.row + 2;           // one row of path, then the main road
  const fieldTop = roadRow + 2;           // one row of path up to each gate

  // Every field has the same height, so they line up
  let cropRows = MIN_CROP_ROWS;
  for (const field of fields) {
    cropRows = Math.max(cropRows, Math.ceil(field.files.length / 2));
  }
  // fence + walk row + (crop row + name row) for each crop row + fence
  const fieldHeight = 3 + cropRows * 2;

  const fieldBoxes = fields.map((field, i) => {
    const left = i * (FIELD_WIDTH + FIELD_GAP);
    const box = { name: field.name, left, top: fieldTop, height: fieldHeight, gateCol: left + 4, plots: [] };

    field.files.forEach((name, k) => {
      const onRight = k % 2 === 1;
      box.plots.push({
        name,
        file: field.name === "root" ? name : field.name + name, // full path, like "src/app.py"
        field: box,
        col: left + (onRight ? 6 : 2),
        row: fieldTop + 2 + Math.floor(k / 2) * 2,
        standCol: left + (onRight ? 5 : 3), // where a farmer stands to work on it
      });
    });
    return box;
  });

  return {
    width,
    height: fieldTop + fieldHeight,
    house: { left: houseLeft, top: houseTop },
    door,
    roadRow,
    fields: fieldBoxes,
  };
}

const layout = computeLayout();

// ---------- View: how big tiles are on screen ----------

const view = {
  size: 48,      // size of one tile on screen, in pixels
  cols: 0,       // how many tiles fit across the canvas
  rows: 0,       // how many tiles fit down the canvas
  offsetCol: 0,  // where the farm starts on screen (to center it)
  offsetRow: 0,
};

// ---------- The map ----------
// Two grids, one entry per tile on screen:
//   ground  -> what is on the floor (grass, path, soil)
//   objects -> what stands on top (fence, house, tree, crop), or null
let ground = [];
let objects = [];

function setGround(col, row, name) {
  const c = col + view.offsetCol;
  const r = row + view.offsetRow;
  if (r >= 0 && r < view.rows && c >= 0 && c < view.cols) ground[r][c] = name;
}

function setObject(col, row, name) {
  const c = col + view.offsetCol;
  const r = row + view.offsetRow;
  if (r >= 0 && r < view.rows && c >= 0 && c < view.cols) objects[r][c] = name;
}

function fenceTile(top, bottom, left, right) {
  if (top && left) return "fence_top_left";
  if (top && right) return "fence_top_right";
  if (bottom && left) return "fence_bottom_left";
  if (bottom && right) return "fence_bottom_right";
  if (top || bottom) return "fence_horizontal";
  if (left) return "fence_left";
  return "fence_right";
}

function buildField(box) {
  const right = box.left + FIELD_WIDTH - 1;
  const bottom = box.top + box.height - 1;

  for (let row = box.top; row <= bottom; row++) {
    for (let col = box.left; col <= right; col++) {
      const isTop = row === box.top;
      const isBottom = row === bottom;
      const isLeft = col === box.left;
      const isRight = col === right;
      if (isTop || isBottom || isLeft || isRight) {
        setObject(col, row, fenceTile(isTop, isBottom, isLeft, isRight));
      } else {
        setGround(col, row, "soil");
      }
    }
  }

  // The gate: a gap in the top fence, with a fence end on each side
  setObject(box.gateCol - 1, box.top, "fence_gate_left");
  setObject(box.gateCol, box.top, null);
  setObject(box.gateCol + 1, box.top, "fence_gate_right");

  setObject(box.left, box.top - 1, "sign");

  for (const plot of box.plots) {
    setObject(plot.col, plot.row, cropFor(plot.name));
  }
}

function buildHouse() {
  HOUSE_TILES.forEach((tileRow, r) => {
    tileRow.forEach((name, c) => {
      setObject(layout.house.left + c, layout.house.top + r, name);
    });
  });
}

function buildRoads() {
  const { door, roadRow } = layout;

  // From the door down to the main road
  for (let row = door.row + 1; row <= roadRow; row++) {
    setGround(door.col, row, "path");
  }

  // The main road, wide enough to reach the door and every gate
  const cols = [door.col, ...layout.fields.map((box) => box.gateCol)];
  for (let col = Math.min(...cols); col <= Math.max(...cols); col++) {
    setGround(col, roadRow, "path");
  }

  // From the main road up to each gate (the gate tile is path too)
  for (const box of layout.fields) {
    for (let row = roadRow + 1; row <= box.top; row++) {
      setGround(box.gateCol, row, "path");
    }
  }
}

// Flowers, tufts and trees. This runs LAST and only uses tiles that are
// still plain grass with nothing on them. That is why decorations can
// never end up under fences, paths or the house.
function addDecorations() {
  for (let r = 0; r < view.rows; r++) {
    for (let c = 0; c < view.cols; c++) {
      if (ground[r][c] !== "grass" || objects[r][c] !== null) continue;

      // Trees only outside the farm, with one free tile around it
      const col = c - view.offsetCol;
      const row = r - view.offsetRow;
      const nearFarm = col >= -1 && col <= layout.width && row >= -1 && row <= layout.height;

      // Simple math patterns, so the farm looks the same on every reload
      if (!nearFarm && (c * 5 + r * 3) % 7 === 0) {
        objects[r][c] = (c + r) % 2 === 0 ? "tree" : "tree_round";
      } else if ((c * 7 + r * 13) % 11 === 0) {
        ground[r][c] = "grass_flowers";
      } else if ((c * 7 + r * 13) % 11 === 5) {
        ground[r][c] = "grass_tufts";
      }
    }
  }
}

function buildMap() {
  // Start with plain grass and nothing on top
  ground = [];
  objects = [];
  for (let r = 0; r < view.rows; r++) {
    ground.push(new Array(view.cols).fill("grass"));
    objects.push(new Array(view.cols).fill(null));
  }

  buildRoads();
  layout.fields.forEach(buildField);
  buildHouse();
  addDecorations();
}

// ---------- Resizing ----------

// Called at the start and every time the window changes size
function resize() {
  const area = document.getElementById("farm");
  canvas.width = area.clientWidth;
  canvas.height = area.clientHeight;
  // Resizing the canvas resets this, so set it again every time
  ctx.imageSmoothingEnabled = false;

  // Pick the biggest whole zoom (1x to 4x) where the farm plus a border fits.
  // On very small screens, shrink below 1x instead.
  const fit = Math.min(
    canvas.width / ((layout.width + 2) * TILE),
    canvas.height / ((layout.height + 2) * TILE),
  );
  const zoom = fit >= 1 ? Math.min(4, Math.floor(fit)) : fit;

  view.size = TILE * zoom;
  view.cols = Math.ceil(canvas.width / view.size);
  view.rows = Math.ceil(canvas.height / view.size);
  view.offsetCol = Math.floor((view.cols - layout.width) / 2);
  view.offsetRow = Math.floor((view.rows - layout.height) / 2);

  buildMap();
}

// ---------- Drawing ----------

// Screen tile (col, row) -> pixels. Rounding keeps tiles from leaving thin gaps.
function drawTile(name, col, row) {
  const x = Math.round(col * view.size);
  const y = Math.round(row * view.size);
  const w = Math.round((col + 1) * view.size) - x;
  const h = Math.round((row + 1) * view.size) - y;
  ctx.drawImage(images[name], x, y, w, h);
}

// Farm tile -> pixel position on screen
function toX(col) {
  return (col + view.offsetCol) * view.size;
}

function toY(row) {
  return (row + view.offsetRow) * view.size;
}

// White text with a dark outline, easy to read on any background.
// The size is a fraction of a tile, so text grows with the zoom.
// maxWidth (optional) squeezes long text so it never gets wider than that.
function drawText(text, x, y, tileFraction, align, maxWidth) {
  const px = Math.max(9, Math.round(view.size * tileFraction));
  ctx.font = "bold " + px + "px monospace";
  ctx.textAlign = align;
  ctx.lineWidth = Math.max(2, px / 4);
  ctx.strokeStyle = "#2b2233";
  ctx.strokeText(text, x, y, maxWidth);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x, y, maxWidth);
}

function drawLabels() {
  for (const box of layout.fields) {
    drawText(box.name, toX(box.left + 1) + 4, toY(box.top - 1) + view.size * 0.65, 0.4, "left");
    for (const plot of box.plots) {
      drawText(plot.name, toX(plot.col + 0.5), toY(plot.row + 1) + view.size * 0.45, 0.26, "center", view.size * 2.8);
    }
  }

  // How many agents are inside the house (countAgentsHome is in agents.js)
  const house = layout.house;
  drawText("🏠 " + countAgentsHome() + " inside", toX(house.left + HOUSE_WIDTH / 2), toY(house.top) - view.size * 0.25, 0.4, "center");
}

// Draw one full picture, back to front:
// ground -> objects -> farmers -> text
function draw() {
  for (let r = 0; r < view.rows; r++) {
    for (let c = 0; c < view.cols; c++) {
      drawTile(ground[r][c], c, r);
    }
  }
  for (let r = 0; r < view.rows; r++) {
    for (let c = 0; c < view.cols; c++) {
      if (objects[r][c] !== null) drawTile(objects[r][c], c, r);
    }
  }
  drawAgents(); // in agents.js
  drawLabels();
}

// ---------- Starting up ----------

// Load one picture. Returns a Promise: a value that arrives later.
function loadImage(name) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load " + name));
    img.src = "assets/" + name + ".png";
  });
}

async function loadImages() {
  const loaded = {};
  for (const name of new Set(IMAGE_NAMES)) {
    loaded[name] = await loadImage(name);
  }
  return loaded;
}

// The animation loop: the browser calls frame() about 60 times a second
let lastTime = 0;
function frame(time) {
  const seconds = Math.min((time - lastTime) / 1000, 0.1); // time since last frame
  lastTime = time;
  updateAgents(seconds); // in agents.js
  draw();
  requestAnimationFrame(frame);
}

async function main() {
  images = await loadImages();
  resize();
  window.addEventListener("resize", resize);
  updateStatus(); // in agents.js

  // Add ?demo to the URL (localhost:5500/?demo) to see fake events without the server
  const isDemo = new URLSearchParams(window.location.search).has("demo");
  if (isDemo) {
    setConnection("demo"); // in connection.js
    startDemo();           // in agents.js
  } else {
    connectToServer();     // in connection.js
  }
  requestAnimationFrame(frame);
}

// Wait until the whole page (and agents.js) has loaded, then start
window.addEventListener("load", main);
